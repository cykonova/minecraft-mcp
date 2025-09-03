import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Look around and observe the environment in Minecraft Bedrock Edition
 * 
 * This skill provides information about the bot's surroundings including:
 * - Current position and health
 * - Nearby players
 * - Basic environment information
 * 
 * Note: This is a simplified version compared to Java Edition due to
 * Bedrock protocol limitations. Advanced features like block detection,
 * inventory inspection, and biome information are not yet implemented.
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if the observation was successful
 */
export const lookAround = async (
    bot: UnifiedBot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'lookAround';
    
    // Validate bot edition
    if (bot.edition !== 'bedrock') {
        bot.emit(
            'alteraBotEndObservation',
            `Error: lookAround skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
        );
        return false;
    }

    bot.emit(
        'alteraBotStartObservation',
        `🔍 SCANNING BEDROCK ENVIRONMENT 🔍`,
    );

    try {
        bot.emit('alteraBotStartObservation', 'Looking around to observe the environment...');

        // Gather all observations
        const observations: string[] = [];

        // Location
        const pos = bot.getPosition();
        observations.push(`You are at coordinates X:${Math.floor(pos.x)}, Y:${Math.floor(pos.y)}, Z:${Math.floor(pos.z)}.`);

        // Health and food (if available)
        if (bot.health !== undefined) {
            observations.push(`Your health is ${bot.health}/20.`);
        }
        if (bot.food !== undefined) {
            observations.push(`Your hunger is ${bot.food}/20.`);
        }

        // Players nearby (if the bot wrapper provides this)
        const players = (bot as any).getPlayers?.();
        if (players && players.length > 0) {
            observations.push(`\nPlayers in the server:`);
            players.forEach((player: any) => {
                if (player.username !== bot.username) {
                    observations.push(`- ${player.username}`);
                }
            });
        } else {
            observations.push(`\nNo other players visible or player tracking not available.`);
        }

        // Entities nearby (simplified version)
        const nearbyEntity = bot.nearestEntity?.();
        if (nearbyEntity) {
            observations.push(`\nNearest entity: ${nearbyEntity.username || nearbyEntity.type || 'unknown'}`);
        }

        // Note about limitations
        observations.push(`\n⚠️ Note: This is a simplified Bedrock Edition observation.`);
        observations.push(`Advanced features available in Java Edition include:`);
        observations.push(`- Detailed block information`);
        observations.push(`- Full inventory listing`);
        observations.push(`- Biome detection`);
        observations.push(`- Weather and time of day`);
        observations.push(`- Detailed entity information`);
        observations.push(`These features require additional Bedrock protocol implementation.`);

        // Combine all observations
        const fullObservation = observations.join('\n');
        bot.emit('alteraBotEndObservation', fullObservation);

        return true;
    } catch (error) {
        console.error(`Error in Bedrock lookAround skill: ${error}`);
        bot.emit('alteraBotEndObservation', `Failed to look around: ${error}`);
        return false;
    }
};

/**
 * Helper function to calculate distance between two positions
 */
function calculateDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Helper function to get direction from bot to target
 */
function getDirection(from: { x: number; z: number }, to: { x: number; z: number }): string {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    
    const angle = Math.atan2(-dx, dz) * (180 / Math.PI);
    
    if (angle >= -22.5 && angle < 22.5) return 'north';
    if (angle >= 22.5 && angle < 67.5) return 'northeast';
    if (angle >= 67.5 && angle < 112.5) return 'east';
    if (angle >= 112.5 && angle < 157.5) return 'southeast';
    if (angle >= 157.5 || angle < -157.5) return 'south';
    if (angle >= -157.5 && angle < -112.5) return 'southwest';
    if (angle >= -112.5 && angle < -67.5) return 'west';
    if (angle >= -67.5 && angle < -22.5) return 'northwest';
    
    return 'unknown';
}