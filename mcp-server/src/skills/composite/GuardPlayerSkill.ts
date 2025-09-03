import { injectable } from 'tsyringe';
import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../ICompositeSkill.js';
import { SkillResult } from '../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../decorators/skillDependency.js';
import { ISkill } from '../ISkill.js';

/**
 * Composite skill for guarding a player from hostile entities
 * 
 * This skill provides comprehensive player protection by:
 * - Staying close to the protected player
 * - Scanning for threats continuously
 * - Engaging hostile mobs that approach
 * - Maintaining defensive positioning
 * - Alerting the player of threats
 */
@injectable()
@autoResolveDependencies
export class GuardPlayerSkill extends CompositeSkill {
    readonly name = 'guardPlayer';
    readonly description = 'Guards a specified player by staying close and fighting off hostile entities';
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
        name: 'attackSomeone',
        edition: 'java',
        category: 'verified'
    })
    private attackSomeone!: ISkill;
    
    @skillDependency({ 
        name: 'readChat',
        edition: 'java',
        category: 'verified',
        optional: true
    })
    private chatReader?: ISkill;

    // Required abstract properties
    readonly skillDependencies = ['goToSomeone', 'lookAround', 'attackSomeone', 'readChat'];
    readonly inputSchema = {
        type: 'object',
        properties: {
            playerName: { type: 'string', description: 'Name of the player to guard' },
            duration: { type: 'number', minimum: 60, maximum: 7200, default: 600, description: 'Guard duration in seconds' },
            guardDistance: { type: 'number', minimum: 2, maximum: 8, default: 4, description: 'Guard distance' },
            threatRadius: { type: 'number', minimum: 4, maximum: 16, default: 8, description: 'Threat detection radius' },
            alertPlayer: { type: 'boolean', default: true, description: 'Alert player about threats' }
        },
        required: ['playerName']
    };

    // Guarding state
    private guardingActive = false;
    private protectedPlayer = '';
    private guardDistance = 4;
    private threatRadius = 8;
    private activeThreats: Set<string> = new Set();
    private lastThreatScan = 0;
    private scanInterval = 2000; // Scan every 2 seconds

    constructor() {
        super();
    }

    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        const { playerName, duration = 600, guardDistance = 4 } = params;
        
        return [
            {
                skillName: 'lookAround',
                params: { mode: 'players' },
                description: 'Locate protected player',
                estimatedTime: 2000,
                optional: false
            },
            {
                skillName: 'goToSomeone',
                params: { 
                    userName: playerName, 
                    distance: guardDistance,
                    keepFollowing: false 
                },
                description: `Move to guard position near ${playerName}`,
                estimatedTime: 3000,
                optional: false
            },
            {
                skillName: 'guardPlayer',
                params: { 
                    playerName, 
                    duration,
                    guardDistance,
                    continuous: true 
                },
                description: `Actively guard ${playerName} for ${duration}s`,
                estimatedTime: duration * 1000,
                optional: false
            }
        ];
    }

    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        // Inject dependencies
        Object.assign(this, dependencies);

        const { 
            playerName, 
            duration = 600,
            guardDistance = 4,
            threatRadius = 8,
            alertPlayer = true
        } = context.params;

        if (!playerName) {
            return this.createErrorResult(
                'Player name is required for guarding',
                'MISSING_PARAMETER'
            );
        }

        this.protectedPlayer = playerName;
        this.guardDistance = Math.max(2, Math.min(8, guardDistance));
        this.threatRadius = Math.max(4, Math.min(16, threatRadius));

        // Start the guarding process
        return this.startGuarding(context, dependencies, duration, alertPlayer);
    }

    private async startGuarding(
        context: ISkillContext, 
        dependencies: SkillDependencyMap,
        duration: number,
        alertPlayer: boolean
    ): Promise<SkillResult> {
        this.guardingActive = true;
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);

        this.log('info', `Starting to guard ${this.protectedPlayer} for ${duration} seconds`);

        let threatsEngaged = 0;
        let protectionEvents: string[] = [];

        try {
            while (this.guardingActive && Date.now() < endTime) {
                if (context.signal?.aborted) {
                    this.guardingActive = false;
                    break;
                }

                // Stay close to the protected player
                await this.maintainPosition(context, dependencies);

                // Scan for threats every scanInterval ms
                if (Date.now() - this.lastThreatScan > this.scanInterval) {
                    const threats = await this.scanForThreats(context, dependencies);
                    
                    if (threats.length > 0) {
                        this.log('warn', `Detected ${threats.length} threats near ${this.protectedPlayer}`);
                        
                        if (alertPlayer) {
                            await this.alertPlayer(threats, context);
                        }

                        // Engage the closest threat
                        const closestThreat = threats[0];
                        const engagementResult = await this.engageThreat(closestThreat, context, dependencies);
                        
                        if (engagementResult) {
                            threatsEngaged++;
                            protectionEvents.push(`Defeated ${closestThreat.type} at ${new Date().toLocaleTimeString()}`);
                        }
                    }

                    this.lastThreatScan = Date.now();
                }

                // Check for stop commands
                if (this.chatReader) {
                    const chatResult = await this.executeDependency(
                        'readChat',
                        { recent: true, limit: 3 },
                        context,
                        dependencies
                    );

                    if (chatResult.success && this.shouldStopGuarding(chatResult.data)) {
                        this.guardingActive = false;
                        this.log('info', 'Stopping guard duty due to chat command');
                        break;
                    }
                }

                // Brief pause before next cycle
                await this.sleep(500);
            }

            this.guardingActive = false;
            const actualDuration = (Date.now() - startTime) / 1000;

            return this.createSuccessResult(
                {
                    playerName: this.protectedPlayer,
                    guardDistance: this.guardDistance,
                    actualDuration,
                    threatsEngaged,
                    protectionEvents,
                    completed: !context.signal?.aborted
                },
                `Successfully guarded ${this.protectedPlayer} for ${actualDuration.toFixed(1)} seconds`,
                [
                    `Engaged ${threatsEngaged} threats`,
                    `Maintained ${this.guardDistance} block guard distance`,
                    ...protectionEvents.slice(-3) // Last 3 events
                ]
            );

        } catch (error) {
            this.guardingActive = false;
            return this.createErrorResult(
                `Failed to guard ${this.protectedPlayer}: ${error instanceof Error ? error.message : String(error)}`,
                'GUARD_EXECUTION_ERROR',
                { error }
            );
        }
    }

    private async maintainPosition(context: ISkillContext, dependencies: SkillDependencyMap): Promise<void> {
        try {
            await this.executeDependency(
                'goToSomeone',
                {
                    userName: this.protectedPlayer,
                    distance: this.guardDistance,
                    keepFollowing: false
                },
                context,
                dependencies
            );
        } catch (error) {
            this.log('warn', `Failed to maintain guard position: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async scanForThreats(context: ISkillContext, dependencies: SkillDependencyMap): Promise<any[]> {
        try {
            const scanResult = await this.executeDependency(
                'lookAround',
                { mode: 'hostile', radius: this.threatRadius },
                context,
                dependencies
            );

            if (scanResult.success && scanResult.data) {
                // Filter for actual threats (hostile mobs)
                const entities = Array.isArray(scanResult.data) ? scanResult.data : [scanResult.data];
                return entities.filter(entity => this.isHostileThreat(entity));
            }
        } catch (error) {
            this.log('warn', `Threat scan failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        return [];
    }

    private isHostileThreat(entity: any): boolean {
        if (!entity || !entity.type) return false;

        const hostileMobs = [
            'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
            'witch', 'vindicator', 'evoker', 'pillager', 'ravager',
            'drowned', 'husk', 'stray', 'phantom', 'vex'
        ];

        const entityType = entity.type.toLowerCase();
        return hostileMobs.some(mob => entityType.includes(mob));
    }

    private async engageThreat(threat: any, context: ISkillContext, dependencies: SkillDependencyMap): Promise<boolean> {
        try {
            this.log('info', `Engaging threat: ${threat.type}`);

            const attackResult = await this.executeDependency(
                'attackSomeone',
                {
                    targetType: 'mob',
                    targetName: threat.type,
                    duration: 10, // Quick engagement
                    count: 1
                },
                context,
                dependencies
            );

            if (attackResult.success) {
                this.log('info', `Successfully defeated ${threat.type}`);
                return true;
            } else {
                this.log('warn', `Failed to defeat ${threat.type}`);
                return false;
            }
        } catch (error) {
            this.log('error', `Error engaging threat: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private async alertPlayer(threats: any[], context: ISkillContext): Promise<void> {
        if (threats.length === 0) return;

        const bot = context.bot;
        if (bot && bot.chat) {
            const threatNames = threats.slice(0, 3).map(t => t.type).join(', ');
            bot.chat(`Warning ${this.protectedPlayer}! ${threats.length} hostile entities nearby: ${threatNames}`);
        }
    }

    private shouldStopGuarding(chatData: any): boolean {
        if (!chatData || !Array.isArray(chatData)) return false;

        const stopCommands = ['stop guarding', 'stop guard', 'stand down', 'at ease', 'dismiss'];
        
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
     * Stop guarding (can be called externally)
     */
    stopGuarding(): void {
        this.guardingActive = false;
        this.activeThreats.clear();
        this.log('info', 'Guard duty ended');
    }

    /**
     * Check if currently guarding a player
     */
    isGuarding(): boolean {
        return this.guardingActive;
    }

    /**
     * Get current guarded player
     */
    getGuardedPlayer(): string {
        return this.protectedPlayer;
    }

    /**
     * Handle partial failure with tactical recovery
     */
    async handlePartialFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        // For guarding, most failures should continue - protection is more important
        if (step.skillName === 'lookAround') {
            this.log('warn', 'Threat scan failed, will retry');
            return true;
        }

        if (step.skillName === 'goToSomeone') {
            this.log('warn', 'Failed to reach protected player, will retry');
            return true;
        }

        if (step.skillName === 'attackSomeone') {
            this.log('warn', 'Combat failed, will attempt other threats');
            return true;
        }

        return super.handlePartialFailure(step, error, context);
    }

    /**
     * Enhanced rollback - stop guarding and clear threat state
     */
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        if (stepId.includes('guardPlayer')) {
            this.stopGuarding();
            this.log('info', 'Rolled back: stopped guarding and cleared threat tracking');
        }
    }

    /**
     * This skill supports rollback by stopping active guarding
     */
    protected supportsRollback(): boolean {
        return true;
    }
}