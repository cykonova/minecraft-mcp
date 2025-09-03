import { injectable } from 'tsyringe';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface ISendChatParams {
  message: string;
  delay?: number;
}

/**
 * Atomic skill for sending chat messages or commands
 * 
 * This skill allows the bot to communicate in the game by sending:
 * - Regular chat messages visible to all players
 * - Commands (messages starting with /)
 * - Handles message validation and length limits
 */
@injectable()
export class SendChat extends AtomicSkill {
  readonly name = 'sendChat';
  readonly description = 'Send chat messages or commands to the Minecraft server';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['message'],
    properties: {
      message: {
        type: 'string',
        description: 'The message or command to send',
        minLength: 1,
        maxLength: 256
      },
      delay: {
        type: 'number',
        description: 'Optional delay in milliseconds before sending (default: 0, max: 5000)',
        default: 0,
        minimum: 0,
        maximum: 5000
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { message, delay = 0 } = params as ISendChatParams;

    // Validate message
    if (typeof message !== 'string') {
      return SkillResults.error('Message must be a string');
    }

    if (message.length === 0) {
      return SkillResults.error('Cannot send an empty message');
    }

    // Minecraft chat has a character limit
    if (message.length > 256) {
      return SkillResults.error(
        `Message is too long (${message.length} characters). Maximum length is 256 characters.`
      );
    }

    try {
      // Apply delay if specified
      if (delay > 0) {
        this.log('debug', `Waiting ${delay}ms before sending message...`);
        await bot.waitForTicks(Math.ceil(delay / 50)); // Convert ms to ticks (20 ticks = 1 second)
      }

      // Send the message
      bot.chat(message);

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
      const successMessage = `Sent ${messageType}: "${truncatedMessage}"`;
      
      return SkillResults.success(null, successMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to send message: ${errorMessage}`);
    }
  }

  /**
   * Resource requirements for chat
   */
  getResourceRequirements(params: Record<string, any>) {
    const requirements: any = {};
    
    // If it's a command, might need permissions
    if (params.message?.startsWith('/')) {
      requirements.permissions = ['command'];
    }
    
    return requirements;
  }

  /**
   * Estimate execution time - very fast operation
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const baseTime = 100; // 100ms base
    const delay = params.delay || 0;
    return baseTime + delay;
  }

  /**
   * Chat is always cancellable
   */
  isCancellable(): boolean {
    return true;
  }
}