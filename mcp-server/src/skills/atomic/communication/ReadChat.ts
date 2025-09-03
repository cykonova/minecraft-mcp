import { injectable } from 'tsyringe';
import { Bot } from 'mineflayer';
import { AnyBot } from '../../../types.js';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IReadChatParams {
  count?: number;
  timeLimit?: number;
  filterType?: 'all' | 'chat' | 'whisper' | 'system' | 'actionbar' | 'title';
  filterUsername?: string;
}

interface ChatMessage {
  timestamp: Date;
  type: 'chat' | 'whisper' | 'system' | 'actionbar' | 'title';
  message: string;
  username?: string;
  rawMessage?: any;
}

// Store chat history per bot
const chatHistories = new WeakMap<AnyBot, ChatMessage[]>();
const MAX_HISTORY_SIZE = 1000; // Maximum messages to keep in history

/**
 * Atomic skill for reading recent chat messages
 * 
 * This skill returns recent chat messages that the bot has seen, including:
 * - Player chat messages
 * - System messages
 * - Whispers/private messages
 * - Action bar messages
 * - Title messages
 */
@injectable()
export class ReadChat extends AtomicSkill {
  readonly name = 'readChat';
  readonly description = 'Read recent chat messages from the Minecraft server';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of recent messages to return (default: 20, max: 100)',
        default: 20,
        minimum: 1,
        maximum: 100
      },
      timeLimit: {
        type: 'number',
        description: 'Only return messages from the last N seconds (optional)',
        minimum: 1,
        maximum: 3600
      },
      filterType: {
        type: 'string',
        enum: ['all', 'chat', 'whisper', 'system', 'actionbar', 'title'],
        description: 'Filter by message type',
        default: 'all'
      },
      filterUsername: {
        type: 'string',
        description: 'Filter messages by specific username (optional)'
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { count = 20, timeLimit, filterType = 'all', filterUsername } = params as IReadChatParams;

    // Initialize chat history for this bot if not exists
    if (!chatHistories.has(bot)) {
      this.initializeChatHistory(bot as Bot);
    }

    const history = chatHistories.get(bot) || [];

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

    return SkillResults.success(
      { 
        messages: recentMessages,
        formattedOutput: summary,
        messageCount: recentMessages.length
      }, 
      summary
    );
  }

  /**
   * Initialize chat history tracking for a bot
   */
  private initializeChatHistory(bot: Bot): void {
    // Don't initialize twice
    if (chatHistories.has(bot as AnyBot)) {
      return;
    }

    const history: ChatMessage[] = [];
    chatHistories.set(bot as AnyBot, history);

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
      chatHistories.delete(bot as AnyBot);
    });
  }

  /**
   * Estimate execution time - very fast operation
   */
  estimateExecutionTime(params: Record<string, any>): number {
    return 100; // 100ms - just reading from memory
  }

  /**
   * Always cancellable
   */
  isCancellable(): boolean {
    return true;
  }
}