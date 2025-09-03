import { injectable } from 'tsyringe';
import { AtomicSkill } from '../AtomicSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillResult } from '../SkillResult.js';

/**
 * Example atomic skill demonstrating the enhanced base class features
 * 
 * This skill showcases:
 * - Advanced parameter validation
 * - Resource requirement specification
 * - Execution time estimation
 * - Lifecycle hooks
 * - Enhanced error handling
 */
@injectable()
export class ExampleAtomicSkill extends AtomicSkill {
    readonly name = 'exampleAtomic';
    readonly description = 'Example atomic skill showing enhanced base class features';
    readonly edition = 'java' as const;
    readonly category = 'library' as const;

    readonly inputSchema = {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'Message to send in chat',
                minLength: 1,
                maxLength: 256,
            },
            count: {
                type: 'number',
                description: 'Number of times to send the message',
                minimum: 1,
                maximum: 10,
            },
            delay: {
                type: 'number',
                description: 'Delay between messages in milliseconds',
                minimum: 100,
                maximum: 5000,
            },
        },
        required: ['message'],
    };

    /**
     * Main skill execution
     */
    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        const { message, count = 1, delay = 1000 } = context.params;

        try {
            const results: string[] = [];

            for (let i = 0; i < count; i++) {
                const chatMessage = count > 1 ? `${message} (${i + 1}/${count})` : message;
                
                // Send chat message
                await (context.bot as any).chat(chatMessage);
                results.push(chatMessage);

                this.log('info', `Sent message: ${chatMessage}`);

                // Wait between messages if needed
                if (i < count - 1 && delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            return this.createSuccessResult(
                results,
                `Successfully sent ${count} message(s)`,
                [`Messages sent: ${results.join(', ')}`]
            );

        } catch (error) {
            return this.createErrorResult(
                `Failed to send chat message: ${error instanceof Error ? error.message : String(error)}`,
                'CHAT_SEND_FAILED',
                { originalError: error }
            );
        }
    }

    /**
     * Enhanced parameter validation with custom logic
     */
    protected async performCustomValidation(params: Record<string, any>): Promise<{ errors: string[], warnings: string[] }> {
        const { errors, warnings } = await super.performCustomValidation(params);

        // Custom validation for message content
        if (params.message && typeof params.message === 'string') {
            if (params.message.trim() !== params.message) {
                warnings.push('Message has leading/trailing whitespace');
            }

            if (params.message.includes('&') || params.message.includes('§')) {
                warnings.push('Message contains color codes that may not display correctly');
            }

            if (params.message.length > 100) {
                warnings.push('Long messages may be truncated in some Minecraft versions');
            }
        }

        // Validate timing parameters
        if (params.count && params.delay && typeof params.count === 'number' && typeof params.delay === 'number') {
            const totalTime = params.count * params.delay;
            if (totalTime > 30000) { // 30 seconds
                warnings.push(`Total execution time (~${Math.round(totalTime/1000)}s) may be quite long`);
            }
        }

        return { errors, warnings };
    }

    /**
     * Resource requirements - none for chat
     */
    getResourceRequirements(params: Record<string, any>): {
        items?: string[];
        tools?: string[];
        permissions?: string[];
        environment?: string[];
    } {
        return {
            permissions: ['chat'], // Hypothetical permission
            environment: ['multiplayer'], // Works better in multiplayer
        };
    }

    /**
     * Execution time estimation based on count and delay
     */
    estimateExecutionTime(params: Record<string, any>): number {
        const count = params.count || 1;
        const delay = params.delay || 1000;
        
        // Base time + delays between messages
        const baseTime = 1000; // 1 second base
        const delayTime = Math.max(0, count - 1) * delay;
        
        return baseTime + delayTime;
    }

    /**
     * This skill can be cancelled
     */
    isCancellable(): boolean {
        return true;
    }

    /**
     * Lifecycle hook: before execution
     */
    protected async beforeExecute(context: ISkillContext): Promise<void> {
        await super.beforeExecute(context);
        
        // Check if bot can chat
        const bot = context.bot as any;
        if (!bot.chat || typeof bot.chat !== 'function') {
            throw new Error('Bot does not support chat functionality');
        }

        this.log('debug', 'Chat functionality verified');
    }

    /**
     * Lifecycle hook: after execution
     */
    protected async afterExecute(context: ISkillContext, result: SkillResult): Promise<void> {
        await super.afterExecute(context, result);
        
        if (result.success && result.data) {
            const messageCount = Array.isArray(result.data) ? result.data.length : 1;
            this.log('info', `Chat skill completed successfully. Sent ${messageCount} message(s).`);
        }
    }
}