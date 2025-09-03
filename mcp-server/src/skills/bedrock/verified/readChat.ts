import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

interface ChatMessage {
    timestamp: number;
    username: string;
    message: string;
    type: string;
}

/**
 * Read recent chat messages from the Minecraft Bedrock server
 * 
 * This skill retrieves the chat history showing recent messages sent by players.
 * It maintains a history of the last 100 messages for each bot instance.
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {number} params.count - Optional number of recent messages to retrieve (default: 10, max: 50)
 * @param {number} params.since - Optional timestamp to get messages after (in milliseconds)
 * @param {string} params.filter - Optional username to filter messages by
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true if chat was read successfully
 */
export const readChat = async (
    bot: UnifiedBot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'readChat';
    
    // Validate bot edition
    if (bot.edition !== 'bedrock') {
        bot.emit(
            'alteraBotEndObservation',
            `Error: readChat skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
        );
        return false;
    }

    const count = Math.min(params.count || 10, 50) as number;
    const since = params.since as number | undefined;
    const filter = params.filter as string | undefined;

    try {
        bot.emit(
            'alteraBotStartObservation',
            '📖 READING CHAT HISTORY 📖',
        );

        // Get chat history from the bot itself
        const history = (bot as any).getChatHistory ? (bot as any).getChatHistory() : [];
        
        // Filter messages based on parameters
        let filteredMessages = [...history];
        
        // Filter by timestamp if provided
        if (since !== undefined) {
            filteredMessages = filteredMessages.filter(msg => msg.timestamp > since);
        }
        
        // Filter by username if provided
        if (filter) {
            filteredMessages = filteredMessages.filter(msg => 
                msg.username.toLowerCase().includes(filter.toLowerCase())
            );
        }
        
        // Get the most recent messages up to the count
        const recentMessages = filteredMessages.slice(-count);
        
        if (recentMessages.length === 0) {
            bot.emit(
                'alteraBotEndObservation',
                'No chat messages found matching the criteria.',
            );
            return true;
        }
        
        // Format messages for output
        const formattedMessages: string[] = ['Recent chat messages:'];
        
        for (const msg of recentMessages) {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            const messageType = msg.type !== 'chat' ? ` [${msg.type}]` : '';
            formattedMessages.push(`[${timestamp}]${messageType} ${msg.username}: ${msg.message}`);
        }
        
        // Also provide current player list if available
        const players = (bot as any).getPlayers?.();
        if (players && players.length > 0) {
            formattedMessages.push('\nCurrently online players:');
            players.forEach((player: any) => {
                formattedMessages.push(`- ${player.username}`);
            });
        }
        
        bot.emit(
            'alteraBotEndObservation',
            formattedMessages.join('\n'),
        );
        
        return true;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        bot.emit(
            'alteraBotEndObservation',
            `Failed to read chat: ${errorMessage}`,
        );
        return false;
    }
};