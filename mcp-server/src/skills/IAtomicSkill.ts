import { ISkill } from './ISkill.js';
import { ISkillContext } from './ISkillContext.js';
import { SkillResult } from './SkillResult.js';
import { BaseSkill } from './BaseSkill.js';

/**
 * Interface for atomic (single-purpose) skills that perform one specific task
 * 
 * Atomic skills are self-contained and do not depend on other skills.
 * They represent the basic building blocks of the skill system.
 * 
 * Examples: mineResource, craftItems, goToLocation, sendChat
 */
export interface IAtomicSkill extends ISkill {
    /**
     * Indicates this is an atomic skill
     */
    readonly type: 'atomic';

    /**
     * Execute the skill with the provided context
     * Atomic skills perform their task directly without delegating to other skills
     */
    execute(context: ISkillContext): Promise<SkillResult>;

    /**
     * Validate parameters before execution (optional)
     * Return validation errors if any, or undefined if valid
     */
    validateParams?(params: Record<string, any>): string[] | undefined;

    /**
     * Get estimated execution time in milliseconds (optional)
     * Useful for timeout management and progress tracking
     */
    estimateExecutionTime?(params: Record<string, any>): number;

    /**
     * Check if this skill can be cancelled during execution (optional)
     * Default is true for atomic skills
     */
    isCancellable?(): boolean;

    /**
     * Get resource requirements for this skill (optional)
     * Useful for dependency checking and resource management
     */
    getResourceRequirements?(params: Record<string, any>): {
        items?: string[];
        tools?: string[];
        permissions?: string[];
        environment?: string[];
    };
}

/**
 * Helper type for atomic skill constructors
 */
export interface AtomicSkillConstructor {
    new (...args: any[]): IAtomicSkill;
}

/**
 * Base class for atomic skills extending BaseSkill with atomic-specific functionality
 */
export abstract class BaseAtomicSkill extends BaseSkill implements IAtomicSkill {
    readonly type = 'atomic' as const;

    /**
     * Execute the skill - delegates to BaseSkill's execution pattern
     * Subclasses should implement executeSkill instead
     */
    abstract executeSkill(context: ISkillContext): Promise<SkillResult>;

    /**
     * Default parameter validation using the input schema (enhanced from BaseSkill)
     */
    validateParams(params: Record<string, any>): string[] | undefined {
        const validation = this.validateWithSchema(params);
        return validation.length > 0 ? validation : undefined;
    }

    /**
     * Default implementation - most atomic skills can be cancelled
     */
    isCancellable(): boolean {
        return true;
    }

    /**
     * Default implementation - no specific resource requirements
     */
    getResourceRequirements(params: Record<string, any>): {
        items?: string[];
        tools?: string[];
        permissions?: string[];
        environment?: string[];
    } {
        return {};
    }

    /**
     * Default implementation - reasonable default timeout
     */
    estimateExecutionTime(params: Record<string, any>): number {
        return 30000; // 30 seconds default
    }
}