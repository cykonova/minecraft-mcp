// Patched Bedrock client to support newer versions
const bedrockProtocol = require('bedrock-protocol');

// Monkey patch the supported versions BEFORE importing createClient
// Add support for version 1.21.102.1 with protocol version 819
bedrockProtocol.supportedVersions = bedrockProtocol.supportedVersions || {};
bedrockProtocol.supportedVersions['1.21.102.1'] = 819;
bedrockProtocol.supportedVersions['1.21.102'] = 819;

console.log('[Bedrock] Added support for version 1.21.102.1');

import { createClient as originalCreateClient } from 'bedrock-protocol';

// Patch createClient to handle unsupported versions and add skipPing
export function createPatchedBedrockClient(options: any) {
    // Map unsupported versions to the closest supported one
    if (options.version === "1.21.102.1" || options.version === "1.21.102") {
      console.log('[Bedrock] Mapping version 1.21.102.1 to 1.21.100');
      options.version = "1.21.100"; // Use closest supported version
    }
    
    // Always add skipPing for better compatibility
    options.skipPing = true;
    
    console.log('[Bedrock] Creating client with options:', {
      host: options.host,
      port: options.port,
      username: options.username,
      offline: options.offline,
      version: options.version,
      skipPing: options.skipPing
    });
    
    return originalCreateClient(options);
}