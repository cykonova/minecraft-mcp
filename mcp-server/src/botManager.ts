// Removing injectable for now to avoid circular dependencies
import { Bot } from 'mineflayer';
import { BotWithLogger, AnyBot } from './types.js';
import { UnifiedBot, isUnifiedBot } from './bots/UnifiedBot.js';
import { JavaBotWrapper } from './bots/JavaBotWrapper.js';
import { BedrockBotWrapper } from './bots/BedrockBotWrapper.js';
import { getContainer, isContainerReady } from './config/container.js';
import { TOKENS } from './config/tokens.js';
import { IPathfindingService } from './services/pathfinding/IPathfindingService.js';
import { IMovementService } from './services/movement/IMovementService.js';
import { IInventoryService } from './services/inventory/IInventoryService.js';
import { IBlockInteractionService } from './services/blocks/IBlockInteractionService.js';
import { ICombatService } from './services/combat/ICombatService.js';

interface BotInstance {
    id: string;
    username: string;
    bot: AnyBot;
    createdAt: Date;
    edition: 'java' | 'bedrock';
}

export class BotManager {
    private bots: Map<string, BotInstance> = new Map();
    private activeBotId: string | null = null;
    
    private pathfindingService?: IPathfindingService;
    private movementService?: IMovementService;
    private inventoryService?: IInventoryService;
    private blockInteractionService?: IBlockInteractionService;
    private combatService?: ICombatService;

    constructor() {
        // Services will be injected after container is ready
    }

    /**
     * Inject services from container (called after DI is configured)
     */
    injectServices(
        pathfindingService?: IPathfindingService,
        movementService?: IMovementService,
        inventoryService?: IInventoryService,
        blockInteractionService?: IBlockInteractionService,
        combatService?: ICombatService
    ) {
        this.pathfindingService = pathfindingService;
        this.movementService = movementService;
        this.inventoryService = inventoryService;
        this.blockInteractionService = blockInteractionService;
        this.combatService = combatService;
    }

    /**
     * Create a Java bot wrapper with injected services
     */
    createJavaBotWrapper(bot: Bot): JavaBotWrapper {
        return JavaBotWrapper.create(
            bot,
            this.pathfindingService,
            this.movementService,
            this.inventoryService,
            this.blockInteractionService,
            this.combatService
        );
    }

    /**
     * Create a Bedrock bot wrapper with injected services
     */
    async createBedrockBotWrapper(options: {
        host: string;
        port?: number;
        username: string;
        offline?: boolean;
        version?: string;
    }): Promise<BedrockBotWrapper> {
        return BedrockBotWrapper.create(options, {
            pathfindingService: this.pathfindingService,
            movementService: this.movementService,
            inventoryService: this.inventoryService,
            blockInteractionService: this.blockInteractionService,
            combatService: this.combatService
        });
    }

    /**
     * Add a bot wrapper (for Java bots) or create wrapper for raw bot
     */
    addJavaBot(bot: Bot): string {
        const wrapper = this.createJavaBotWrapper(bot);
        return this.addBot(bot.username, wrapper);
    }

    addBot(username: string, bot: AnyBot): string {
        const id = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const edition = isUnifiedBot(bot) ? bot.edition : 'java';

        this.bots.set(id, {
            id,
            username,
            bot,
            createdAt: new Date(),
            edition
        });

        // Set as active bot if it's the first one
        if (this.bots.size === 1) {
            this.activeBotId = id;
        }

        console.error(`[BotManager] Added ${edition} bot '${username}' with ID: ${id}`);
        console.error(`[BotManager] Active bot is now: ${this.activeBotId}`);
        console.error(`[BotManager] Total bots: ${this.bots.size}`);

        // Handle bot events
        bot.on('error', (err) => {
            console.error(`[BotManager] Bot ${username} error:`, err);
        });

        bot.on('kicked', (reason) => {
            console.error(`[BotManager] Bot ${username} was kicked:`, reason);
            this.removeBot(id);
        });

        bot.on('end', () => {
            console.error(`[BotManager] Bot ${username} disconnected`);
            this.removeBot(id);
        });

        // Add more event logging
        bot.on('spawn', () => {
            console.error(`[BotManager] Bot ${username} spawned at position:`, bot.entity.position);
        });

        bot.on('death', () => {
            console.error(`[BotManager] Bot ${username} died`);
        });

        bot.on('health', () => {
            console.error(`[BotManager] Bot ${username} health: ${bot.health}, food: ${bot.food}`);
        });

        return id;
    }

    removeBot(idOrUsername: string): void {
        // First try to find by ID
        let botInstance = this.bots.get(idOrUsername);

        // If not found by ID, search by username
        if (!botInstance) {
            for (const [id, instance] of this.bots) {
                if (instance.username === idOrUsername) {
                    botInstance = instance;
                    idOrUsername = id; // Use the ID for deletion
                    break;
                }
            }
        }

        if (botInstance) {
            console.error(`[BotManager] Removing ${botInstance.edition} bot '${botInstance.username}' with ID: ${botInstance.id}`);
            try {
                if (isUnifiedBot(botInstance.bot)) {
                    botInstance.bot.quit();
                } else {
                    (botInstance.bot as BotWithLogger).quit();
                }
            } catch (error) {
                // Bot might already be disconnected
            }
            this.bots.delete(idOrUsername);

            // Update active bot if needed
            if (this.activeBotId === idOrUsername) {
                const remainingBots = Array.from(this.bots.keys());
                this.activeBotId = remainingBots.length > 0 ? remainingBots[0] : null;
                console.error(`[BotManager] Active bot updated to: ${this.activeBotId}`);
            }
        }
    }

    getBot(id: string): AnyBot | null {
        const botInstance = this.bots.get(id);
        return botInstance ? botInstance.bot : null;
    }

    getActiveBot(): AnyBot | null {
        if (!this.activeBotId) {
            console.error(`[BotManager] No active bot available`);
            return null;
        }
        const bot = this.getBot(this.activeBotId);
        if (bot) {
            console.error(`[BotManager] Returning active bot with ID: ${this.activeBotId}`);
        }
        return bot;
    }

    setActiveBot(id: string): boolean {
        if (this.bots.has(id)) {
            this.activeBotId = id;
            console.error(`[BotManager] Set active bot to ID: ${id}`);
            return true;
        }
        return false;
    }

    getAllBots(): BotInstance[] {
        return Array.from(this.bots.values());
    }

    getBotByUsername(username: string): AnyBot | null {
        for (const instance of this.bots.values()) {
            if (instance.username === username) {
                return instance.bot;
            }
        }
        return null;
    }

    getBotCount(): number {
        return this.bots.size;
    }

    disconnectAll(): void {
        console.error(`[BotManager] Disconnecting all ${this.bots.size} bots`);
        for (const [id] of this.bots) {
            this.removeBot(id);
        }
    }
} 