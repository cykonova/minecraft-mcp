#!/usr/bin/env node

// Import reflect-metadata FIRST for TSyringe
import 'reflect-metadata';

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { BotManager } from './botManager.js';
import { registerSkills } from './registerSkills.js';
import { registerTools } from './registerTools.js';
import { Command } from 'commander';
import { configureContainer, getContainer } from './container.js';
import { isContainerReady } from './config/container.js';
import { TOKENS } from './config/tokens.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';

// Setup command line arguments
const program = new Command();
program
  .option('-p, --port <port>', 'SSE server port', '3000')
  .option('--host <host>', 'Default Minecraft server host')
  .option('--mc-port <port>', 'Default Minecraft server port')
  .option('--api-key <key>', 'API key for authentication')
  .option('--api-key-file <file>', 'File containing API key')
  .option('--ssl-cert <file>', 'SSL certificate file for HTTPS')
  .option('--ssl-key <file>', 'SSL key file for HTTPS')
  .option('--bind <address>', 'Bind address (default: localhost, use 0.0.0.0 for all interfaces)')
  .parse(process.argv);

const options = program.opts();
const ssePort = parseInt(options.port, 10);
const bindAddress = options.bind || 'localhost';

// Load API key from file or command line
let apiKey: string | undefined;
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

// Authentication middleware
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Skip auth for localhost connections if no API key is set
  if (!apiKey && (bindAddress === 'localhost' || bindAddress === '127.0.0.1')) {
    return next();
  }
  
  // Check for API key in various places
  const providedKey = 
    req.headers['x-api-key'] || 
    req.headers['authorization']?.replace('Bearer ', '') ||
    req.query.apiKey;
  
  if (!providedKey || providedKey !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  next();
}

// Create Express app for SSE
const app = express();

// Configure CORS for remote access
const corsOptions = {
  origin: (origin: any, callback: any) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // For production, you might want to whitelist specific origins
    // For now, allow all origins if API key is set
    if (apiKey) {
      callback(null, true);
    } else {
      // Only allow local origins without API key
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

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

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
  const skillsCount = (botManager as any).skillRegistry ? 
    (botManager as any).skillRegistry.getAllSkills().length : 0;
  res.json({ 
    status: 'ok', 
    skills: skillsCount,
    authenticated: !!apiKey,
    sessions: activeSessions.size
  });
});

// Create MCP server with SSE transport
const server = new Server(
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

// Initialize and register tools and skills
async function initializeServer() {
  await registerSkills(server, botManager);
  registerTools(server, botManager);
}

// Setup error handling - use stderr for debugging
server.onerror = (error) => {
  process.stderr.write(`[MCP Error] ${error}\n`);
};

// Store active SSE sessions
const activeSessions = new Map<string, SSEServerTransport>();

// SSE endpoint for MCP (requires auth)
app.get('/sse', authenticate, async (req, res) => {
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  
  // Create SSE transport
  const transport = new SSEServerTransport('/messages', res);
  
  // Store the session
  activeSessions.set(transport.sessionId, transport);
  
  // Connect the transport to the server
  await server.connect(transport);
  
  // Start the SSE stream
  await transport.start();
  
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
    activeSessions.delete(transport.sessionId);
    transport.close();
  });
});

// Messages endpoint for SSE transport (requires auth)
app.post('/messages', authenticate, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  
  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId' });
    return;
  }
  
  const transport = activeSessions.get(sessionId);
  
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  try {
    // Pass the request to the transport's message handler
    await transport.handlePostMessage(req, res);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the HTTP/HTTPS server
let httpServer: any;

if (options.sslCert && options.sslKey) {
  // HTTPS server
  try {
    const httpsOptions = {
      cert: fs.readFileSync(options.sslCert),
      key: fs.readFileSync(options.sslKey)
    };
    httpServer = https.createServer(httpsOptions, app);
    httpServer.listen(ssePort, bindAddress, async () => {
      await startupSequence('https');
    });
  } catch (error) {
    process.stderr.write(`Failed to load SSL certificates: ${error}\n`);
    process.exit(1);
  }
} else {
  // HTTP server
  httpServer = app.listen(ssePort, bindAddress, async () => {
    await startupSequence('http');
  });
}

async function startupSequence(protocol: string) {
  // Initialize skills before starting
  await initializeServer();
  
  const skillsCount = (botManager as any).skillRegistry ? 
    (botManager as any).skillRegistry.getAllSkills().length : 0;
  
  // Write startup info to stderr
  const baseUrl = `${protocol}://${bindAddress}:${ssePort}`;
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
          args: ["dist/mcp-client-proxy.js"],  // You'll need a proxy script
          env: {
            MCP_SERVER_URL: `${baseUrl}/sse`,
            MCP_API_KEY: apiKey
          },
          transport: "sse",
          url: "http://localhost:3001/sse"  // Local proxy
        }
      }
    }, null, 2));
    process.stderr.write(`\n`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  process.stderr.write('\n🛑 Shutting down MCP SSE server...\n');
  
  // Close all active sessions
  for (const [sessionId, transport] of activeSessions) {
    await transport.close();
  }
  
  await botManager.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await botManager.disconnectAll();
  process.exit(0);
});