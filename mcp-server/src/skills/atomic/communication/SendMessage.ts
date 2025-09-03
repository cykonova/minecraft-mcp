import { injectable } from 'tsyringe';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface ISendMessageParams {
  message: string;
  delay?: number;
  recipient?: string;
}

/**
 * Atomic skill for sending chat messages or commands
 * 
 * This skill handles:
 * - Regular chat messages
 * - Commands (messages starting with /)
 * - Private messages/whispers
 * - Message validation and formatting
 */
@injectable()
export class SendMessage extends AtomicSkill {
  readonly name = 'SendMessage';
  readonly description = 'Send a chat message, command, or whisper in the game';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;
  
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
        description: 'Delay in milliseconds before sending (default: 0)',
        default: 0,
        minimum: 0,
        maximum: 5000
      },
      recipient: {
        type: 'string',
        description: 'Username to send private message to (will use /msg command)'
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    let { message, delay = 0, recipient } = params as ISendMessageParams;

    // Validate message length (Minecraft limit)
    if (message.length > 256) {
      return SkillResults.error(`Message too long (${message.length} characters). Maximum is 256 characters`);
    }

    // Format as private message if recipient specified
    if (recipient && !message.startsWith('/')) {
      message = `/msg ${recipient} ${message}`;
      
      // Re-check length after formatting
      if (message.length > 256) {
        return SkillResults.error(`Message too long after formatting for private message (${message.length} characters)`);
      }
    }

    this.log('info', `Sending message: "${this.truncateForLog(message)}"`);

    try {
      // Apply delay if specified
      if (delay > 0) {
        this.log('debug', `Waiting ${delay}ms before sending message`);
        await bot.waitForTicks(Math.ceil(delay / 50)); // Convert ms to ticks
      }

      // Send the message
      bot.chat(message);

      // Determine message type for response
      const messageType = this.getMessageType(message, recipient);
      const truncatedMessage = this.truncateForLog(message);
      
      return SkillResults.success(null, `Sent ${messageType}: "${truncatedMessage}"`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to send message: ${errorMessage}`);
    }
  }

  /**
   * Determine the type of message being sent
   */
  private getMessageType(message: string, recipient?: string): string {
    if (recipient) {
      return 'private message';
    } else if (message.startsWith('/')) {
      if (message.startsWith('/msg ') || message.startsWith('/tell ') || message.startsWith('/w ')) {
        return 'whisper';
      } else {
        return 'command';
      }
    } else {
      return 'chat message';
    }
  }

  /**
   * Truncate message for logging purposes
   */
  private truncateForLog(message: string): string {
    return message.length > 50 ? message.substring(0, 50) + '...' : message;
  }

  /**
   * Resource requirements - none needed for basic chat
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