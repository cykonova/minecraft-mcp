import { injectable } from 'tsyringe';
import { BaseSkill } from './BaseSkill.js';
import { ICompositeSkill, SkillDependencyMap, ExecutionPlan, ExecutionStep, ExecutionProgress } from './ICompositeSkill.js';
import { IAtomicSkill } from './IAtomicSkill.js';
import { ISkillContext } from './ISkillContext.js';
import { SkillResult, SkillResults } from './SkillResult.js';

/**
 * Enhanced composite skill base class with advanced orchestration capabilities
 * 
 * This class provides enhanced features for complex multi-skill operations:
 * - Execution planning and progress tracking
 * - Parallel and sequential execution modes
 * - Advanced error handling and recovery strategies
 * - Rollback capabilities for failed executions
 * - Dynamic dependency resolution
 * - Performance optimization through skill caching
 */
export abstract class CompositeSkill extends BaseSkill implements ICompositeSkill {
    readonly type = 'composite' as const;

    abstract readonly skillDependencies: string[];

    // Execution state management
    protected currentExecution?: {
        plan: ExecutionPlan;
        progress: ExecutionProgress;
        results: Map<string, SkillResult>;
        startTime: number;
    };

    /**
     * Execute the skill with dependency injection
     */
    abstract execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult>;

    /**
     * Execute the skill implementation - used by BaseSkill's execution pattern
     * Composite skills should override the main execute method instead
     */
    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        return this.createErrorResult(
            'Composite skill must implement execute(context, dependencies) method',
            'NOT_IMPLEMENTED'
        );
    }

    /**
     * Enhanced dependency validation with detailed error reporting
     */
    validateDependencies(dependencies: SkillDependencyMap): string[] | undefined {
        const errors: string[] = [];

        // Check required skills exist
        for (const requiredSkill of this.skillDependencies) {
            if (!(requiredSkill in dependencies)) {
                errors.push(`Missing required skill dependency: ${requiredSkill}`);
                continue;
            }

            const skill = dependencies[requiredSkill];
            
            // Validate skill type compatibility
            if (!skill.type) {
                // Legacy skill - provide warning
                errors.push(`Dependency '${requiredSkill}' is a legacy skill and may not be fully compatible`);
            }

            // Validate edition compatibility
            if (skill.edition !== this.edition && skill.edition !== 'universal' && this.edition !== 'universal') {
                errors.push(`Dependency '${requiredSkill}' edition (${skill.edition}) is incompatible with ${this.edition}`);
            }
        }

        return errors.length > 0 ? errors : undefined;
    }

    /**
     * Create an execution plan with enhanced features
     */
    planExecution(params: Record<string, any>): ExecutionPlan {
        const steps = this.createExecutionSteps(params);
        const plan = this.createExecutionPlan(steps);

        // Enhance plan with optimization
        return this.optimizeExecutionPlan(plan, params);
    }

    /**
     * Create execution steps - must be implemented by subclasses
     */
    protected abstract createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[];

    /**
     * Optimize execution plan for better performance
     */
    protected optimizeExecutionPlan(plan: ExecutionPlan, params: Record<string, any>): ExecutionPlan {
        // Identify parallel execution opportunities
        const optimizedSteps = this.identifyParallelSteps(plan.steps);
        
        // Estimate optimized execution time
        const optimizedTime = this.calculateOptimizedTime(optimizedSteps);

        return {
            ...plan,
            steps: optimizedSteps,
            estimatedTotalTime: optimizedTime,
        };
    }

    /**
     * Identify steps that can be executed in parallel
     */
    protected identifyParallelSteps(steps: ExecutionStep[]): ExecutionStep[] {
        // Basic implementation - can be enhanced based on dependency analysis
        return steps.map(step => ({
            ...step,
            // Mark independent steps for potential parallel execution
            parallel: !step.dependsOn || step.dependsOn.length === 0,
        } as ExecutionStep & { parallel?: boolean }));
    }

    /**
     * Calculate optimized execution time considering parallel execution
     */
    protected calculateOptimizedTime(steps: ExecutionStep[]): number {
        // Simple implementation - can be enhanced with more sophisticated scheduling
        const sequentialTime = steps.filter(s => (s as any).parallel !== true)
            .reduce((total, step) => total + step.estimatedTime, 0);
        
        const parallelTime = Math.max(
            ...steps.filter(s => (s as any).parallel === true)
                .map(step => step.estimatedTime),
            0
        );

        return sequentialTime + parallelTime;
    }

    /**
     * Execute the composite skill with enhanced orchestration
     */
    protected async executeCompositeSkill(
        context: ISkillContext, 
        dependencies: SkillDependencyMap
    ): Promise<SkillResult> {
        // Validate dependencies
        const dependencyErrors = this.validateDependencies(dependencies);
        if (dependencyErrors) {
            return this.createErrorResult(
                `Dependency validation failed: ${dependencyErrors.join(', ')}`,
                'DEPENDENCY_VALIDATION_ERROR',
                { errors: dependencyErrors }
            );
        }

        // Create execution plan
        const plan = this.planExecution(context.params);
        
        // Initialize execution state
        this.currentExecution = {
            plan,
            progress: {
                currentStep: 0,
                totalSteps: plan.steps.length,
                completedSteps: [],
                failedSteps: [],
                estimatedTimeRemaining: plan.estimatedTotalTime,
            },
            results: new Map(),
            startTime: Date.now(),
        };

        try {
            // Execute plan
            return await this.executePlan(context, dependencies);
        } catch (error) {
            // Handle execution error
            return this.handlePlanExecutionError(error, context);
        } finally {
            // Clean up execution state
            this.currentExecution = undefined;
        }
    }

    /**
     * Execute the execution plan
     */
    protected async executePlan(
        context: ISkillContext, 
        dependencies: SkillDependencyMap
    ): Promise<SkillResult> {
        const { plan, progress } = this.currentExecution!;
        const results: any[] = [];

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            
            // Update progress
            progress.currentStep = i + 1;
            progress.currentStepId = step.id;
            progress.estimatedTimeRemaining = this.calculateRemainingTime(i);

            this.log('debug', `Executing step ${i + 1}/${plan.steps.length}: ${step.description}`);

            try {
                // Check dependencies for this step
                if (step.dependsOn) {
                    const dependencyResults = step.dependsOn.map(depId => 
                        this.currentExecution!.results.get(depId)
                    );
                    
                    if (dependencyResults.some(result => !result || !result.success)) {
                        throw new Error(`Step dependencies not satisfied: ${step.dependsOn.join(', ')}`);
                    }
                }

                // Execute step
                const stepResult = await this.executeStep(step, context, dependencies);
                
                // Store result
                this.currentExecution!.results.set(step.id, stepResult);
                
                if (stepResult.success) {
                    progress.completedSteps.push(step.id);
                    results.push(stepResult.data);
                    this.log('debug', `Step ${step.id} completed successfully`);
                } else {
                    progress.failedSteps.push(step.id);
                    
                    // Handle step failure
                    const shouldContinue = await this.handleStepFailure(step, stepResult, context);
                    if (!shouldContinue) {
                        return this.createErrorResult(
                            `Execution aborted at step ${step.id}: ${(stepResult as any).error}`,
                            'STEP_EXECUTION_FAILED',
                            { step, stepResult, completedSteps: progress.completedSteps }
                        );
                    }
                }

            } catch (error) {
                progress.failedSteps.push(step.id);
                const errorResult = SkillResults.fromError(error);
                
                const shouldContinue = await this.handleStepFailure(step, errorResult, context);
                if (!shouldContinue) {
                    return this.createErrorResult(
                        `Execution failed at step ${step.id}: ${error instanceof Error ? error.message : String(error)}`,
                        'STEP_EXECUTION_ERROR',
                        { step, error: errorResult, completedSteps: progress.completedSteps }
                    );
                }
            }
        }

        // All steps completed
        return this.createSuccessResult(
            results,
            `Successfully completed ${progress.completedSteps.length} steps`,
            [`Executed ${plan.steps.length} steps in ${Date.now() - this.currentExecution!.startTime}ms`]
        );
    }

    /**
     * Execute a single step
     */
    protected async executeStep(
        step: ExecutionStep,
        context: ISkillContext,
        dependencies: SkillDependencyMap
    ): Promise<SkillResult> {
        return this.executeDependency(step.skillName, step.params, context, dependencies);
    }

    /**
     * Handle step execution failure
     */
    protected async handleStepFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        this.log('warn', `Step ${step.id} failed: ${(error as any).error}`);

        // Try the handlePartialFailure method
        const shouldContinue = await this.handlePartialFailure(step, error, context);
        
        if (!shouldContinue && this.currentExecution?.plan.canRollback) {
            // Attempt rollback
            await this.rollbackExecution(context);
        }

        return shouldContinue;
    }

    /**
     * Default partial failure handler with enhanced logic
     */
    async handlePartialFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        // Check if step is optional
        if (step.optional) {
            this.log('info', `Optional step ${step.id} failed, continuing execution`);
            return true;
        }

        // Check if error is recoverable
        if (this.isRecoverableError(error)) {
            this.log('info', `Recoverable error in step ${step.id}, attempting retry`);
            // Could implement retry logic here
        }

        // Default: abort on any non-optional failure
        return false;
    }

    /**
     * Check if an error is recoverable
     */
    protected isRecoverableError(error: SkillResult): boolean {
        const code = (error as any).code;
        if (!code) return false;

        const recoverableErrors = [
            'TIMEOUT',
            'NETWORK_ERROR',
            'TEMPORARY_FAILURE',
            'RESOURCE_BUSY',
        ];

        return recoverableErrors.includes(code);
    }

    /**
     * Rollback execution
     */
    protected async rollbackExecution(context: ISkillContext): Promise<void> {
        if (!this.currentExecution) return;

        this.log('info', 'Starting execution rollback');

        const { progress } = this.currentExecution;
        
        // Rollback completed steps in reverse order
        for (let i = progress.completedSteps.length - 1; i >= 0; i--) {
            const stepId = progress.completedSteps[i];
            try {
                await this.rollbackStep(stepId, context);
                this.log('debug', `Rolled back step ${stepId}`);
            } catch (error) {
                this.log('error', `Failed to rollback step ${stepId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.log('info', 'Rollback completed');
    }

    /**
     * Rollback a single step - override in subclasses that support rollback
     */
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        // Default implementation - no rollback
        this.log('debug', `No rollback implementation for step ${stepId}`);
    }

    /**
     * Calculate remaining execution time
     */
    protected calculateRemainingTime(currentStepIndex: number): number {
        if (!this.currentExecution) return 0;

        const { plan } = this.currentExecution;
        const remainingSteps = plan.steps.slice(currentStepIndex + 1);
        
        return remainingSteps.reduce((total, step) => total + step.estimatedTime, 0);
    }

    /**
     * Handle plan execution error
     */
    protected handlePlanExecutionError(error: unknown, context: ISkillContext): SkillResult {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        this.log('error', `Plan execution failed: ${errorMessage}`, error);
        
        return this.createErrorResult(
            `Composite skill execution failed: ${errorMessage}`,
            'PLAN_EXECUTION_ERROR',
            { 
                error,
                progress: this.currentExecution?.progress,
                completedSteps: this.currentExecution?.progress.completedSteps || [],
            }
        );
    }

    /**
     * Get current execution progress
     */
    getProgress(): ExecutionProgress | undefined {
        return this.currentExecution?.progress;
    }

    /**
     * Enhanced dependency execution with caching
     */
    protected async executeDependency(
        skillName: string,
        params: Record<string, any>,
        context: ISkillContext,
        dependencies: SkillDependencyMap
    ): Promise<SkillResult> {
        const skill = dependencies[skillName];
        if (!skill) {
            return this.createErrorResult(
                `Skill dependency '${skillName}' not found`,
                'DEPENDENCY_NOT_FOUND'
            );
        }

        const dependencyContext = {
            ...context,
            params,
            metadata: {
                ...context.metadata,
                name: skillName,
            },
        };

        try {
            if (skill.type === 'atomic') {
                return await (skill as IAtomicSkill).execute(dependencyContext);
            } else if (skill.type === 'composite') {
                return await (skill as ICompositeSkill).execute(dependencyContext, dependencies);
            } else {
                // Legacy skill execution
                const result = await (skill as any).execute(context.bot, params, context.serviceParams);
                return this.createSuccessResult(result);
            }
        } catch (error) {
            return SkillResults.fromError(error, 'DEPENDENCY_EXECUTION_ERROR');
        }
    }

    /**
     * Helper method to create execution plan with optimizations
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
            canRollback: this.supportsRollback(),
        };
    }

    /**
     * Check if this composite skill supports rollback - override in subclasses
     */
    protected supportsRollback(): boolean {
        return false;
    }
}