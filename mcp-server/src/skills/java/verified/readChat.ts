import { Bot } from 'mineflayer';
import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { validateSkillParams } from '../index.js';

// Store chat history per bot
const chatHistories = new WeakMap<Bot, ChatMessage[]>();
const MAX_HISTORY_SIZE = 1000; // Maximum messages to keep in history

interface ChatMessage {
    timestamp: Date;
    type: 'chat' | 'whisper' | 'system' | 'actionbar' | 'title';
    message: string;
    username?: string;
    rawMessage?: any;
}

/**
 * Read recent chat messages from the Minecraft server
 * 
 * This skill returns recent chat messages that the bot has seen, including:
 * - Player chat messages
 * - System messages
 * - Whispers/private messages
 * - Action bar messages
 * - Title messages
 * 
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {number} params.count - Number of recent messages to return (default: 20, max: 100)
 * @param {number} params.timeLimit - Only return messages from the last N seconds (optional)
 * @param {string} params.filterType - Filter by message type: 'all', 'chat', 'whisper', 'system' (default: 'all')
 * @param {string} params.filterUsername - Filter messages by specific username (optional)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * 
 * @return {Promise<boolean>} - Returns true after reading chat
 */
export const readChat = async (
    bot: Bot,
    params: ISkillParams,
    serviceParams: ISkillServiceParams,
): Promise<boolean> => {
    const skillName = 'readChat';
    const requiredParams: string[] = [];
    const isParamsValid = validateSkillParams(
        params,
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

    // Initialize chat history for this bot if not exists
    if (!chatHistories.has(bot)) {
        initializeChatHistory(bot);
    }

    const history = chatHistories.get(bot) || [];

    // Parse parameters with defaults
    const count = Math.min(params.count || 20, 100); // Cap at 100 messages
    const timeLimit = params.timeLimit as number | undefined;
    const filterType = (params.filterType || 'all') as string;
    const filterUsername = params.filterUsername as string | undefined;

    // Filter messages based on parameters
    let filteredMessages = [...history]; // Copy array to avoid mutation

    // Apply time filter if specified
    if (timeLimit && timeLimit > 0) {
        const cutoffTime = new Date(Date.now() - (timeLimit * 1000));
        filteredMessages = filteredMessages.filter(msg => msg.timestamp >= cutoffTime);
    }

    // Apply type filter
    if (filterType !== 'all') {
        filteredMessages = filteredMessages.filter(msg => msg.type === filterType);
    }

    // Apply username filter
    if (filterUsername) {
        filteredMessages = filteredMessages.filter(msg =>
            msg.username && msg.username.toLowerCase() === filterUsername.toLowerCase()
        );
    }

    // Get the most recent messages up to count
    const recentMessages = filteredMessages.slice(-count);

    // Format messages for output
    const formattedMessages = recentMessages.map(msg => {
        const timeStr = msg.timestamp.toLocaleTimeString();
        let formatted = `[${timeStr}]`;

        switch (msg.type) {
            case 'chat':
                formatted += ` <${msg.username || 'Unknown'}>: ${msg.message}`;
                break;
            case 'whisper':
                formatted += ` [Whisper] <${msg.username || 'Unknown'}>: ${msg.message}`;
                break;
            case 'system':
                formatted += ` [System] ${msg.message}`;
                break;
            case 'actionbar':
                formatted += ` [Action Bar] ${msg.message}`;
                break;
            case 'title':
                formatted += ` [Title] ${msg.message}`;
                break;
            default:
                formatted += ` ${msg.message}`;
        }

        return formatted;
    });

    // Create summary
    const summary = [
        `=== Chat History ===`,
        `Showing ${recentMessages.length} messages`,
        filterType !== 'all' ? `Filtered by type: ${filterType}` : '',
        filterUsername ? `Filtered by user: ${filterUsername}` : '',
        timeLimit ? `From last ${timeLimit} seconds` : '',
        `==================`,
        ...formattedMessages
    ].filter(line => line !== '').join('\n');

    bot.emit('alteraBotEndObservation', summary);

    return true;
};

/**
 * Initialize chat history tracking for a bot
 */
export function initializeChatHistory(bot: Bot): void {
    // Don't initialize twice
    if (chatHistories.has(bot)) {
        return;
    }

    const history: ChatMessage[] = [];
    chatHistories.set(bot, history);

    // Helper function to add message to history
    const addToHistory = (type: ChatMessage['type'], message: string, username?: string, rawMessage?: any) => {
        history.push({
            timestamp: new Date(),
            type,
            message: message.toString(),
            username,
            rawMessage
        });

        // Trim history if it gets too large
        if (history.length > MAX_HISTORY_SIZE) {
            history.splice(0, history.length - MAX_HISTORY_SIZE);
        }
    };

    // Listen to various chat events
    bot.on('chat', (username, message) => {
        addToHistory('chat', message, username);
    });

    bot.on('whisper', (username, message) => {
        addToHistory('whisper', message, username);
    });

    // System messages (server messages, join/leave, etc.)
    bot.on('message', (jsonMsg) => {
        // Skip if it's a regular chat message (already handled)
        const msgText = jsonMsg.toString();

        // Try to determine if it's a system message
        if (jsonMsg.json) {
            // Check if it's not a regular chat message
            const isChat = jsonMsg.json.translate === 'chat.type.text';
            const isWhisper = jsonMsg.json.translate === 'commands.message.display.incoming';

            if (!isChat && !isWhisper) {
                addToHistory('system', msgText, undefined, jsonMsg);
            }
        }
    });

    // Action bar messages
    bot.on('actionBar', (jsonMsg) => {
        if (jsonMsg) {
            addToHistory('actionbar', jsonMsg.toString(), undefined, jsonMsg);
        }
    });

    // Title messages
    bot.on('title', (text) => {
        if (text) {
            addToHistory('title', text.toString());
        }
    });

    // Clean up on bot end
    bot.once('end', () => {
        chatHistories.delete(bot);
    });
} 