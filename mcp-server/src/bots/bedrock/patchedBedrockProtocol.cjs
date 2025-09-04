// CommonJS shim to patch bedrock-protocol before ES module export
// This file must be .cjs to use require()

const bedrockProtocol = require('bedrock-protocol');

// Add support for version 1.21.102.1 (same protocol as 1.21.93)
bedrockProtocol.supportedVersions = bedrockProtocol.supportedVersions || {};
bedrockProtocol.supportedVersions['1.21.102.1'] = 819;
bedrockProtocol.supportedVersions['1.21.102'] = 819;

console.error('[PatchedBedrockProtocol] Added support for version 1.21.102.1 with protocol 819');
console.error('[PatchedBedrockProtocol] Supported versions:', Object.keys(bedrockProtocol.supportedVersions));

// Wrap createClient to handle version mapping
const originalCreateClient = bedrockProtocol.createClient;
bedrockProtocol.createClient = function(options) {
  // Map unsupported versions to closest supported one
  if (options.version === '1.21.102.1' || options.version === '1.21.102') {
    console.error('[PatchedBedrockProtocol] Mapping version', options.version, 'to 1.21.100');
    options.version = '1.21.100';
  }
  
  console.error('[PatchedBedrockProtocol] Creating client with options:', {
    host: options.host,
    port: options.port,
    username: options.username,
    version: options.version,
    offline: options.offline,
    skipPing: options.skipPing
  });
  
  return originalCreateClient.call(this, options);
};

// Export the patched module
module.exports = bedrockProtocol;