import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';
import { Entity } from 'prismarine-entity';
import { Item } from 'prismarine-item';
import minecraftData from 'minecraft-data';

import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { validateSkillParams } from '../index.js';

interface SkillParams {
    // No parameters needed for this skill
}

interface ServiceParams {
    signal: AbortSignal;
    cancelExecution: () => void;
    resetTimeout: () => void;
    getStatsData: () => any;
    setStatsData: (data: any) => void;
}

// Helper function to check if a block is exposed to air
function canSeeBlock(bot: Bot, position: Vec3): boolean {
    const offsets = [
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 },
    ];

    return offsets.some((offset) => {
        const newPos = position.plus(new Vec3(offset.x, offset.y, offset.z));
        const block = bot.blockAt(newPos);
        return block && block.transparent;
    });
}

// Helper function to parse block info
function parseBlockInfo(bot: Bot, block: Block): string {
    let retVal = block.name;
    const mcData = minecraftData(bot.version);

    try {
        // Check if it's a fully grown crop
        if (isFullyGrownCrop(block)) {
            retVal = 'fully grown ' + block.name;
        }

        // Check if it's farmland
        if (block.type === mcData.blocksByName.farmland?.id) {
            const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
            if (blockAbove && blockAbove.type === mcData.blocksByName.air?.id) {
                retVal = 'empty ' + block.name;
            } else {
                retVal = 'planted ' + block.name;
            }
        }
    } catch (err) {
        // Ignore parsing errors
    }

    return retVal;
}

// Helper function to check if a crop is fully grown
function isFullyGrownCrop(block: Block): boolean {
    if (!block) return false;

    const blockName = block.name;
    const properties = block.getProperties();

    switch (blockName) {
        case 'wheat':
            return properties.age === 7;
        case 'carrots':
            return properties.age === 7;
        case 'potatoes':
            return properties.age === 7;
        case 'beetroots':
            return properties.age === 3;
        case 'nether_wart':
            return properties.age === 3;
        default:
            return false;
    }
}

// Get nearby blocks within radius
function getNearbyBlocks(bot: Bot, radius: number = 16): string[] {
    const blockTypes: Set<string> = new Set();
    if (!bot.entity) return [];

    const position = bot.entity.position.floored();
    const maxDistanceXZ = radius;
    const maxDistanceY = Math.min(radius, 10); // Limit vertical scanning

    for (let x = -maxDistanceXZ; x <= maxDistanceXZ; x++) {
        for (let y = -maxDistanceY; y <= maxDistanceY; y++) {
            for (let z = -maxDistanceXZ; z <= maxDistanceXZ; z++) {
                const blockPos = position.offset(x, y, z);
                const block = bot.blockAt(blockPos);
                if (block && block.type !== 0 && canSeeBlock(bot, block.position)) {
                    blockTypes.add(parseBlockInfo(bot, block));
                }
            }
        }
    }

    return Array.from(blockTypes);
}

// Get nearby entities
function getNearbyEntities(bot: Bot, radius: number = 16): string[] {
    if (!bot.entities || !bot.entity) return [];

    const allEntities = Object.values(bot.entities);
    const mcData = minecraftData(bot.version);

    const nearbyEntities = allEntities.filter((e: Entity) => {
        if (e.id !== bot.entity.id &&
            e.position.distanceTo(bot.entity.position) < radius) {
            const block = bot.blockAt(e.position);
            return block && bot.canSeeBlock(block);
        }
        return false;
    });

    // Sort by distance
    nearbyEntities.sort((a, b) =>
        a.position.distanceTo(bot.entity.position) -
        b.position.distanceTo(bot.entity.position)
    );

    return nearbyEntities.map((entity: Entity) => {
        let name = entity.name || '';

        // Handle item entities
        if ((name === 'item' || name === 'Item') && entity.metadata) {
            const metadata = entity.metadata as any[];
            if (metadata.length > 8 && metadata[8]) {
                const itemCount = metadata[8].itemCount;
                const itemId = metadata[8].itemId;
                if (mcData.items[itemId]?.displayName) {
                    name = itemCount > 0
                        ? `${itemCount} ${mcData.items[itemId].displayName}`
                        : mcData.items[itemId].displayName;
                }
            }
        }

        // Handle player entities
        if (name === 'player' && entity.username) {
            name = entity.username;
        }

        const distance = Math.round(entity.position.distanceTo(bot.entity.position));
        return `${name} (${distance} blocks away)`;
    }).filter(item => item !== '');
}

// Get time of day as string
function getTimeOfDay(bot: Bot): string {
    if (!bot.time) return 'unknown';
    const timeOfDay = bot.time.timeOfDay / 24000;

    if (timeOfDay < 0.25) return 'morning';
    else if (timeOfDay < 0.5) return 'noon';
    else if (timeOfDay < 0.75) return 'evening';
    else return 'night';
}

// Get weather observation
function getWeather(bot: Bot): string {
    if (bot.thunderState > 0) return 'thunderstorm';
    else if (bot.isRaining) return 'raining';
    else return 'clear';
}

// Get inventory summary
function getInventorySummary(bot: Bot): Record<string, number> {
    const inventory = bot.inventory;
    const items: Record<string, number> = {};

    inventory.items().forEach((item: Item) => {
        const itemName = item.name;
        items[itemName] = (items[itemName] || 0) + item.count;
    });

    return items;
}

export const lookAround = async (
    bot: Bot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'lookAround';
    const requiredParams: string[] = [];
    const isParamsValid = validateSkillParams(
        { ...serviceParams },
        requiredParams,
        skillName,
    );
    if (!isParamsValid) {
        serviceParams.cancelExecution?.();
        bot.emit(
            'alteraBotEndObservation',
            `Mistake: You didn't provide all of the required parameters ${requiredParams.join(', ')} for the ${skillName} skill.`,
        );
        return false;
    }

    bot.emit(
        'alteraBotStartObservation',
        `🔍 SCANNING ENVIRONMENT 🔍`,
    );

    const mcData = minecraftData(bot.version);

    try {
        bot.emit('alteraBotStartObservation', 'Looking around to observe the environment...');

        // Gather all observations
        const observations: string[] = [];

        // Location
        const pos = bot.entity.position;
        observations.push(`You are at coordinates X:${Math.floor(pos.x)}, Y:${Math.floor(pos.y)}, Z:${Math.floor(pos.z)}.`);

        // Health and food
        observations.push(`Your health is ${bot.health}/20 and hunger is ${bot.food}/20.`);

        // Time and weather
        const timeOfDay = getTimeOfDay(bot);
        const weather = getWeather(bot);
        observations.push(`It is ${timeOfDay} and the weather is ${weather}.`);

        // Biome
        const block = bot.blockAt(bot.entity.position);
        if (block && block.biome) {
            const biomeName = mcData.biomes[block.biome.id]?.name || 'unknown';
            observations.push(`You are in a ${biomeName} biome.`);
        }

        // Held item
        const heldItem = bot.heldItem;
        if (heldItem) {
            observations.push(`You are holding ${heldItem.name}.`);
        } else {
            observations.push(`You are not holding anything.`);
        }

        // Nearby blocks
        const nearbyBlocks = getNearbyBlocks(bot, 16);
        if (nearbyBlocks.length > 0) {
            observations.push(`\nYou see these blocks around you:`);
            // Group similar blocks
            const blockCounts: Record<string, number> = {};
            nearbyBlocks.forEach(block => {
                blockCounts[block] = (blockCounts[block] || 0) + 1;
            });

            // Sort by count (most common first)
            const sortedBlocks = Object.entries(blockCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15); // Limit to top 15 for readability

            sortedBlocks.forEach(([block, count]) => {
                observations.push(`- ${count} ${block}`);
            });

            if (nearbyBlocks.length > 15) {
                observations.push(`... and ${nearbyBlocks.length - 15} other block types`);
            }
        }

        // Nearby entities
        const nearbyEntities = getNearbyEntities(bot, 16);
        if (nearbyEntities.length > 0) {
            observations.push(`\nYou see these entities nearby:`);
            nearbyEntities.forEach(entity => {
                observations.push(`- ${entity}`);
            });
        }

        // Inventory summary
        const inventory = getInventorySummary(bot);
        const itemCount = Object.keys(inventory).length;
        if (itemCount > 0) {
            observations.push(`\nYour inventory contains ${itemCount} different items:`);
            const sortedInventory = Object.entries(inventory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10); // Show top 10 items

            sortedInventory.forEach(([item, count]) => {
                observations.push(`- ${item}: ${count}`);
            });

            if (itemCount > 10) {
                observations.push(`... and ${itemCount - 10} other item types`);
            }
        } else {
            observations.push(`\nYour inventory is empty.`);
        }

        // Check if drowning
        if (bot.oxygenLevel && bot.oxygenLevel < 20) {
            observations.push(`\nWARNING: You are underwater! Oxygen level: ${bot.oxygenLevel}/20`);
        }

        // Current interface
        if ((bot as any).currentInterface) {
            const currentInterface = (bot as any).currentInterface;
            observations.push(`\nYou have a ${currentInterface.title || 'interface'} open.`);
        }

        // Combine all observations
        const fullObservation = observations.join('\n');
        bot.emit('alteraBotEndObservation', fullObservation);

        return true;
    } catch (error) {
        console.error(`Error in lookAround skill: ${error}`);
        bot.emit('alteraBotEndObservation', `Failed to look around: ${error}`);
        return false;
    }
}


