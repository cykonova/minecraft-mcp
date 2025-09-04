// ES module wrapper for the patched bedrock-protocol
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create require function for CommonJS
const require = createRequire(import.meta.url);

// Load the CommonJS shim which patches bedrock-protocol
const patchedModule = require(join(__dirname, 'patchedBedrockProtocol.cjs'));

// Re-export the patched module
export const createClient = patchedModule.createClient;
export const Client = patchedModule.Client;
export const Server = patchedModule.Server;

export default patchedModule;