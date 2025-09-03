import { ISkill } from './ISkill.js';
import { IAtomicSkill } from './IAtomicSkill.js';
import { ISkillContext } from './ISkillContext.js';
import { SkillResult } from './SkillResult.js';
import { BaseSkill } from './BaseSkill.js';

/**
 * Interface for composite skills that are composed of other skills
 * 
 * Composite skills orchestrate multiple atomic or other composite skills
 * to achieve more complex tasks. They handle dependency injection,
 * execution flow, error handling, and result aggregation.
 * 
 * Examples: buildHouse (uses mineResource, craftItems, placeBlocks),
 *           farmWheat (uses prepareLand, plantSeeds, harvestCrops),
 *           tradeMission (uses goToLocation, openChest, craftItems, giveItems)
 */
export interface ICompositeSkill extends ISkill {
    /**
     * Indicates this is a composite skill
     */
    readonly type: 'composite';

    /**
     * List of skills this composite skill depends on
     * These will be injected by the skill system
     */
    readonly skillDependencies: string[];

    /**
     * Execute the skill with the provided context and injected dependencies
     */
    execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult>;

    /**
     * Plan the execution steps (optional)
     * Returns an execution plan that can be used for progress tracking
     */
    planExecution?(params: Record<string, any>): ExecutionPlan;

    /**
     * Validate that all required dependencies are available (optional)
     */
    validateDependencies?(dependencies: SkillDependencyMap): string[] | undefined;

    /**
     * Handle partial failure scenarios (optional)
     * Return true to continue execution, false to abort
     */
    handlePartialFailure?(step: ExecutionStep, error: SkillResult, context: ISkillContext): Promise<boolean>;

    /**
     * Get execution progress (optional)
     * Useful for UI and monitoring
     */
    getProgress?(): ExecutionProgress;
}

/**
 * Map of skill dependencies injected into composite skills
 */
export interface SkillDependencyMap {
    [skillName: string]: ISkill;
}

/**
 * Execution plan for composite skills
 */
export interface ExecutionPlan {
    steps: ExecutionStep[];
    estimatedTotalTime: number;
    canRollback: boolean;
}

/**
 * Individual step in an execution plan
 */
export interface ExecutionStep {
    id: string;
    skillName: string;
    description: string;
    params: Record<string, any>;
    estimatedTime: number;
    optional: boolean;
    dependsOn?: string[]; // IDs of steps this step depends on
}

/**
 * Progress information for composite skill execution
 */
export interface ExecutionProgress {
    currentStep: number;
    totalSteps: number;
    completedSteps: string[];
    failedSteps: string[];
    currentStepId?: string;
    estimatedTimeRemaining: number;
}

/**
 * Helper type for composite skill constructors
 */
export interface CompositeSkillConstructor {
    new (...args: any[]): ICompositeSkill;
}

/**
 * Base class for composite skills extending BaseSkill with composite-specific functionality
 */
export abstract class BaseCompositeSkill extends BaseSkill implements ICompositeSkill {
    readonly type = 'composite' as const;

    abstract readonly skillDependencies: string[];

    /**
     * Execute the skill with dependency injection - this implements the ICompositeSkill interface
     */
    abstract execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult>;

    /**
     * Execute the skill implementation - used by BaseSkill's execution pattern
     * For composite skills, this should delegate to the execute(context, dependencies) method
     */
    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        // This is a placeholder - composite skills should override the main execute method instead
        return this.createErrorResult(
            'Composite skill must implement execute(context, dependencies) method',
            'NOT_IMPLEMENTED'
        );
    }

    /**
     * Default dependency validation
     */
    validateDependencies(dependencies: SkillDependencyMap): string[] | undefined {
        const errors: string[] = [];

        for (const requiredSkill of this.skillDependencies) {
            if (!(requiredSkill in dependencies)) {
                errors.push(`Missing required skill dependency: ${requiredSkill}`);
            }
        }

        return errors.length > 0 ? errors : undefined;
    }

    /**
     * Default partial failure handler - abort on any failure
     */
    async handlePartialFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        // By default, abort on any failure unless the step is optional
        return step.optional;
    }

    /**
     * Helper method to execute a dependency skill
     */
    protected async executeDependency(
        skillName: string,
        params: Record<string, any>,
        context: ISkillContext,
        dependencies: SkillDependencyMap
    ): Promise<SkillResult> {
        const skill = dependencies[skillName];
        if (!skill) {
            return {
                success: false,
                error: `Skill dependency '${skillName}' not found`,
                code: 'DEPENDENCY_NOT_FOUND',
            };
        }

        const dependencyContext = {
            ...context,
            params,
            metadata: {
                ...context.metadata,
                name: skillName,
            },
        };

        if (skill.type === 'atomic') {
            return (skill as IAtomicSkill).execute(dependencyContext);
        } else if (skill.type === 'composite') {
            return (skill as ICompositeSkill).execute(dependencyContext, dependencies);
        } else {
            // Legacy skill without type - try to execute with context
            try {
                const result = await (skill as any).execute(context.bot, params, context.serviceParams);
                return {
                    success: true,
                    data: result,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    code: 'LEGACY_EXECUTION_ERROR',
                };
            }
        }
    }

    /**
     * Helper method to create an execution plan from steps
     */
    protected createExecutionPlan(steps: Omit<ExecutionStep, 'id'>[]): ExecutionPlan {
        const planSteps: ExecutionStep[] = steps.map((step, index) => ({
            ...step,
            id: `${this.name}-step-${index + 1}`,
        }));

        const estimatedTotalTime = planSteps.reduce((total, step) => total + step.estimatedTime, 0);

        return {
            steps: planSteps,
            estimatedTotalTime,
            canRollback: false, // Override in subclasses if rollback is supported
        };
    }
}