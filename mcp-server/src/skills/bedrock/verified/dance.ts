import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Make the bot dance by moving and jumping in Minecraft Bedrock Edition
 * 
 * This skill makes the bot perform a simple dance routine with random movements.
 * The bot will move in different directions and occasionally jump.
 * 
 * Note: This is a simplified version compared to Java Edition as Bedrock
 * protocol has limited movement control capabilities.
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {number} params.duration - Duration to dance in seconds (default: 10, max: 30)
 * @param {string} params.style - Optional dance style: 'spin', 'jump', 'random' (default: 'random')
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if the dance was completed
 */
export const dance = async (
    bot: UnifiedBot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'dance';
    
    // Validate bot edition
    if (bot.edition !== 'bedrock') {
        bot.emit(
            'alteraBotEndObservation',
            `Error: dance skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
        );
        return false;
    }

    // Parse parameters
    const duration = Math.min(Math.max(params.duration || 10, 1), 30) as number; // 1-30 seconds
    const style = (params.style || 'random') as string;

    try {
        bot.emit(
            'alteraBotStartObservation',
            `💃 STARTING ${style.toUpperCase()} DANCE 💃`,
        );

        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);
        const startPos = bot.getPosition();
        
        // Cast to access moveTo method
        const bedrockBot = bot as any;
        
        let moveCount = 0;
        const moves: Array<() => Promise<void>> = [];

        // Define dance moves based on style
        switch (style.toLowerCase()) {
            case 'spin':
                // Spin in a circle
                for (let angle = 0; angle < 360; angle += 45) {
                    const rad = (angle * Math.PI) / 180;
                    const x = startPos.x + Math.cos(rad) * 2;
                    const z = startPos.z + Math.sin(rad) * 2;
                    moves.push(async () => {
                        await bedrockBot.moveTo({ 
                            x, 
                            y: startPos.y, 
                            z 
                        });
                        await bedrockBot.lookAt({ 
                            x: startPos.x, 
                            y: startPos.y, 
                            z: startPos.z 
                        });
                    });
                }
                break;
                
            case 'jump':
                // Jump in place with small movements
                for (let i = 0; i < 8; i++) {
                    moves.push(async () => {
                        const offset = (i % 2 === 0) ? 0.5 : -0.5;
                        await bedrockBot.moveTo({ 
                            x: startPos.x + offset, 
                            y: startPos.y + 0.5, 
                            z: startPos.z + offset 
                        });
                        await new Promise(resolve => setTimeout(resolve, 200));
                        await bedrockBot.moveTo({ 
                            x: startPos.x, 
                            y: startPos.y, 
                            z: startPos.z 
                        });
                    });
                }
                break;
                
            case 'random':
            default:
                // Random movements within a small area
                for (let i = 0; i < 10; i++) {
                    moves.push(async () => {
                        const randomX = startPos.x + (Math.random() - 0.5) * 4;
                        const randomZ = startPos.z + (Math.random() - 0.5) * 4;
                        const randomY = startPos.y + (Math.random() > 0.7 ? 0.5 : 0);
                        
                        await bedrockBot.moveTo({ 
                            x: randomX, 
                            y: randomY, 
                            z: randomZ 
                        });
                        
                        // Random look direction
                        if (Math.random() > 0.5) {
                            await bedrockBot.lookAt({
                                x: randomX + (Math.random() - 0.5) * 10,
                                y: startPos.y + (Math.random() - 0.5) * 5,
                                z: randomZ + (Math.random() - 0.5) * 10
                            });
                        }
                    });
                }
                break;
        }

        // Perform the dance moves
        bot.emit(
            'alteraBotTextObservation',
            `Dancing with ${style} style for ${duration} seconds...`,
        );

        while (Date.now() < endTime) {
            // Check if we should stop
            if (serviceParams.signal?.aborted) {
                bot.emit(
                    'alteraBotEndObservation',
                    'Dance interrupted',
                );
                return false;
            }

            // Execute next move
            const move = moves[moveCount % moves.length];
            await move();
            moveCount++;

            // Small delay between moves
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Return to starting position
        await bedrockBot.moveTo(startPos);
        
        bot.emit(
            'alteraBotEndObservation',
            `Dance complete! Performed ${moveCount} moves in ${style} style for ${duration} seconds.`,
        );

        return true;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        bot.emit(
            'alteraBotEndObservation',
            `Failed to dance: ${errorMessage}`,
        );
        return false;
    }
};