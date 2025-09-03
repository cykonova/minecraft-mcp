#!/usr/bin/env node

// Import reflect-metadata FIRST for TSyringe
import 'reflect-metadata';

// Redirect ALL console.log output to stderr to prevent stdout pollution
// This MUST be done before any other imports or code
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
    console.error('[LOG]', ...args);
};

// Also redirect console.dir which might be used for error objects
const originalConsoleDir = console.dir;
console.dir = (obj: any, options?: any) => {
    console.error('[DIR]', obj, options);
};

// Intercept direct writes to stdout to ensure only JSON-RPC messages go through
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (chunk: any, encoding?: any, callback?: any) => {
    // Check if this looks like a JSON-RPC message
    const str = chunk.toString();
    if (str.trim().startsWith('{') && str.includes('"jsonrpc"')) {
        // This looks like a JSON-RPC message, let it through
        return originalStdoutWrite(chunk, encoding, callback);
    } else {
        // Redirect non-JSON-RPC output to stderr
        console.error('[STDOUT REDIRECT]', str.trim());
        if (callback) callback();
        return true;
    }
};

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    CallToolRequest,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { program } from 'commander';
import { Bot } from 'mineflayer';
import { createBot as mineflayerCreateBot } from 'mineflayer';
import { loadSkills, SkillRegistry } from './skillRegistry.js';
import { BotManager } from './botManager.js';
import { initializeChatHistory } from './skills/java/verified/readChat.js';
import { JavaBotWrapper } from './bots/JavaBotWrapper.js';
import { BedrockBotWrapper } from './bots/BedrockBotWrapper.js';
import { UnifiedBot } from './bots/UnifiedBot.js';
import { BotWithLogger } from './types.js';
import { configureContainer, getContainer } from './container.js';
import { SkillsProvider } from './services/SkillsProvider.js';

// Parse command line arguments (now optional)
program
    .option('-p, --port <port>', 'Default Minecraft server port')
    .option('-h, --host <host>', 'Default Minecraft server host')
    .parse(process.argv);

const options = program.opts();

// Initialize the MCP server
const server = new Server(
    {
        name: "fl-minecraft",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// Configure dependency injection
configureContainer();

// Get instances from DI container
const container = getContainer();
const botManager = container.resolve(BotManager);
const skillRegistry = container.resolve(SkillRegistry);
const skillsProvider = container.resolve(SkillsProvider);

// Initialize skills
async function initializeSkills() {
    const skills = await loadSkills(skillsProvider);
    for (const skill of skills) {
        skillRegistry.registerSkill(skill);
    }
}

// List all available tools (joinGame + all skills)
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
        {
            name: "joinGame",
            description: "Spawn a bot into the Minecraft game (supports both Java and Bedrock editions)",
            inputSchema: {
                type: "object",
                properties: {
                    username: {
                        type: "string",
                        description: "The username for the bot"
                    },
                    host: {
                        type: "string",
                        description: "Minecraft server host (defaults to 'localhost' or command line option)"
                    },
                    port: {
                        type: "number",
                        description: "Minecraft server port (defaults to 25565 for Java, 19132 for Bedrock)"
                    },
                    edition: {
                        type: "string",
                        enum: ["java", "bedrock"],
                        description: "Minecraft edition to connect to (defaults to 'java')"
                    },
                    offline: {
                        type: "boolean",
                        description: "Use offline mode (Bedrock only, defaults to true)"
                    },
                    version: {
                        type: "string",
                        description: "Minecraft version (optional, auto-detect for Java)"
                    }
                },
                required: ["username"]
            }
        },
        {
            name: "leaveGame",
            description: "Disconnect a bot from the game",
            inputSchema: {
                type: "object",
                properties: {
                    username: {
                        type: "string",
                        description: "The username of the bot to disconnect"
                    },
                    disconnectAll: {
                        type: "boolean",
                        description: "If true, disconnect all bots and close all connections"
                    }
                }
            }
        }
    ];

    // Add all registered skills as tools
    const skillTools = skillRegistry.getAllSkills().map(skill => ({
        name: skill.name,
        description: skill.description,
        inputSchema: skill.inputSchema
    }));

    return { tools: [...tools, ...skillTools] };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    // Handle joinGame tool
    if (name === "joinGame") {
        try {
            const { username, host, port, edition = 'java', offline = true, version } = args as { 
                username: string; 
                host?: string; 
                port?: number;
                edition?: 'java' | 'bedrock';
                offline?: boolean;
                version?: string;
            };

            // Use provided values, fall back to command line options, then defaults
            const serverHost = host || options.host || 'localhost';
            const defaultPort = edition === 'bedrock' ? 19132 : 25565;
            const serverPort = port || (options.port ? parseInt(options.port) : defaultPort);

            console.error(`[MCP] Attempting to spawn ${edition} bot '${username}' on ${serverHost}:${serverPort}`);

            let unifiedBot: UnifiedBot;
            let botId: string;

            if (edition === 'bedrock') {
                // Create Bedrock bot
                const bedrockBot = await BedrockBotWrapper.create({
                    host: serverHost,
                    port: serverPort,
                    username: username,
                    offline: offline,
                    version: version || '1.20.80'
                });

                // Add logger to match Java bot structure
                (bedrockBot as any).logger = {
                    info: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : ${message}`);
                    },
                    error: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : ERROR: ${message}`);
                    },
                    warn: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : WARN: ${message}`);
                    },
                    debug: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : DEBUG: ${message}`);
                    }
                };

                unifiedBot = bedrockBot;
                botId = botManager.addBot(username, bedrockBot as any);
            } else {
                // Create Java bot (existing logic)
                const bot = mineflayerCreateBot({
                    host: serverHost,
                    port: serverPort,
                    username: username,
                    version: version
                    // Auto-detect version if not specified
                }) as any;

                // Dynamically import and load plugins
                const [pathfinderModule, pvpModule, toolModule, collectBlockModule] = await Promise.all([
                    import('mineflayer-pathfinder'),
                    import('mineflayer-pvp'),
                    import('mineflayer-tool'),
                    import('mineflayer-collectblock')
                ]);

                // Load plugins
                bot.loadPlugin(pathfinderModule.pathfinder);
                bot.loadPlugin(pvpModule.plugin);
                bot.loadPlugin(toolModule.plugin);
                bot.loadPlugin(collectBlockModule.plugin);

                // Add Movements constructor to bot for skills that create movement configurations
                bot.Movements = pathfinderModule.Movements;

                // Add a logger to the bot
                bot.logger = {
                    info: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : ${message}`);
                    },
                    error: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : ERROR: ${message}`);
                    },
                    warn: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : WARN: ${message}`);
                    },
                    debug: (message: string) => {
                        const timestamp = new Date().toISOString();
                        console.error(`[${username}] ${timestamp} : DEBUG: ${message}`);
                    }
                };

                // Wait for spawn
                await Promise.race([
                    new Promise<void>((resolve, reject) => {
                        bot.once('spawn', () => {
                            console.error(`[MCP] Bot ${username} spawned, initializing additional properties...`);

                            // Initialize properties that skills expect
                            bot.exploreChunkSize = 16; // INTERNAL_MAP_CHUNK_SIZE
                            bot.knownChunks = bot.knownChunks || {};
                            bot.currentSkillCode = '';
                            bot.currentSkillData = {};

                            // Set constants that skills use
                            bot.nearbyBlockXZRange = 20; // NEARBY_BLOCK_XZ_RANGE
                            bot.nearbyBlockYRange = 10; // NEARBY_BLOCK_Y_RANGE
                            bot.nearbyPlayerRadius = 10; // NEARBY_PLAYER_RADIUS
                            bot.hearingRadius = 30; // HEARING_RADIUS
                            bot.nearbyEntityRadius = 10; // NEARBY_ENTITY_RADIUS

                            // Initialize chat history tracking
                            initializeChatHistory(bot);

                            resolve();
                        });
                        bot.once('error', (err: Error) => reject(err));
                        bot.once('kicked', (reason: string) => reject(new Error(`Bot kicked: ${reason}`)));
                    }),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Bot spawn timed out after 30 seconds')), 30000)
                    )
                ]);

                // Wrap Java bot in unified interface
                unifiedBot = new JavaBotWrapper(bot);
                botId = botManager.addBot(username, unifiedBot as any);
            }

            return {
                content: [{
                    type: "text",
                    text: `${edition === 'bedrock' ? 'Bedrock' : 'Java'} bot '${username}' successfully joined the game on ${serverHost}:${serverPort}. Bot ID: ${botId}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `Failed to join game: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }

    // Handle leaveGame tool
    if (name === "leaveGame") {
        try {
            const { username, disconnectAll } = args as { username?: string; disconnectAll?: boolean };

            if (disconnectAll) {
                const count = botManager.getBotCount();
                botManager.disconnectAll();
                return {
                    content: [{
                        type: "text",
                        text: `Disconnected all ${count} bot(s) from the game.`
                    }]
                };
            }

            if (!username) {
                throw new Error("Either 'username' or 'disconnectAll' must be specified");
            }

            const bot = botManager.getBotByUsername(username);
            if (!bot) {
                throw new Error(`No bot found with username '${username}'`);
            }

            botManager.removeBot(username);

            return {
                content: [{
                    type: "text",
                    text: `Bot '${username}' has been disconnected from the game.`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `Failed to leave game: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }

    // Handle skill tools
    const skill = skillRegistry.getSkill(name);
    if (skill) {
        try {
            // Get the active bot (for now, we'll use the most recently created bot)
            const bot = botManager.getActiveBot();
            if (!bot) {
                throw new Error("No active bot. Please use 'joinGame' first to spawn a bot.");
            }

            // Check if bot is a UnifiedBot (Bedrock) - skills currently only work with Java
            const isUnified = 'edition' in bot && (bot as any).edition === 'bedrock';
            if (isUnified) {
                throw new Error(`Skill '${name}' is not yet supported for Bedrock edition bots. Most skills currently only work with Java edition.`);
            }

            // Execute the skill with 30-second timeout
            const result = await Promise.race([
                skill.execute(bot as BotWithLogger, args),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Skill execution timed out after 30 seconds')), 30000)
                )
            ]);

            // Ensure result is properly formatted
            let responseText: string;
            if (result === undefined || result === null) {
                responseText = `Skill '${name}' executed successfully`;
            } else if (typeof result === 'string') {
                responseText = result;
            } else if (typeof result === 'object') {
                // If result is already an object, stringify it
                responseText = JSON.stringify(result, null, 2);
            } else {
                // For any other type, convert to string
                responseText = String(result);
            }

            return {
                content: [{
                    type: "text",
                    text: responseText
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[MCP] Skill '${name}' execution error:`, error);

            return {
                content: [{
                    type: "text",
                    text: `Skill execution failed: ${errorMessage}`
                }],
                isError: true
            };
        }
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

// Initialize and start the server
async function main() {
    const defaultHost = options.host || 'localhost';
    const defaultPort = options.port || '25565';

    console.error(`Starting MCP server for Minecraft`);
    console.error(`Default connection: ${defaultHost}:${defaultPort} (can be overridden per bot)`);

    // Initialize skills
    await initializeSkills();
    console.error(`Loaded ${skillRegistry.getAllSkills().length} skills`);

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("MCP server running on stdio transport");
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.error("Shutting down...");
    botManager.disconnectAll();
    process.exit(0);
});

// Capture any uncaught exceptions and send to stderr
process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
    process.exit(1);
});

// Capture any unhandled promise rejections and send to stderr
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] at:', promise, 'reason:', reason);
});

main().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});