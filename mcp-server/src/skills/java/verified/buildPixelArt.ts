import { Bot } from 'mineflayer';
import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { isSignalAborted } from '../index.js';
// @ts-ignore - Jimp doesn't have proper TypeScript declarations
import Jimp from 'jimp';
import axios from 'axios';
import { createReadStream } from 'fs';
import { join } from 'path';

/**
 * Build pixel art in Minecraft from an image
 * 
 * This skill converts an image into pixel art using Minecraft blocks.
 * The bot must have operator permissions (cheats enabled) to use this skill.
 * 
 * The pixel art is built vertically (standing up) with the specified dimensions.
 * Maximum size is 256x256 blocks.
 * 
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {string} params.imagePath - Path or URL to the image file
 * @param {number} params.width - Width of the pixel art in blocks (max 256)
 * @param {number} params.height - Height of the pixel art in blocks (max 256)
 * @param {number} params.x - X coordinate for the bottom middle of the pixel art
 * @param {number} params.y - Y coordinate for the bottom of the pixel art
 * @param {number} params.z - Z coordinate for the bottom middle of the pixel art
 * @param {string} params.facing - Direction the pixel art faces: 'north', 'south', 'east', or 'west' (default: 'north')
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if the pixel art was built successfully, false otherwise.
 */
export const buildPixelArt = async (
    bot: Bot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'buildPixelArt';

    // Validate required parameters
    if (!params.imagePath || !params.width || !params.height ||
        params.x === undefined || params.y === undefined || params.z === undefined) {
        serviceParams.cancelExecution?.();
        bot.emit(
            'alteraBotEndObservation',
            `Mistake: You must provide 'imagePath', 'width', 'height', 'x', 'y', and 'z' for the ${skillName} skill.`,
        );
        return false;
    }

    const { signal } = serviceParams;

    // Validate dimensions
    const width = Math.min(256, Math.max(1, params.width));
    const height = Math.min(256, Math.max(1, params.height));
    const facing = params.facing || 'north';

    if (params.width > 256 || params.height > 256) {
        bot.emit(
            'alteraBotTextObservation',
            `Dimensions capped to maximum 256x256. Using ${width}x${height}.`,
        );
    }

    // Check if cheats are enabled
    const cheatsEnabled = await checkCheatsEnabled(bot);
    if (!cheatsEnabled) {
        bot.emit(
            'alteraBotEndObservation',
            'Cheats are not enabled on this server. You cannot use build commands. Ask an operator to enable cheats or give you permissions.',
        );
        return false;
    }

    bot.emit(
        'alteraBotStartObservation',
        `Starting to build pixel art from image: ${params.imagePath} (${width}x${height} blocks)...`,
    );

    try {
        // Load the image
        const image = await loadImage(params.imagePath as string);

        // Resize image to target dimensions
        image.resize(width, height);

        // Get block placement coordinates based on facing direction
        const coords = getCoordinates(params.x, params.y, params.z, width, height, facing);

        let blocksPlaced = 0;
        const totalBlocks = width * height;

        // Process each pixel and place corresponding block
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (isSignalAborted(signal)) {
                    bot.emit(
                        'alteraBotEndObservation',
                        `Build interrupted. Placed ${blocksPlaced}/${totalBlocks} blocks.`,
                    );
                    return false;
                }

                // Get pixel color
                const pixelColor = Jimp.intToRGBA(image.getPixelColor(x, y));

                // Skip transparent pixels
                if (pixelColor.a < 128) {
                    continue;
                }

                // Get Minecraft block for this color
                const block = getBlockForColor(pixelColor.r, pixelColor.g, pixelColor.b);

                // Calculate block position
                const pos = coords(x, height - 1 - y); // Flip Y to build from bottom up

                // Place the block
                const command = `/setblock ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} ${block}`;
                bot.chat(command);

                blocksPlaced++;

                // Progress update every 10%
                if (blocksPlaced % Math.floor(totalBlocks / 10) === 0) {
                    const progress = Math.floor((blocksPlaced / totalBlocks) * 100);
                    bot.emit(
                        'alteraBotTextObservation',
                        `Progress: ${progress}% (${blocksPlaced}/${totalBlocks} blocks)`,
                    );
                }

                // Small delay to avoid overwhelming the server
                if (blocksPlaced % 20 === 0) {
                    await bot.waitForTicks(1);
                }
            }
        }

        bot.emit(
            'alteraBotEndObservation',
            `Pixel art completed! Placed ${blocksPlaced} blocks at ${params.x}, ${params.y}, ${params.z} facing ${facing}.`,
        );

        return true;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        bot.emit(
            'alteraBotEndObservation',
            `Failed to build pixel art: ${errorMessage}`,
        );
        return false;
    }
};

/**
 * Load image from path or URL
 */
async function loadImage(imagePath: string): Promise<any> {
    try {
        // Check if it's a URL
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            const response = await axios.get(imagePath, { responseType: 'arraybuffer' });
            return await Jimp.read(Buffer.from(response.data));
        } else {
            // Load from file path
            return await Jimp.read(imagePath);
        }
    } catch (error) {
        throw new Error(`Failed to load image: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get coordinate calculator based on facing direction
 */
function getCoordinates(baseX: number, baseY: number, baseZ: number, width: number, height: number, facing: string) {
    const halfWidth = Math.floor(width / 2);

    switch (facing.toLowerCase()) {
        case 'north': // Facing negative Z
            return (x: number, y: number) => ({
                x: baseX - halfWidth + x,
                y: baseY + y,
                z: baseZ
            });

        case 'south': // Facing positive Z
            return (x: number, y: number) => ({
                x: baseX + halfWidth - x,
                y: baseY + y,
                z: baseZ
            });

        case 'east': // Facing positive X
            return (x: number, y: number) => ({
                x: baseX,
                y: baseY + y,
                z: baseZ - halfWidth + x
            });

        case 'west': // Facing negative X
            return (x: number, y: number) => ({
                x: baseX,
                y: baseY + y,
                z: baseZ + halfWidth - x
            });

        default:
            return (x: number, y: number) => ({
                x: baseX - halfWidth + x,
                y: baseY + y,
                z: baseZ
            });
    }
}

/**
 * Map RGB color to closest Minecraft block
 * This is a simplified color palette - you can expand this for better color matching
 */
function getBlockForColor(r: number, g: number, b: number): string {
    // Color to block mapping - ordered by approximate brightness/commonality
    const colorBlocks = [
        { color: { r: 255, g: 255, b: 255 }, block: 'white_concrete' },
        { color: { r: 230, g: 230, b: 230 }, block: 'white_wool' },
        { color: { r: 200, g: 200, b: 200 }, block: 'light_gray_concrete' },
        { color: { r: 160, g: 160, b: 160 }, block: 'light_gray_wool' },
        { color: { r: 128, g: 128, b: 128 }, block: 'gray_concrete' },
        { color: { r: 90, g: 90, b: 90 }, block: 'gray_wool' },
        { color: { r: 64, g: 64, b: 64 }, block: 'gray_terracotta' },
        { color: { r: 30, g: 30, b: 30 }, block: 'black_concrete' },
        { color: { r: 0, g: 0, b: 0 }, block: 'black_wool' },

        // Reds
        { color: { r: 255, g: 0, b: 0 }, block: 'red_concrete' },
        { color: { r: 180, g: 0, b: 0 }, block: 'red_wool' },
        { color: { r: 140, g: 40, b: 40 }, block: 'red_terracotta' },

        // Oranges
        { color: { r: 255, g: 140, b: 0 }, block: 'orange_concrete' },
        { color: { r: 220, g: 120, b: 0 }, block: 'orange_wool' },

        // Yellows
        { color: { r: 255, g: 255, b: 0 }, block: 'yellow_concrete' },
        { color: { r: 220, g: 220, b: 0 }, block: 'yellow_wool' },
        { color: { r: 240, g: 220, b: 100 }, block: 'yellow_terracotta' },

        // Greens
        { color: { r: 0, g: 255, b: 0 }, block: 'lime_concrete' },
        { color: { r: 0, g: 180, b: 0 }, block: 'green_concrete' },
        { color: { r: 0, g: 120, b: 0 }, block: 'green_wool' },
        { color: { r: 80, g: 140, b: 80 }, block: 'green_terracotta' },

        // Blues
        { color: { r: 0, g: 200, b: 255 }, block: 'light_blue_concrete' },
        { color: { r: 0, g: 150, b: 200 }, block: 'light_blue_wool' },
        { color: { r: 0, g: 0, b: 255 }, block: 'blue_concrete' },
        { color: { r: 0, g: 0, b: 180 }, block: 'blue_wool' },

        // Purples
        { color: { r: 180, g: 0, b: 255 }, block: 'purple_concrete' },
        { color: { r: 140, g: 0, b: 200 }, block: 'purple_wool' },
        { color: { r: 255, g: 0, b: 255 }, block: 'magenta_concrete' },

        // Browns
        { color: { r: 140, g: 70, b: 20 }, block: 'brown_concrete' },
        { color: { r: 100, g: 50, b: 20 }, block: 'brown_wool' },
        { color: { r: 160, g: 120, b: 80 }, block: 'brown_terracotta' },

        // Pink
        { color: { r: 255, g: 180, b: 200 }, block: 'pink_concrete' },
        { color: { r: 220, g: 140, b: 160 }, block: 'pink_wool' },

        // Cyan
        { color: { r: 0, g: 255, b: 255 }, block: 'cyan_concrete' },
        { color: { r: 0, g: 180, b: 180 }, block: 'cyan_wool' },
    ];

    // Find closest color using simple RGB distance
    let closestBlock = colorBlocks[0].block;
    let closestDistance = Infinity;

    for (const item of colorBlocks) {
        const distance = Math.sqrt(
            Math.pow(r - item.color.r, 2) +
            Math.pow(g - item.color.g, 2) +
            Math.pow(b - item.color.b, 2)
        );

        if (distance < closestDistance) {
            closestDistance = distance;
            closestBlock = item.block;
        }
    }

    return closestBlock;
}

/**
 * Check if cheats are enabled (same as buildSomething)
 */
async function checkCheatsEnabled(bot: Bot): Promise<boolean> {
    const pos = bot.entity.position;
    const testCommand = `/tp ${bot.username} ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`;

    return new Promise((resolve) => {
        let responded = false;

        const checkResponse = (message: any) => {
            const text = message.toString();

            if (text.includes('permission') || text.includes('allowed') || text.includes('operator')) {
                responded = true;
                bot.removeListener('message', checkResponse);
                resolve(false);
            } else if (text.includes('Teleported') || text.includes(bot.username)) {
                responded = true;
                bot.removeListener('message', checkResponse);
                resolve(true);
            }
        };

        bot.on('message', checkResponse);
        bot.chat(testCommand);

        setTimeout(() => {
            if (!responded) {
                bot.removeListener('message', checkResponse);
                resolve(true);
            }
        }, 2000);
    });
} 