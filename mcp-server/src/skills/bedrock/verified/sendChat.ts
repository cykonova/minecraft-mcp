import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Send chat messages or commands to the Minecraft Bedrock server
 * 
 * This skill allows the bot to communicate in the game by sending:
 * - Regular chat messages visible to all players
 * - Commands (messages starting with /)
 * - Whispers/private messages using /msg or /tell
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {string} params.message - The message or command to send
 * @param {number} params.delay - Optional delay in milliseconds before sending (default: 0, max: 5000)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if the message was sent successfully
 */
export const sendChat = async (
    bot: UnifiedBot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'sendChat';
    
    // Validate bot edition
    if (bot.edition !== 'bedrock') {
        bot.emit(
            'alteraBotEndObservation',
            `Error: sendChat skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
        );
        return false;
    }

    // Validate required parameters
    if (!params.message) {
        serviceParams.cancelExecution?.();
        bot.emit(
            'alteraBotEndObservation',
            `Mistake: You didn't provide the required parameter 'message' for the ${skillName} skill.`,
        );
        return false;
    }

    const message = params.message as string;
    const delay = Math.min(params.delay || 0, 5000) as number; // Cap delay at 5 seconds

    // Validate message
    if (typeof message !== 'string') {
        bot.emit(
            'alteraBotEndObservation',
            'Message must be a string',
        );
        return false;
    }

    if (message.length === 0) {
        bot.emit(
            'alteraBotEndObservation',
            'Cannot send an empty message',
        );
        return false;
    }

    // Minecraft Bedrock has a character limit (same as Java)
    if (message.length > 256) {
        bot.emit(
            'alteraBotEndObservation',
            `Message is too long (${message.length} characters). Maximum length is 256 characters.`,
        );
        return false;
    }

    try {
        // Apply delay if specified
        if (delay > 0) {
            bot.emit(
                'alteraBotTextObservation',
                `Waiting ${delay}ms before sending message...`,
            );
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Send the message using the bot's chat method
        await bot.chat(message);

        // Determine message type for feedback
        let messageType = 'chat message';
        if (message.startsWith('/')) {
            if (message.startsWith('/msg ') || message.startsWith('/tell ') || message.startsWith('/w ')) {
                messageType = 'whisper';
            } else {
                messageType = 'command';
            }
        }

        // Log what was sent
        const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;
        bot.emit(
            'alteraBotEndObservation',
            `Sent ${messageType}: "${truncatedMessage}"`,
        );

        return true;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        bot.emit(
            'alteraBotEndObservation',
            `Failed to send message: ${errorMessage}`,
        );
        return false;
    }
};

/**
 * Helper function to split long messages into multiple parts
 * (Not exported, but could be useful for future enhancements)
 */
function splitMessage(message: string, maxLength: number = 256): string[] {
    const parts: string[] = [];
    let currentPart = '';

    const words = message.split(' ');
    for (const word of words) {
        if (currentPart.length + word.length + 1 > maxLength) {
            if (currentPart) {
                parts.push(currentPart.trim());
                currentPart = word;
            } else {
                // Single word is too long, split it
                parts.push(word.substring(0, maxLength));
                currentPart = word.substring(maxLength);
            }
        } else {
            currentPart += (currentPart ? ' ' : '') + word;
        }
    }

    if (currentPart) {
        parts.push(currentPart.trim());
    }

    return parts;
}