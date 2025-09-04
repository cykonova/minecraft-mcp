#!/usr/bin/env node

// Import reflect-metadata FIRST for TSyringe
import 'reflect-metadata';

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { BotManager } from './botManager.js';
import { registerSkills } from './registerSkills.js';
import { registerTools } from './registerTools.js';
import { Command } from 'commander';
import { configureContainer, getContainer } from './container.js';
import { isContainerReady } from './config/container.js';
import { TOKENS } from './config/tokens.js';

// Setup command line arguments
const program = new Command();
program
  .option('-t, --transport <type>', 'Transport type: stdio (default) or sse', 'stdio')
  .option('-p, --port <port>', 'SSE server port (SSE mode only)', '3000')
  .option('--host <host>', 'Default Minecraft server host')
  .option('--mc-port <port>', 'Default Minecraft server port')
  .option('--api-key <key>', 'API key for authentication (SSE mode only)')
  .option('--api-key-file <file>', 'File containing API key (SSE mode only)')
  .option('--ssl-cert <file>', 'SSL certificate file for HTTPS (SSE mode only)')
  .option('--ssl-key <file>', 'SSL key file for HTTPS (SSE mode only)')
  .option('--bind <address>', 'Bind address for SSE (default: localhost, use 0.0.0.0 for all interfaces)')
  .parse(process.argv);

const options = program.opts();
const transportType = options.transport.toLowerCase();

// Configure dependency injection
configureContainer();

// Verify container is ready
if (!isContainerReady()) {
  process.stderr.write('[MCP] Container configuration failed\n');
  process.exit(1);
}

// Initialize bot manager
const botManager = new BotManager(
  options.host,
  options.mcPort ? parseInt(options.mcPort, 10) : undefined
);

// Get container and inject services
const container = getContainer();
botManager.injectServices(
  container.resolve(TOKENS.PathfindingService),
  container.resolve(TOKENS.MovementService),
  container.resolve(TOKENS.InventoryService),
  container.resolve(TOKENS.BlockInteractionService),
  container.resolve(TOKENS.CombatService)
);

// Create MCP server
const mcpServer = new Server(
  {
    name: 'minecraft-mcp-server',
    version: '0.2.21',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Add debug logging for all requests/responses
const debugMode = process.env.DEBUG === 'true' || process.argv.includes('--debug');
if (debugMode) {
  process.stderr.write('[DEBUG] Debug mode enabled\n');
  
  // Wrap the server's message handling to log all messages
  const originalConnect = mcpServer.connect.bind(mcpServer);
  mcpServer.connect = async (transport: any) => {
    process.stderr.write('[DEBUG] Client connecting via transport\n');
    
    // Intercept transport messages for debugging
    const originalSend = transport.send?.bind(transport);
    const originalReceive = transport.receive?.bind(transport);
    
    if (originalSend) {
      transport.send = async (message: any) => {
        process.stderr.write(`[DEBUG] Sending: ${JSON.stringify(message)}\n`);
        return originalSend(message);
      };
    }
    
    if (originalReceive) {
      transport.receive = async () => {
        const message = await originalReceive();
        process.stderr.write(`[DEBUG] Received: ${JSON.stringify(message)}\n`);
        return message;
      };
    }
    
    return originalConnect(transport);
  };
}

// Initialize and register tools and skills
async function initializeServer() {
  await registerSkills(mcpServer, botManager);
  registerTools(mcpServer, botManager);
}

// Setup error handling
mcpServer.onerror = (error) => {
  process.stderr.write(`[MCP Error] ${error}\n`);
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  process.stderr.write('\n🛑 Shutting down MCP server...\n');
  
  if (transportType === 'sse' && activeSessions) {
    // Close all active SSE sessions
    for (const [sessionId, transport] of activeSessions) {
      await transport.close();
    }
  }
  
  await botManager.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await botManager.disconnectAll();
  process.exit(0);
});

// Transport-specific variables
let activeSessions: Map<string, SSEServerTransport> | undefined;
let apiKey: string | undefined;
let bindAddress: string = 'localhost';

// STDIO Transport Mode
if (transportType === 'stdio') {
  // Initialize and start stdio transport
  async function startStdio() {
    await initializeServer();
    
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    
    // Write startup info to stderr for stdio mode
    process.stderr.write('🚀 Minecraft MCP Server (stdio) running\n');
    process.stderr.write('\n⚙️  Configuration:\n');
    
    if (options.host) {
      process.stderr.write(`  Default Minecraft server: ${options.host}:${options.mcPort || 25565}\n`);
    } else {
      process.stderr.write('  No default Minecraft server (specify per bot)\n');
    }
    
    const skillsCount = (botManager as any).skillRegistry ? 
      (botManager as any).skillRegistry.getAllSkills().length : 0;
    process.stderr.write(`  Loaded ${skillsCount} skills\n\n`);
  }
  
  startStdio().catch((error) => {
    process.stderr.write(`Failed to start stdio server: ${error}\n`);
    process.exit(1);
  });
}
// SSE Transport Mode
else if (transportType === 'sse') {
  const ssePort = parseInt(options.port, 10);
  bindAddress = options.bind || 'localhost';
  
  // Load API key from file or command line
  if (options.apiKeyFile) {
    try {
      apiKey = fs.readFileSync(options.apiKeyFile, 'utf-8').trim();
    } catch (error) {
      process.stderr.write(`Failed to read API key file: ${error}\n`);
      process.exit(1);
    }
  } else if (options.apiKey) {
    apiKey = options.apiKey;
  } else if (process.env.MCP_API_KEY) {
    apiKey = process.env.MCP_API_KEY;
  }
  
  // Generate a random API key if none provided and we're binding to external interfaces
  if (!apiKey && bindAddress !== 'localhost' && bindAddress !== '127.0.0.1') {
    apiKey = crypto.randomBytes(32).toString('hex');
    process.stderr.write(`\n⚠️  WARNING: No API key provided for external access!\n`);
    process.stderr.write(`Generated temporary API key: ${apiKey}\n`);
    process.stderr.write(`Save this key securely and provide it via --api-key or MCP_API_KEY env var\n\n`);
  }
  
  // Store active SSE sessions
  activeSessions = new Map<string, SSEServerTransport>();
  
  // Authentication check
  function checkAuth(req: http.IncomingMessage): boolean {
    const parsedUrl = url.parse(req.url || '', true);
    
    // Skip auth for localhost connections if no API key is set
    if (!apiKey && (bindAddress === 'localhost' || bindAddress === '127.0.0.1')) {
      return true;
    }
    
    // Check for API key in various places
    const providedKey = 
      req.headers['x-api-key'] || 
      req.headers['authorization']?.replace('Bearer ', '') ||
      parsedUrl.query.apiKey ||
      parsedUrl.query.api_key;
    
    return providedKey === apiKey;
  }
  
  // CORS headers
  function setCorsHeaders(res: http.ServerResponse, origin?: string) {
    // Allow requests with no origin or with API key
    if (apiKey || !origin) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else {
      // Only allow local origins without API key
      if (origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // Create HTTP request handler
  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname;
    const origin = req.headers.origin as string | undefined;
    
    // Set CORS headers
    setCorsHeaders(res, origin);
    
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Health check endpoint (no auth required)
    if (pathname === '/health' && req.method === 'GET') {
      const skillsCount = (botManager as any).skillRegistry ? 
        (botManager as any).skillRegistry.getAllSkills().length : 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        skills: skillsCount,
        authenticated: !!apiKey,
        sessions: activeSessions!.size
      }));
      return;
    }
    
    // Check authentication for other endpoints
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    
    // SSE endpoint
    if (pathname === '/sse' && req.method === 'GET') {
      // Don't set headers here - SSEServerTransport will handle them
      // Create SSE transport - pass response directly
      const transport = new SSEServerTransport('/messages', res as any);
      
      // Store the session
      activeSessions!.set(transport.sessionId, transport);
      
      // Connect the transport to the server (this will call transport.start() which sets headers)
      await mcpServer.connect(transport);
      
      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(':ping\n\n');
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
      
      // Handle client disconnect
      req.on('close', () => {
        clearInterval(pingInterval);
        activeSessions!.delete(transport.sessionId);
        transport.close();
      });
      return;
    }
    
    // Messages endpoint
    if (pathname === '/messages' && req.method === 'POST') {
      const sessionId = parsedUrl.query.sessionId as string;
      
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId' }));
        return;
      }
      
      const transport = activeSessions!.get(sessionId);
      
      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
      
      try {
        // Pass the request to the transport's message handler
        // The transport will handle reading the body stream
        await transport.handlePostMessage(req as any, res as any);
      } catch (error) {
        process.stderr.write(`[MCP Error] Message handler error: ${error}\n`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        if (error instanceof Error) {
          res.end(JSON.stringify({ error: error.message }));
        } else {
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
      return;
    }
    
    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  };
  
  // Start the server
  async function startSSEServer() {
    // Initialize skills before starting
    await initializeServer();
    
    let server: http.Server | https.Server;
    
    if (options.sslCert && options.sslKey) {
      // HTTPS server
      try {
        const httpsOptions = {
          cert: fs.readFileSync(options.sslCert),
          key: fs.readFileSync(options.sslKey)
        };
        server = https.createServer(httpsOptions, requestHandler);
      } catch (error) {
        process.stderr.write(`Failed to load SSL certificates: ${error}\n`);
        process.exit(1);
      }
    } else {
      // HTTP server
      server = http.createServer(requestHandler);
    }
    
    server.listen(ssePort, bindAddress, () => {
      const protocol = options.sslCert && options.sslKey ? 'https' : 'http';
      const baseUrl = `${protocol}://${bindAddress}:${ssePort}`;
      const skillsCount = (botManager as any).skillRegistry ? 
        (botManager as any).skillRegistry.getAllSkills().length : 0;
      
      // Write startup info to stderr
      process.stderr.write(`\n🚀 Minecraft MCP Server (SSE) running\n`);
      process.stderr.write(`📡 SSE endpoint: ${baseUrl}/sse\n`);
      process.stderr.write(`💬 Messages endpoint: ${baseUrl}/messages\n`);
      process.stderr.write(`🏥 Health check: ${baseUrl}/health\n`);
      process.stderr.write(`\n🔒 Security:\n`);
      
      if (apiKey) {
        process.stderr.write(`  Authentication: ENABLED (API key required)\n`);
        if (protocol === 'https') {
          process.stderr.write(`  Transport: HTTPS (encrypted)\n`);
        } else {
          process.stderr.write(`  Transport: HTTP (⚠️  not encrypted - use HTTPS for production)\n`);
        }
      } else {
        process.stderr.write(`  Authentication: DISABLED (⚠️  localhost only)\n`);
      }
      
      process.stderr.write(`  Bind address: ${bindAddress}\n`);
      process.stderr.write(`\n⚙️  Configuration:\n`);
      
      if (options.host) {
        process.stderr.write(`  Default Minecraft server: ${options.host}:${options.mcPort || 25565}\n`);
      } else {
        process.stderr.write('  No default Minecraft server (specify per bot)\n');
      }
      
      process.stderr.write(`  Loaded ${skillsCount} skills\n\n`);
      
      // Write client configuration example
      if (apiKey) {
        process.stderr.write(`Client configuration for Claude Desktop:\n`);
        process.stderr.write(JSON.stringify({
          mcpServers: {
            "minecraft-remote": {
              command: "node",
              args: ["dist/mcp-client-proxy.js"],
              env: {
                MCP_SERVER_URL: `${baseUrl}/sse`,
                MCP_API_KEY: apiKey
              }
            }
          }
        }, null, 2));
        process.stderr.write(`\n`);
      }
    });
  }
  
  // Start the SSE server
  startSSEServer().catch(error => {
    process.stderr.write(`Failed to start SSE server: ${error}\n`);
    process.exit(1);
  });
} else {
  process.stderr.write(`Invalid transport type: ${transportType}\n`);
  process.stderr.write(`Use --transport stdio (default) or --transport sse\n`);
  process.exit(1);
}