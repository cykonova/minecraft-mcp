import { injectable } from 'tsyringe';
import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillResult } from '../SkillResult.js';
import { SkillDependencyMap, ExecutionStep } from '../ICompositeSkill.js';

/**
 * Example composite skill demonstrating advanced orchestration capabilities
 * 
 * This skill showcases:
 * - Multi-step execution planning
 * - Dependency injection and management
 * - Error handling and partial failure recovery
 * - Progress tracking
 * - Execution optimization
 */
@injectable()
export class ExampleCompositeSkill extends CompositeSkill {
    readonly name = 'exampleComposite';
    readonly description = 'Example composite skill showing orchestration of multiple atomic skills';
    readonly edition = 'java' as const;
    readonly category = 'library' as const;

    // Dependencies - these would be actual skill names in a real implementation
    readonly skillDependencies = [
        'exampleAtomic',  // The atomic skill we created above
        'lookAround',     // Hypothetical skill to look around
        'sendChat',       // Hypothetical skill to send chat
    ];

    readonly inputSchema = {
        type: 'object',
        properties: {
            welcomeMessage: {
                type: 'string',
                description: 'Welcome message to send',
                default: 'Hello, I am a Minecraft bot!',
            },
            lookAroundFirst: {
                type: 'boolean',
                description: 'Whether to look around before greeting',
                default: true,
            },
            followUpMessages: {
                type: 'array',
                items: {
                    type: 'string',
                },
                description: 'Additional messages to send after greeting',
                default: [],
            },
            delayBetweenSteps: {
                type: 'number',
                description: 'Delay between execution steps in milliseconds',
                minimum: 0,
                maximum: 10000,
                default: 2000,
            },
        },
        required: [],
    };

    /**
     * Create execution steps based on parameters
     */
    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        const steps: Omit<ExecutionStep, 'id'>[] = [];
        const { welcomeMessage, lookAroundFirst, followUpMessages, delayBetweenSteps } = params;

        // Step 1: Look around (optional)
        if (lookAroundFirst) {
            steps.push({
                skillName: 'lookAround',
                description: 'Look around to assess the environment',
                params: {
                    range: 50,
                    includeEntities: true,
                },
                estimatedTime: 3000,
                optional: true, // This step can fail without aborting the whole process
            });
        }

        // Step 2: Send welcome message
        steps.push({
            skillName: 'exampleAtomic',
            description: 'Send welcome message',
            params: {
                message: welcomeMessage || 'Hello, I am a Minecraft bot!',
                count: 1,
                delay: 0,
            },
            estimatedTime: 2000,
            optional: false,
            dependsOn: lookAroundFirst ? [`${this.name}-step-1`] : undefined,
        });

        // Step 3+: Send follow-up messages
        if (followUpMessages && Array.isArray(followUpMessages)) {
            followUpMessages.forEach((message, index) => {
                steps.push({
                    skillName: 'exampleAtomic',
                    description: `Send follow-up message ${index + 1}`,
                    params: {
                        message,
                        count: 1,
                        delay: delayBetweenSteps || 2000,
                    },
                    estimatedTime: 2000 + (delayBetweenSteps || 2000),
                    optional: true, // Follow-up messages are optional
                    dependsOn: [`${this.name}-step-${lookAroundFirst ? index + 2 : index + 1}`],
                });
            });
        }

        return steps;
    }

    /**
     * Main composite execution
     */
    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        this.log('info', 'Starting example composite skill execution');

        try {
            // Execute using the enhanced composite pattern
            return await this.executeCompositeSkill(context, dependencies);

        } catch (error) {
            return this.handlePlanExecutionError(error, context);
        }
    }

    /**
     * Enhanced dependency validation
     */
    validateDependencies(dependencies: SkillDependencyMap): string[] | undefined {
        const errors = super.validateDependencies(dependencies);
        
        // Additional validation - check that atomic skills are available
        const requiredAtomicSkills = ['exampleAtomic'];
        
        for (const skillName of requiredAtomicSkills) {
            if (dependencies[skillName] && dependencies[skillName].type !== 'atomic') {
                errors?.push(`Skill '${skillName}' must be an atomic skill`);
            }
        }

        return errors;
    }

    /**
     * Custom partial failure handling
     */
    async handlePartialFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        this.log('warn', `Step '${step.description}' failed: ${(error as any).error}`);

        // Handle specific failure scenarios
        if (step.skillName === 'lookAround') {
            this.log('info', 'Looking around failed, but continuing with greeting');
            return true; // Continue execution
        }

        if (step.skillName === 'exampleAtomic' && step.optional) {
            this.log('info', 'Optional message failed, continuing');
            return true;
        }

        // For critical steps, check if the error is recoverable
        if (this.isRecoverableError(error)) {
            this.log('info', 'Error appears recoverable, attempting to continue');
            return true;
        }

        // Default behavior for non-recoverable errors
        return await super.handlePartialFailure(step, error, context);
    }

    /**
     * Enhanced rollback support
     */
    protected supportsRollback(): boolean {
        return true;
    }

    /**
     * Rollback individual steps (example implementation)
     */
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        this.log('info', `Attempting rollback for step ${stepId}`);

        // For chat messages, we could send a "correction" message
        // This is just an example - real rollback would depend on the specific skill
        try {
            const bot = context.bot as any;
            if (bot.chat && stepId.includes('message')) {
                await bot.chat('Previous message retracted due to execution error');
            }
        } catch (error) {
            this.log('warn', `Rollback failed for step ${stepId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Custom parameter validation for composite logic
     */
    protected async performCustomValidation(params: Record<string, any>): Promise<{ errors: string[], warnings: string[] }> {
        const { errors, warnings } = await super.performCustomValidation(params);

        // Validate follow-up messages
        if (params.followUpMessages && Array.isArray(params.followUpMessages)) {
            if (params.followUpMessages.length > 5) {
                warnings.push('Many follow-up messages may take a long time to execute');
            }

            for (let i = 0; i < params.followUpMessages.length; i++) {
                const message = params.followUpMessages[i];
                if (typeof message !== 'string' || message.trim().length === 0) {
                    errors.push(`Follow-up message at index ${i} must be a non-empty string`);
                }
            }
        }

        // Validate timing
        if (params.delayBetweenSteps && typeof params.delayBetweenSteps === 'number') {
            if (params.followUpMessages && params.followUpMessages.length > 0) {
                const totalDelay = params.delayBetweenSteps * params.followUpMessages.length;
                if (totalDelay > 30000) {
                    warnings.push(`Total delay time (~${Math.round(totalDelay/1000)}s) is quite long`);
                }
            }
        }

        return { errors, warnings };
    }

    /**
     * Estimate execution time based on steps
     */
    estimateExecutionTime(params: Record<string, any>): number {
        const steps = this.createExecutionSteps(params);
        
        // Calculate total time including dependencies
        let totalTime = 0;
        for (const step of steps) {
            totalTime += step.estimatedTime;
        }

        // Add buffer time for orchestration
        return totalTime + 2000;
    }
}