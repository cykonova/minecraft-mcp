#!/usr/bin/env node

/**
 * MCP Client Proxy - stdio to SSE bridge
 * 
 * This proxy runs locally and bridges stdio communication from Claude Desktop
 * to a remote MCP SSE server with authentication.
 */

// Polyfill EventSource for Node.js
import { EventSource } from 'eventsource';
(global as any).EventSource = EventSource;

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Get configuration from environment
const remoteServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3010/sse';
const apiKey = process.env.MCP_API_KEY;

if (!apiKey) {
  process.stderr.write('Error: MCP_API_KEY environment variable is required\n');
  process.exit(1);
}

// Parse remote URL to build proper SSE endpoint
const remoteUrl = new URL(remoteServerUrl);
if (!remoteUrl.pathname.endsWith('/sse')) {
  remoteUrl.pathname = remoteUrl.pathname.replace(/\/$/, '') + '/sse';
}

// Add API key to the URL as query parameter since SSEClientTransport doesn't support headers
remoteUrl.searchParams.set('apiKey', apiKey);

// Monkey-patch fetch to add API key to messages endpoint
const originalFetch = global.fetch || require('node-fetch');
(global as any).fetch = async (url: string | URL | Request, init?: RequestInit) => {
  // If it's a POST to a messages endpoint, add the API key
  if (init?.method === 'POST' && url.toString().includes('/messages')) {
    const urlObj = new URL(url.toString());
    // Add API key if not present
    if (!urlObj.searchParams.has('apiKey')) {
      urlObj.searchParams.set('apiKey', apiKey);
    }
    return originalFetch(urlObj.toString(), init);
  }
  return originalFetch(url, init);
};

// Prevent multiple instances with file lock
const lockFile = path.join(os.tmpdir(), 'mcp-proxy.lock');
let isInitialized = false;

async function acquireLock(): Promise<boolean> {
  try {
    // Try to create lock file exclusively
    fs.writeFileSync(lockFile, process.pid.toString(), { flag: 'wx' });
    
    // Clean up lock on exit
    process.on('exit', () => {
      try {
        fs.unlinkSync(lockFile);
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
    
    return true;
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      // Lock file exists, check if process is still running
      try {
        const pid = parseInt(fs.readFileSync(lockFile, 'utf-8'));
        // Check if process is alive
        try {
          process.kill(pid, 0); // Signal 0 tests if process exists
          return false; // Process is still running
        } catch {
          // Process is dead, remove stale lock
          fs.unlinkSync(lockFile);
          return acquireLock(); // Try again
        }
      } catch {
        // Can't read lock file, remove it
        try {
          fs.unlinkSync(lockFile);
        } catch {}
        return acquireLock(); // Try again
      }
    }
    return false;
  }
}

async function main() {
  // Log process info for debugging
  process.stderr.write(`[PID ${process.pid}] Starting proxy...\n`);
  
  // Add a small random delay to reduce race conditions
  const delay = Math.random() * 100; // 0-100ms random delay
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Check if we should be primary or secondary
  const isPrimary = await acquireLock();
  
  if (!isPrimary) {
    process.stderr.write(`[PID ${process.pid}] Running as secondary instance (no SSE connection).\n`);
    // Run a minimal stdio server without SSE connection
    await runSecondaryInstance();
    return;
  }
  
  process.stderr.write(`[PID ${process.pid}] Running as primary instance (with SSE connection).\n`);
  
  // Check if already initialized (backup check)
  if (isInitialized) {
    process.stderr.write(`[PID ${process.pid}] Proxy already initialized, skipping duplicate connection\n`);
    return;
  }
  isInitialized = true;

  try {
    // FIRST: Set up the stdio server for Claude Desktop
    process.stderr.write(`[PID ${process.pid}] Setting up stdio server...\n`);
    
    // Create local stdio server for Claude Desktop
    const server = new Server(
      {
        name: 'minecraft-mcp-proxy',
        version: '0.2.21',
      },
      {
        capabilities: {
          tools: {},
        }
      }
    );
    
    // Create stdio transport for Claude Desktop
    const stdioTransport = new StdioServerTransport();
    
    // Handle stdio errors
    stdioTransport.onerror = (error) => {
      process.stderr.write(`[PID ${process.pid}] Stdio transport error: ${error}\n`);
    };
    
    // Set up placeholder handlers that will be updated once SSE connects
    let sseClient: Client | null = null;
    
    server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      if (!sseClient) {
        process.stderr.write(`[PID ${process.pid}] Tools requested but SSE not connected yet\n`);
        return { tools: [] };
      }
      try {
        const result = await sseClient.listTools(request.params || {});
        process.stderr.write(`[PID ${process.pid}] Returning ${result.tools?.length || 0} tools\n`);
        return result;
      } catch (error) {
        process.stderr.write(`[PID ${process.pid}] Error listing tools: ${error}\n`);
        throw error;
      }
    });
    
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!sseClient) {
        throw new Error("SSE connection not established");
      }
      try {
        process.stderr.write(`[PID ${process.pid}] Calling tool: ${request.params.name}\n`);
        return await sseClient.callTool(request.params);
      } catch (error) {
        process.stderr.write(`[PID ${process.pid}] Error calling tool: ${error}\n`);
        throw error;
      }
    });
    
    // Connect the stdio server IMMEDIATELY to respond to initialize request
    await server.connect(stdioTransport);
    process.stderr.write(`[PID ${process.pid}] Stdio server connected and responding\n`);
    
    // NOW: Connect to remote SSE server in the background
    process.stderr.write(`[PID ${process.pid}] Connecting to SSE server at ${remoteUrl.toString()}\n`);
    
    // Create client to connect to remote SSE server
    const client = new Client(
      {
        name: 'mcp-minecraft-proxy-client',
        version: '1.0.0',
      },
      {
        capabilities: {}
      }
    );
    
    // Create SSE transport for remote server
    const sseTransport = new SSEClientTransport(remoteUrl);
    
    // Add error handler
    sseTransport.onerror = (error) => {
      process.stderr.write(`[PID ${process.pid}] SSE Transport error: ${error}\n`);
    };
    
    // Connect to remote SSE server
    await client.connect(sseTransport);
    
    // Update the client reference now that we're connected
    sseClient = client;
    
    process.stderr.write(`[PID ${process.pid}] Successfully connected to SSE server\n`);
    
    process.stderr.write(`[PID ${process.pid}] Proxy ready for stdio communication\n`);
    
  } catch (error) {
    process.stderr.write(`Proxy error: ${error}\n`);
    // Don't exit immediately - let the process handle cleanup
    setTimeout(() => process.exit(1), 100);
  }
}

// Secondary instance - just handle stdio without SSE connection
async function runSecondaryInstance() {
  try {
    const server = new Server(
      {
        name: 'minecraft-mcp-proxy-secondary',
        version: '0.2.21',
      },
      {
        capabilities: {
          tools: {},
        }
      }
    );
    
    // Return empty tools list - primary instance handles actual tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: [] };
    });
    
    server.setRequestHandler(CallToolRequestSchema, async () => {
      throw new Error("Secondary instance cannot execute tools");
    });
    
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    
    process.stderr.write(`[PID ${process.pid}] Secondary proxy ready (no tools)\n`);
  } catch (error) {
    process.stderr.write(`[PID ${process.pid}] Secondary instance error: ${error}\n`);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Start the proxy immediately - it's always the entry point
main().catch(error => {
  process.stderr.write(`[PID ${process.pid}] Failed to start proxy: ${error}\n`);
  process.exit(1);
});