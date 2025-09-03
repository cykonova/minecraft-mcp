import { Bot } from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';

import { cancelableMove } from './navigateToLocation.js';

interface IExploreNearbyOptions {
    signal?: AbortSignal;
    verbose?: boolean;
}

const {
    Movements,
    goals: { GoalNear },
} = mineflayer_pathfinder;

/**
 * Makes the bot explore by moving to a random location 10-20 blocks away
 * that isn't in water and isn't too high up.
 *
 * @param {Bot} bot - The Mineflayer bot instance
 * @param {IExploreNearbyOptions} options - Optional parameters
 * @returns {Promise<boolean>} - Whether the exploration was successful
 */
export const exploreNearby = async (
    bot: Bot,
    options: IExploreNearbyOptions = {},
): Promise<boolean> => {
    const { signal, verbose = false } = options;

    // Try up to 10 times to find a suitable location
    for (let attempts = 0; attempts < 10; attempts++) {
        // Choose random angle and distance
        const angle = Math.random() * 2 * Math.PI;
        const distance = 10 + Math.random() * 10; // Random distance between 10-20 blocks

        // Calculate target coordinates
        const currentPos = bot.entity.position;
        const targetX = Math.round(currentPos.x + Math.cos(angle) * distance);
        const targetZ = Math.round(currentPos.z + Math.sin(angle) * distance);

        // Find the surface block at these coordinates
        const targetY = bot.entity.position.y;
        const surfaceY = await findSuitableSurfaceHeight(
            bot,
            targetX,
            targetY,
            targetZ,
        );

        if (surfaceY !== null) {
            try {
                // Move the bot to the block
                const reachedBlock = await cancelableMove(bot, {
                    goal: new GoalNear(targetX, surfaceY, targetZ, 4),
                    signal,
                });

                if (reachedBlock.error) {
                    console.log(
                        `\x1b[31m[ Failed to reach block at ${targetX}, ${surfaceY}, ${targetZ} during exploration: ${reachedBlock.error}]\x1b[0m`,
                    );
                    continue;
                }

                if (reachedBlock.canceled) {
                    return false;
                }
                return true;
            } catch (error) {
                console.log(
                    `\x1b[31m[ Failed to reach block at ${targetX}, ${surfaceY}, ${targetZ}: ${error}]\x1b[0m`,
                );
                continue;
            }
        }
    }

    if (verbose) {
        bot.emit(
            'alteraBotEndObservation',
            `You couldn't find a suitable location to explore nearby.`,
        );
    }
    return false;
};

/**
 * Finds a suitable surface height at the given coordinates
 * @returns {Promise<number|null>} The Y coordinate of a suitable surface, or null if none found
 */
const findSuitableSurfaceHeight = async (
    bot: Bot,
    x: number,
    startY: number,
    z: number,
): Promise<number | null> => {
    const mcData = minecraftData(bot.version);

    // Search in a vertical range of ±5 blocks from the bot's current Y
    for (let y = startY - 5; y <= startY + 5; y++) {
        const block = bot.blockAt(new Vec3(x, y, z));
        const blockAbove = bot.blockAt(new Vec3(x, y + 1, z));
        const blockBelow = bot.blockAt(new Vec3(x, y - 1, z));

        if (!block || !blockAbove || !blockBelow) continue;

        // Check if this is a suitable location:
        // - Block below must be solid
        // - Current block and block above must be air
        // - Not in water
        if (
            blockBelow.type !== 0 && // Not air below
            block.type === 0 && // Air at feet level
            blockAbove.type === 0 && // Air at head level
            !blockBelow.getProperties().waterlogged && // Not waterlogged
            blockBelow.type !== mcData.blocksByName.water.id // Not water
        ) {
            return y;
        }
    }

    return null;
}; 