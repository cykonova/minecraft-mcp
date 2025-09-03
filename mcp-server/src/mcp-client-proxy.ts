#!/usr/bin/env node

/**
 * MCP Client Proxy for authenticated remote SSE servers
 * 
 * This proxy runs locally and forwards requests to a remote MCP SSE server
 * with authentication, allowing Claude Desktop to connect without knowing
 * the API key.
 */

// Suppress ALL console output to prevent breaking JSON-RPC protocol
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

console.log = () => {};
console.error = () => {};
console.warn = () => {};
console.info = () => {};

// Only write critical info to stderr at startup
const log = (msg: string) => {
  process.stderr.write(`${msg}\n`);
};

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// Get configuration from environment
const remoteServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const apiKey = process.env.MCP_API_KEY;
const localPort = parseInt(process.env.LOCAL_PORT || '3001', 10);

if (!apiKey) {
  console.error('Error: MCP_API_KEY environment variable is required');
  process.exit(1);
}

// Parse remote URL
const remoteUrl = new URL(remoteServerUrl);

// Proxy configuration for SSE endpoint
const sseProxy = createProxyMiddleware({
  target: remoteUrl.origin,
  changeOrigin: true,
  ws: true,
  headers: {
    'X-API-Key': apiKey,
  },
  logLevel: 'silent',  // Disable ALL http-proxy-middleware logging
  onError: (err, req, res) => {
    // Don't log errors to stdout
    res.status(502).json({ error: 'Proxy error' });
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add API key to all requests
    proxyReq.setHeader('X-API-Key', apiKey);
  },
  onProxyRes: (proxyRes, req, res) => {
    // For SSE connections, ensure proper headers
    if (req.url?.includes('/sse')) {
      proxyRes.headers['cache-control'] = 'no-cache';
      proxyRes.headers['content-type'] = 'text/event-stream';
      proxyRes.headers['connection'] = 'keep-alive';
    }
  }
});

// Apply proxy to all routes
app.use('/', sseProxy);

// Start local proxy server
app.listen(localPort, 'localhost', () => {
  // Don't output anything after server starts - it breaks SSE protocol
  // The server is running, that's all that matters
});

// Handle shutdown silently
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
  // Silently continue - don't exit
});

process.on('unhandledRejection', (reason, promise) => {
  // Silently continue - don't exit  
});