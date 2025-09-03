import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Make the bot run away from threats or a specific direction in Minecraft Bedrock Edition
 * 
 * This skill makes the bot move quickly away from its current position or
 * from the nearest entity/player. The bot will attempt to move to a safe distance.
 * 
 * Note: This is a simplified version compared to Java Edition. Advanced pathfinding
 * is not available, so the bot moves in a straight line away from the threat.
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {string} params.from - Optional: What to run from - 'players', 'entities', 'position' (default: 'position')
 * @param {number} params.distance - Distance to run in blocks (default: 20, max: 50)
 * @param {string} params.direction - Optional: Cardinal direction to run - 'north', 'south', 'east', 'west', 'random'
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if successfully ran away
 */
export const runAway = async (
    bot: UnifiedBot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'runAway';
    
    // Validate bot edition
    if (bot.edition !== 'bedrock') {
        bot.emit(
            'alteraBotEndObservation',
            `Error: runAway skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
        );
        return false;
    }

    // Parse parameters
    const from = (params.from || 'position') as string;
    const distance = Math.min(Math.max(params.distance || 20, 5), 50) as number;
    const direction = params.direction as string | undefined;

    try {
        bot.emit(
            'alteraBotStartObservation',
            `🏃 RUNNING AWAY 🏃`,
        );

        const currentPos = bot.getPosition();
        const bedrockBot = bot as any;
        
        let targetPos = { ...currentPos };
        let runDirection = '';

        // Determine where to run based on parameters
        if (from === 'players' || from === 'entities') {
            // Find nearest entity to run from
            const nearestEntity = bot.nearestEntity?.();
            
            if (nearestEntity && nearestEntity.position) {
                // Calculate direction away from entity
                const dx = currentPos.x - nearestEntity.position.x;
                const dz = currentPos.z - nearestEntity.position.z;
                const magnitude = Math.sqrt(dx * dx + dz * dz);
                
                if (magnitude > 0) {
                    // Normalize and multiply by distance
                    targetPos.x = currentPos.x + (dx / magnitude) * distance;
                    targetPos.z = currentPos.z + (dz / magnitude) * distance;
                    runDirection = `away from ${nearestEntity.username || nearestEntity.type || 'entity'}`;
                    
                    bot.emit(
                        'alteraBotTextObservation',
                        `Found ${nearestEntity.username || nearestEntity.type || 'entity'} nearby, running away!`,
                    );
                } else {
                    // Entity is at same position, run in random direction
                    const angle = Math.random() * 2 * Math.PI;
                    targetPos.x = currentPos.x + Math.cos(angle) * distance;
                    targetPos.z = currentPos.z + Math.sin(angle) * distance;
                    runDirection = 'in a random direction (entity too close)';
                }
            } else {
                // No entities found, run in specified or random direction
                bot.emit(
                    'alteraBotTextObservation',
                    'No entities found nearby, running in default direction',
                );
                // Fall back to position-based running handled below
            }
        }
        
        if (from === 'position' || !runDirection) {
            // Run in a specific or random direction from current position
            let angle: number;
            
            if (direction) {
                switch (direction.toLowerCase()) {
                    case 'north':
                        angle = Math.PI;
                        runDirection = 'north';
                        break;
                    case 'south':
                        angle = 0;
                        runDirection = 'south';
                        break;
                    case 'east':
                        angle = Math.PI / 2;
                        runDirection = 'east';
                        break;
                    case 'west':
                        angle = -Math.PI / 2;
                        runDirection = 'west';
                        break;
                    case 'random':
                    default:
                        angle = Math.random() * 2 * Math.PI;
                        runDirection = 'in a random direction';
                        break;
                }
            } else {
                angle = Math.random() * 2 * Math.PI;
                runDirection = 'in a random direction';
            }
            
            targetPos.x = currentPos.x + Math.cos(angle) * distance;
            targetPos.z = currentPos.z + Math.sin(angle) * distance;
        }

        bot.emit(
            'alteraBotTextObservation',
            `Running ${runDirection} for ${distance} blocks...`,
        );

        // Perform the escape in multiple quick movements for a "running" effect
        const steps = 5;
        const stepDistance = distance / steps;
        
        for (let i = 1; i <= steps; i++) {
            // Check if we should stop
            if (serviceParams.signal?.aborted) {
                bot.emit(
                    'alteraBotEndObservation',
                    'Run interrupted - stopping',
                );
                return false;
            }
            
            const progress = i / steps;
            const stepPos = {
                x: currentPos.x + (targetPos.x - currentPos.x) * progress,
                y: currentPos.y,
                z: currentPos.z + (targetPos.z - currentPos.z) * progress
            };
            
            await bedrockBot.moveTo(stepPos);
            
            // Look back occasionally while running
            if (i % 2 === 0) {
                await bedrockBot.lookAt(currentPos);
                await new Promise(resolve => setTimeout(resolve, 100));
                await bedrockBot.lookAt(targetPos);
            }
            
            // Small delay between steps for more natural movement
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const finalPos = bot.getPosition();
        const actualDistance = Math.sqrt(
            Math.pow(finalPos.x - currentPos.x, 2) + 
            Math.pow(finalPos.z - currentPos.z, 2)
        );

        bot.emit(
            'alteraBotEndObservation',
            `Successfully ran away ${runDirection}! Moved ${Math.round(actualDistance)} blocks.`,
        );

        return true;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        bot.emit(
            'alteraBotEndObservation',
            `Failed to run away: ${errorMessage}`,
        );
        return false;
    }
};