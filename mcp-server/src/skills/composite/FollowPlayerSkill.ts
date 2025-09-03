import { injectable } from 'tsyringe';
import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../ICompositeSkill.js';
import { SkillResult } from '../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../decorators/skillDependency.js';
import { ISkill } from '../ISkill.js';

/**
 * Composite skill for following a player around with advanced behavior
 * 
 * This skill combines multiple atomic skills to create intelligent following behavior:
 * - Tracks player movement continuously
 * - Maintains optimal distance
 * - Handles obstacles and pathfinding
 * - Provides status updates
 * - Recovers from failures automatically
 */
@injectable()
@autoResolveDependencies
export class FollowPlayerSkill extends CompositeSkill {
    readonly name = 'followPlayer';
    readonly description = 'Follows a specified player around, maintaining a safe distance and providing continuous updates';
    readonly category = 'composite' as const;
    readonly version = '1.0.0';
    readonly edition = 'java' as const;
    
    // Dependency injection properties
    @skillDependency({ 
        name: 'goToSomeone', 
        edition: 'java',
        category: 'verified'
    })
    private goToSomeone!: ISkill;
    
    @skillDependency({ 
        name: 'lookAround',
        edition: 'java',
        category: 'verified'
    })
    private lookAround!: ISkill;
    
    @skillDependency({ 
        name: 'readChat',
        edition: 'java',
        category: 'verified',
        optional: true
    })
    private chatReader?: ISkill;

    // Required abstract properties
    readonly skillDependencies = ['goToSomeone', 'lookAround', 'readChat'];
    readonly inputSchema = {
        type: 'object',
        properties: {
            playerName: { type: 'string', description: 'Name of the player to follow' },
            distance: { type: 'number', minimum: 1, maximum: 10, default: 3, description: 'Distance to maintain' },
            duration: { type: 'number', minimum: 10, maximum: 3600, default: 300, description: 'Follow duration in seconds' },
            stopOnCommand: { type: 'boolean', default: true, description: 'Stop on chat commands' }
        },
        required: ['playerName']
    };

    // Execution state
    private followingActive = false;
    private targetPlayer = '';
    private followDistance = 3;
    private lastPlayerPosition: { x: number, y: number, z: number } | null = null;
    private followInterval: NodeJS.Timeout | null = null;

    constructor() {
        super();
    }

    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        const { playerName, distance = 3, duration = 300 } = params;
        
        return [
            {
                skillName: 'lookAround',
                params: { mode: 'players' },
                description: 'Scan for target player',
                estimatedTime: 2000,
                optional: false
            },
            {
                skillName: 'goToSomeone',
                params: { 
                    userName: playerName, 
                    distance,
                    keepFollowing: true 
                },
                description: `Move to ${playerName} and start following`,
                estimatedTime: 5000,
                optional: false
            },
            {
                skillName: 'followPlayer',
                params: { 
                    playerName, 
                    distance, 
                    duration,
                    continuous: true 
                },
                description: `Continuously follow ${playerName} for ${duration}s`,
                estimatedTime: duration * 1000,
                optional: false
            }
        ];
    }

    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        // Inject dependencies
        Object.assign(this, dependencies);

        const { playerName, distance = 3, duration = 300, stopOnCommand = true } = context.params;

        if (!playerName) {
            return this.createErrorResult(
                'Player name is required for following',
                'MISSING_PARAMETER'
            );
        }

        this.targetPlayer = playerName;
        this.followDistance = Math.max(1, Math.min(10, distance));

        // Start the continuous following process
        return this.startFollowing(context, dependencies, duration, stopOnCommand);
    }

    private async startFollowing(
        context: ISkillContext, 
        dependencies: SkillDependencyMap,
        duration: number,
        stopOnCommand: boolean
    ): Promise<SkillResult> {
        this.followingActive = true;
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);

        this.log('info', `Starting to follow ${this.targetPlayer} for ${duration} seconds`);

        try {
            // Initial scan to locate the player
            const scanResult = await this.executeDependency(
                'lookAround',
                { mode: 'players' },
                context,
                dependencies
            );

            if (!scanResult.success) {
                return this.createErrorResult(
                    'Failed to scan for players',
                    'SCAN_FAILED',
                    { scanResult }
                );
            }

            // Start following loop
            while (this.followingActive && Date.now() < endTime) {
                if (context.signal?.aborted) {
                    this.followingActive = false;
                    break;
                }

                // Move to player
                const moveResult = await this.executeDependency(
                    'goToSomeone',
                    {
                        userName: this.targetPlayer,
                        distance: this.followDistance,
                        keepFollowing: false // We handle the continuous following ourselves
                    },
                    context,
                    dependencies
                );

                if (!moveResult.success) {
                    this.log('warn', `Failed to reach ${this.targetPlayer}, retrying...`);
                    // Don't abort, just wait and retry
                    await this.sleep(2000);
                    continue;
                }

                // Check for stop commands in chat if enabled
                if (stopOnCommand && this.chatReader) {
                    const chatResult = await this.executeDependency(
                        'readChat',
                        { recent: true, limit: 5 },
                        context,
                        dependencies
                    );

                    if (chatResult.success && this.shouldStopFollowing(chatResult.data)) {
                        this.followingActive = false;
                        this.log('info', 'Stopping follow due to chat command');
                        break;
                    }
                }

                // Update status
                const elapsed = (Date.now() - startTime) / 1000;
                const remaining = Math.max(0, duration - elapsed);
                
                this.log('debug', 
                    `Following ${this.targetPlayer} - ${remaining.toFixed(0)}s remaining`
                );

                // Short delay before next follow attempt
                await this.sleep(1000);
            }

            this.followingActive = false;
            
            const actualDuration = (Date.now() - startTime) / 1000;
            return this.createSuccessResult(
                {
                    playerName: this.targetPlayer,
                    followDistance: this.followDistance,
                    actualDuration,
                    completed: !context.signal?.aborted
                },
                `Successfully followed ${this.targetPlayer} for ${actualDuration.toFixed(1)} seconds`,
                [`Maintained distance of ${this.followDistance} blocks`]
            );

        } catch (error) {
            this.followingActive = false;
            return this.createErrorResult(
                `Failed to follow ${this.targetPlayer}: ${error instanceof Error ? error.message : String(error)}`,
                'FOLLOW_EXECUTION_ERROR',
                { error }
            );
        }
    }

    private shouldStopFollowing(chatData: any): boolean {
        if (!chatData || !Array.isArray(chatData)) return false;

        const stopCommands = ['stop following', 'stop follow', 'stop', 'stay', 'stay here'];
        
        for (const message of chatData) {
            const text = (message.text || message.message || '').toLowerCase();
            if (stopCommands.some(cmd => text.includes(cmd))) {
                return true;
            }
        }

        return false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Stop following (can be called externally)
     */
    stopFollowing(): void {
        this.followingActive = false;
        if (this.followInterval) {
            clearInterval(this.followInterval);
            this.followInterval = null;
        }
        this.log('info', 'Follow command stopped');
    }

    /**
     * Check if currently following a player
     */
    isFollowing(): boolean {
        return this.followingActive;
    }

    /**
     * Get current follow target
     */
    getFollowTarget(): string {
        return this.targetPlayer;
    }

    /**
     * Handle partial failure with recovery
     */
    async handlePartialFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        // For following, most failures are recoverable
        if (step.skillName === 'lookAround') {
            this.log('warn', 'Player scan failed, will retry');
            return true; // Continue execution
        }

        if (step.skillName === 'goToSomeone') {
            this.log('warn', 'Failed to reach player, will retry');
            return true; // Continue execution
        }

        // Use default handling for other failures
        return super.handlePartialFailure(step, error, context);
    }

    /**
     * Enhanced rollback - stop any active following
     */
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        if (stepId.includes('followPlayer')) {
            this.stopFollowing();
            this.log('info', 'Rolled back: stopped following');
        }
    }

    /**
     * This skill supports rollback by stopping active following
     */
    protected supportsRollback(): boolean {
        return true;
    }
}