import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    CallToolRequest,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { BotManager } from './botManager.js';
import { createBot as mineflayerCreateBot } from 'mineflayer';
import { UnifiedBot } from './bots/UnifiedBot.js';
import { BotWithLogger } from './types.js';
import { getContainer } from './container.js';
import { TOKENS } from './config/tokens.js';

/**
 * Register all MCP tools including joinGame, leaveGame, and skill tools
 */
export function registerTools(server: Server, botManager: BotManager): void {
    const container = getContainer();
    const skillRegistry = container.resolve(TOKENS.SkillRegistry) as any;
    
    // List all available tools
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
        const skillTools = skillRegistry.getAllSkills().map((skill: any) => ({
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

                // Use default values from botManager
                const serverHost = host || botManager.defaultHost || 'localhost';
                const defaultPort = edition === 'bedrock' ? 19132 : 25565;
                const serverPort = port || botManager.defaultPort || defaultPort;

                console.error(`[MCP] Attempting to spawn ${edition} bot '${username}' on ${serverHost}:${serverPort}`);

                let unifiedBot: UnifiedBot;
                let botId: string;

                if (edition === 'bedrock') {
                    // Create Bedrock bot
                    const bedrockBot = await botManager.createBedrockBotWrapper({
                        host: serverHost,
                        port: serverPort,
                        username: username,
                        offline: offline,
                        version: version || '1.20.80'
                    });

                    // Add logger
                    (bedrockBot as any).logger = createLogger(username);

                    unifiedBot = bedrockBot;
                    botId = botManager.addBot(username, bedrockBot as any);
                } else {
                    // Create Java bot
                    const bot = mineflayerCreateBot({
                        host: serverHost,
                        port: serverPort,
                        username: username,
                        version: version
                    }) as any;

                    // Load plugins
                    const [pathfinderModule, pvpModule, toolModule, collectBlockModule] = await Promise.all([
                        import('mineflayer-pathfinder'),
                        import('mineflayer-pvp'),
                        import('mineflayer-tool'),
                        import('mineflayer-collectblock')
                    ]);

                    bot.loadPlugin(pathfinderModule.pathfinder);
                    bot.loadPlugin(pvpModule.plugin);
                    bot.loadPlugin(toolModule.plugin);
                    bot.loadPlugin(collectBlockModule.plugin);
                    bot.Movements = pathfinderModule.Movements;

                    // Add logger
                    bot.logger = createLogger(username);

                    // Wait for spawn
                    await waitForSpawn(bot, username);

                    // Wrap Java bot
                    unifiedBot = botManager.createJavaBotWrapper(bot);
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
                const bot = botManager.getActiveBot();
                if (!bot) {
                    throw new Error("No active bot. Please use 'joinGame' first to spawn a bot.");
                }

                // Check if bot is Bedrock
                const isUnified = 'edition' in bot && (bot as any).edition === 'bedrock';
                if (isUnified) {
                    throw new Error(`Skill '${name}' is not yet supported for Bedrock edition bots.`);
                }

                // Execute skill with timeout
                const result = await Promise.race([
                    skill.execute(bot as BotWithLogger, args),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Skill execution timed out after 30 seconds')), 30000)
                    )
                ]);

                // Format result
                let responseText: string;
                if (result === undefined || result === null) {
                    responseText = `Skill '${name}' executed successfully`;
                } else if (typeof result === 'string') {
                    responseText = result;
                } else {
                    responseText = JSON.stringify(result, null, 2);
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
}

function createLogger(username: string) {
    return {
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
}

async function waitForSpawn(bot: any, username: string): Promise<void> {
    await Promise.race([
        new Promise<void>((resolve, reject) => {
            bot.once('spawn', () => {
                console.error(`[MCP] Bot ${username} spawned, initializing...`);
                
                // Initialize expected properties
                bot.exploreChunkSize = 16;
                bot.knownChunks = bot.knownChunks || {};
                bot.currentSkillCode = '';
                bot.currentSkillData = {};
                bot.nearbyBlockXZRange = 20;
                bot.nearbyBlockYRange = 10;
                bot.nearbyPlayerRadius = 10;
                bot.hearingRadius = 30;
                bot.nearbyEntityRadius = 10;
                
                resolve();
            });
            bot.once('error', (err: Error) => reject(err));
            bot.once('kicked', (reason: string) => reject(new Error(`Bot kicked: ${reason}`)));
        }),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Bot spawn timed out after 30 seconds')), 30000)
        )
    ]);
}