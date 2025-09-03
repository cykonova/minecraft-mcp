import { Bot } from 'mineflayer';
import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { isSignalAborted, validateSkillParams } from '../index.js';

/**
 * Build structures in Minecraft using either a JSON script with commands or arbitrary JavaScript code
 * 
 * This skill allows you to create complex structures using Minecraft's built-in commands.
 * The bot must have operator permissions (cheats enabled) to use this skill.
 * 
 * Two modes are supported:
 * 
 * 1. Build Script Mode (array of command objects):
 * - setblock: Place a single block at specific coordinates
 *   Example: {"command": "setblock", "x": 100, "y": 64, "z": 200, "block": "stone"}
 * 
 * - fill: Fill a region with blocks
 *   Example: {"command": "fill", "x1": 100, "y1": 64, "z1": 200, "x2": 110, "y2": 70, "z2": 210, "block": "oak_planks"}
 * 
 * - clone: Copy a region to another location
 *   Example: {"command": "clone", "x1": 100, "y1": 64, "z1": 200, "x2": 110, "y2": 70, "z2": 210, "dx": 120, "dy": 64, "dz": 200}
 * 
 * - summon: Summon entities
 *   Example: {"command": "summon", "entity": "chicken", "x": 100, "y": 64, "z": 200}
 * 
 * - give: Give items to the bot
 *   Example: {"command": "give", "item": "diamond", "count": 64}
 * 
 * 2. Code Mode (JavaScript string):
 * - Execute arbitrary JavaScript code with access to building functions and bot state
 * - Available variables: bot, pos (bot's position), setBlock, fill, clone, summon, give, execute
 * - Example: "for(let i = 0; i < 10; i++) { setBlock(pos.x + i, pos.y, pos.z, 'stone'); }"
 * 
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {Array|string} params.buildScript - Array of building commands OR params.code - JavaScript code string
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if the building was successful, false otherwise.
 */
export const buildSomething = async (
    bot: Bot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'buildSomething';

    // Check if either buildScript or code is provided
    if (!params.buildScript && !params.code) {
        serviceParams.cancelExecution?.();
        bot.emit(
            'alteraBotEndObservation',
            `Mistake: You must provide either 'buildScript' (array of commands) or 'code' (JavaScript string) for the ${skillName} skill.`,
        );
        return false;
    }

    const { signal } = serviceParams;

    // First, check if cheats are enabled by attempting a simple command
    const cheatsEnabled = await checkCheatsEnabled(bot);
    if (!cheatsEnabled) {
        bot.emit(
            'alteraBotEndObservation',
            'Cheats are not enabled on this server. You cannot use build commands. Ask an operator to enable cheats or give you permissions.',
        );
        return false;
    }

    // Handle code mode
    if (params.code) {
        return await executeCodeMode(bot, params.code as string, signal);
    }

    // Handle buildScript mode (original implementation)
    const { buildScript } = params;

    // Validate buildScript is an array
    if (!Array.isArray(buildScript)) {
        bot.emit(
            'alteraBotEndObservation',
            'Build script must be an array of command objects',
        );
        return false;
    }

    bot.emit(
        'alteraBotStartObservation',
        `Starting to execute build script with ${buildScript.length} commands...`,
    );

    let successCount = 0;
    let failCount = 0;
    const results: string[] = [];

    // Execute each command in the build script
    for (let i = 0; i < buildScript.length; i++) {
        if (isSignalAborted(signal)) {
            bot.emit(
                'alteraBotEndObservation',
                `Build interrupted. Completed ${successCount} commands successfully.`,
            );
            return false;
        }

        const cmd = buildScript[i];

        try {
            const result = await executeCommand(bot, cmd);
            if (result.success) {
                successCount++;
                results.push(`✓ Command ${i + 1}: ${result.message}`);
            } else {
                failCount++;
                results.push(`✗ Command ${i + 1}: ${result.message}`);
            }
        } catch (error) {
            failCount++;
            results.push(`✗ Command ${i + 1}: Error - ${error}`);
        }

        // Small delay between commands to avoid overwhelming the server
        await bot.waitForTicks(2);
    }

    const summary = results.join('\n');
    bot.emit(
        'alteraBotEndObservation',
        `Build script completed. Success: ${successCount}, Failed: ${failCount}\n${summary}`,
    );

    return failCount === 0;
};

/**
 * Execute arbitrary JavaScript code for building
 */
async function executeCodeMode(bot: Bot, code: string, signal?: AbortSignal): Promise<boolean> {
    bot.emit(
        'alteraBotStartObservation',
        'Executing custom building code...',
    );

    // Create a context with useful functions and variables
    const context = {
        // Bot reference
        bot,

        // Current position
        pos: bot.entity.position,

        // Building functions
        setBlock: (x: number, y: number, z: number, block: string) => {
            const command = `/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${block}`;
            bot.chat(command);
            return command;
        },

        fill: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string, mode?: string) => {
            let command = `/fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${block}`;
            if (mode) command += ` ${mode}`;
            bot.chat(command);
            return command;
        },

        clone: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, dx: number, dy: number, dz: number, mode?: string) => {
            let command = `/clone ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${Math.floor(dx)} ${Math.floor(dy)} ${Math.floor(dz)}`;
            if (mode) command += ` ${mode}`;
            bot.chat(command);
            return command;
        },

        summon: (entity: string, x?: number, y?: number, z?: number) => {
            let command = `/summon ${entity}`;
            if (x !== undefined && y !== undefined && z !== undefined) {
                command += ` ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
            }
            bot.chat(command);
            return command;
        },

        give: (item: string, count: number = 1) => {
            const command = `/give ${bot.username} ${item} ${count}`;
            bot.chat(command);
            return command;
        },

        // Execute raw command
        execute: (command: string) => {
            bot.chat(command);
            return command;
        },

        // Utility functions
        wait: async (ticks: number) => {
            await bot.waitForTicks(ticks);
        },

        // Math helpers
        Math,

        // Check if build should be aborted
        shouldStop: () => isSignalAborted(signal),

        // Logging
        log: (message: string) => {
            bot.emit('alteraBotTextObservation', message);
        }
    };

    try {
        // Create a function with the code and execute it
        const buildFunction = new Function(
            ...Object.keys(context),
            `
            // User code starts here
            ${code}
            // User code ends here
            `
        );

        // Execute the function with the context
        await buildFunction(...Object.values(context));

        bot.emit(
            'alteraBotEndObservation',
            'Custom building code executed successfully!',
        );
        return true;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        bot.emit(
            'alteraBotEndObservation',
            `Failed to execute building code: ${errorMessage}`,
        );
        return false;
    }
}

/**
 * Check if cheats are enabled by attempting a harmless command
 */
async function checkCheatsEnabled(bot: Bot): Promise<boolean> {
    // Store the original position
    const pos = bot.entity.position;

    // Try to teleport to current position (harmless if it works)
    const testCommand = `/tp ${bot.username} ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`;

    return new Promise((resolve) => {
        let responded = false;

        // Set up a temporary listener for chat messages
        const checkResponse = (message: any) => {
            const text = message.toString();

            // Check for permission denied messages
            if (text.includes('permission') || text.includes('allowed') || text.includes('operator')) {
                responded = true;
                bot.removeListener('message', checkResponse);
                resolve(false);
            }
            // Check for successful teleport (no message usually means success)
            else if (text.includes('Teleported') || text.includes(bot.username)) {
                responded = true;
                bot.removeListener('message', checkResponse);
                resolve(true);
            }
        };

        bot.on('message', checkResponse);
        bot.chat(testCommand);

        // If no response after 2 seconds, assume success (some servers don't show tp messages)
        setTimeout(() => {
            if (!responded) {
                bot.removeListener('message', checkResponse);
                resolve(true);
            }
        }, 2000);
    });
}

/**
 * Execute a single build command
 */
async function executeCommand(
    bot: Bot,
    cmd: any
): Promise<{ success: boolean; message: string }> {
    if (!cmd || typeof cmd !== 'object') {
        return { success: false, message: 'Invalid command object' };
    }

    const command = cmd.command?.toLowerCase();

    switch (command) {
        case 'setblock':
            return executeSetBlock(bot, cmd);

        case 'fill':
            return executeFill(bot, cmd);

        case 'clone':
            return executeClone(bot, cmd);

        case 'summon':
            return executeSummon(bot, cmd);

        case 'give':
            return executeGive(bot, cmd);

        case 'raw':
            // Allow raw command execution
            if (cmd.raw) {
                bot.chat(cmd.raw);
                return { success: true, message: `Executed: ${cmd.raw}` };
            }
            return { success: false, message: 'Missing raw command' };

        default:
            return { success: false, message: `Unknown command: ${command}` };
    }
}

async function executeSetBlock(bot: Bot, cmd: any): Promise<{ success: boolean; message: string }> {
    const { x, y, z, block } = cmd;

    if (x === undefined || y === undefined || z === undefined || !block) {
        return { success: false, message: 'setblock requires x, y, z, and block' };
    }

    const command = `/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${block}`;
    bot.chat(command);

    return { success: true, message: `Placed ${block} at ${x}, ${y}, ${z}` };
}

async function executeFill(bot: Bot, cmd: any): Promise<{ success: boolean; message: string }> {
    const { x1, y1, z1, x2, y2, z2, block, mode } = cmd;

    if (x1 === undefined || y1 === undefined || z1 === undefined ||
        x2 === undefined || y2 === undefined || z2 === undefined || !block) {
        return { success: false, message: 'fill requires x1, y1, z1, x2, y2, z2, and block' };
    }

    let command = `/fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${block}`;
    if (mode) {
        command += ` ${mode}`;
    }

    bot.chat(command);

    const volume = Math.abs((x2 - x1) * (y2 - y1) * (z2 - z1));
    return { success: true, message: `Filled ${volume} blocks with ${block}` };
}

async function executeClone(bot: Bot, cmd: any): Promise<{ success: boolean; message: string }> {
    const { x1, y1, z1, x2, y2, z2, dx, dy, dz, mode } = cmd;

    if (x1 === undefined || y1 === undefined || z1 === undefined ||
        x2 === undefined || y2 === undefined || z2 === undefined ||
        dx === undefined || dy === undefined || dz === undefined) {
        return { success: false, message: 'clone requires x1, y1, z1, x2, y2, z2, dx, dy, dz' };
    }

    let command = `/clone ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${Math.floor(dx)} ${Math.floor(dy)} ${Math.floor(dz)}`;
    if (mode) {
        command += ` ${mode}`;
    }

    bot.chat(command);

    return { success: true, message: `Cloned region to ${dx}, ${dy}, ${dz}` };
}

async function executeSummon(bot: Bot, cmd: any): Promise<{ success: boolean; message: string }> {
    const { entity, x, y, z } = cmd;

    if (!entity) {
        return { success: false, message: 'summon requires entity type' };
    }

    let command = `/summon ${entity}`;
    if (x !== undefined && y !== undefined && z !== undefined) {
        command += ` ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
    }

    bot.chat(command);

    return { success: true, message: `Summoned ${entity}` };
}

async function executeGive(bot: Bot, cmd: any): Promise<{ success: boolean; message: string }> {
    const { item, count = 1 } = cmd;

    if (!item) {
        return { success: false, message: 'give requires item name' };
    }

    const command = `/give ${bot.username} ${item} ${count}`;
    bot.chat(command);

    return { success: true, message: `Gave ${count} ${item}` };
} 