import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Make the bot rest to regenerate health in Minecraft Bedrock Edition
 * 
 * This skill makes the bot stand still and monitor its health regeneration.
 * The bot will rest until its health is full or the specified duration expires.
 * 
 * Note: Health regeneration in Minecraft requires the hunger bar to be
 * sufficiently full (typically 18+ hunger points).
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {number} params.duration - Maximum duration to rest in seconds (default: 30, max: 120)
 * @param {number} params.targetHealth - Target health to reach (default: 20 - full health)
 * @param {boolean} params.checkSafety - Whether to monitor for nearby threats (default: true)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if rest was successful
 */
export const rest = async (
    bot: UnifiedBot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'rest';
    
    // Validate bot edition
    if (bot.edition !== 'bedrock') {
        bot.emit(
            'alteraBotEndObservation',
            `Error: rest skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
        );
        return false;
    }

    // Parse parameters
    const duration = Math.min(Math.max(params.duration || 30, 1), 120) as number;
    const targetHealth = Math.min(Math.max(params.targetHealth || 20, 1), 20) as number;
    const checkSafety = params.checkSafety !== false;

    try {
        bot.emit(
            'alteraBotStartObservation',
            `😴 RESTING TO RECOVER 😴`,
        );

        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);
        const startHealth = bot.health || 20;
        const startPos = bot.getPosition();
        const bedrockBot = bot as any;

        // Check initial health
        if (startHealth >= targetHealth) {
            bot.emit(
                'alteraBotEndObservation',
                `Already at target health (${startHealth}/${targetHealth}). No need to rest.`,
            );
            return true;
        }

        bot.emit(
            'alteraBotTextObservation',
            `Starting health: ${startHealth}/20. Target: ${targetHealth}/20. Resting for up to ${duration} seconds...`,
        );

        // Check hunger level if available
        if (bot.food !== undefined && bot.food < 18) {
            bot.emit(
                'alteraBotTextObservation',
                `Warning: Hunger level is ${bot.food}/20. Health regeneration requires 18+ hunger.`,
            );
        }

        let lastHealth = startHealth;
        let checkCount = 0;
        let threatDetected = false;
        let healthIncreased = false;

        // Rest loop - check health every second
        while (Date.now() < endTime) {
            // Check if we should stop
            if (serviceParams.signal?.aborted) {
                bot.emit(
                    'alteraBotEndObservation',
                    'Rest interrupted by user',
                );
                return false;
            }

            // Check current health
            const currentHealth = bot.health || 20;
            
            // Health fully recovered
            if (currentHealth >= targetHealth) {
                const restDuration = Math.round((Date.now() - startTime) / 1000);
                bot.emit(
                    'alteraBotEndObservation',
                    `Health fully recovered! Restored ${currentHealth - startHealth} health in ${restDuration} seconds. Current health: ${currentHealth}/20`,
                );
                return true;
            }

            // Track health changes
            if (currentHealth > lastHealth) {
                healthIncreased = true;
                bot.emit(
                    'alteraBotTextObservation',
                    `Health regenerating: ${currentHealth}/20 (+${currentHealth - lastHealth})`,
                );
                lastHealth = currentHealth;
            } else if (currentHealth < lastHealth) {
                bot.emit(
                    'alteraBotTextObservation',
                    `Warning: Health decreased to ${currentHealth}/20! Possible damage taken.`,
                );
                lastHealth = currentHealth;
                
                if (checkSafety) {
                    threatDetected = true;
                    break;
                }
            }

            // Safety check - look for nearby threats
            if (checkSafety && checkCount % 5 === 0) {
                const nearestEntity = bot.nearestEntity?.();
                
                if (nearestEntity && nearestEntity.type !== 'player') {
                    const distance = calculateDistance(startPos, nearestEntity.position || startPos);
                    
                    if (distance < 10) {
                        bot.emit(
                            'alteraBotTextObservation',
                            `Threat detected: ${nearestEntity.type || 'entity'} within ${Math.round(distance)} blocks!`,
                        );
                        threatDetected = true;
                        break;
                    }
                }
                
                // Look around occasionally
                if (checkCount % 10 === 0) {
                    const angle = (checkCount / 10) * 90;
                    await bedrockBot.lookAt({
                        x: startPos.x + Math.cos(angle * Math.PI / 180) * 5,
                        y: startPos.y,
                        z: startPos.z + Math.sin(angle * Math.PI / 180) * 5
                    });
                }
            }

            checkCount++;
            
            // Wait 1 second before next check
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Rest period ended
        const finalHealth = bot.health || 20;
        const healthGained = finalHealth - startHealth;
        const restDuration = Math.round((Date.now() - startTime) / 1000);

        if (threatDetected) {
            bot.emit(
                'alteraBotEndObservation',
                `Rest interrupted due to nearby threat! Gained ${healthGained} health in ${restDuration} seconds. Current health: ${finalHealth}/20`,
            );
            return false;
        } else if (healthGained > 0) {
            bot.emit(
                'alteraBotEndObservation',
                `Rest period complete. Gained ${healthGained} health in ${restDuration} seconds. Current health: ${finalHealth}/20`,
            );
            return true;
        } else if (!healthIncreased) {
            bot.emit(
                'alteraBotEndObservation',
                `No health regeneration occurred during ${restDuration} seconds of rest. Current health: ${finalHealth}/20. Check hunger level (needs 18+).`,
            );
            return false;
        } else {
            bot.emit(
                'alteraBotEndObservation',
                `Rest period complete after ${restDuration} seconds. Current health: ${finalHealth}/20`,
            );
            return true;
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        bot.emit(
            'alteraBotEndObservation',
            `Failed to rest: ${errorMessage}`,
        );
        return false;
    }
};

/**
 * Calculate distance between two positions
 */
function calculateDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}