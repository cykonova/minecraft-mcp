import { injectable } from 'tsyringe';
import { BaseSkill } from './BaseSkill.js';
import { IAtomicSkill } from './IAtomicSkill.js';
import { ISkillContext } from './ISkillContext.js';
import { SkillResult } from './SkillResult.js';

/**
 * Enhanced atomic skill base class with additional functionality
 * 
 * This class provides enhanced features over the basic BaseAtomicSkill:
 * - Advanced parameter validation with custom patterns
 * - Resource requirement checking
 * - Execution time estimation with dynamic adjustment
 * - Cancellation support with cleanup
 * - Enhanced error handling and recovery
 */
export abstract class AtomicSkill extends BaseSkill implements IAtomicSkill {
    readonly type = 'atomic' as const;

    /**
     * Execute the skill implementation
     */
    protected abstract executeSkill(context: ISkillContext): Promise<SkillResult>;

    /**
     * Enhanced parameter validation with common patterns
     */
    protected async performCustomValidation(params: Record<string, any>): Promise<{ errors: string[], warnings: string[] }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Add common validation patterns for atomic skills
        await this.validateResourceRequirements(params, errors, warnings);
        await this.validatePositionParameters(params, errors, warnings);
        await this.validateItemParameters(params, errors, warnings);
        await this.validateQuantityParameters(params, errors, warnings);

        return { errors, warnings };
    }

    /**
     * Validate resource requirements (tools, items, permissions)
     */
    protected async validateResourceRequirements(
        params: Record<string, any>, 
        errors: string[], 
        warnings: string[]
    ): Promise<void> {
        const requirements = this.getResourceRequirements(params);

        // Check for required tools
        if (requirements.tools && requirements.tools.length > 0) {
            // This is a basic implementation - can be enhanced with actual bot inventory checking
            if (params.checkTools !== false) {
                warnings.push(`Skill requires tools: ${requirements.tools.join(', ')}`);
            }
        }

        // Check for required items
        if (requirements.items && requirements.items.length > 0) {
            if (params.checkItems !== false) {
                warnings.push(`Skill requires items: ${requirements.items.join(', ')}`);
            }
        }

        // Check for required permissions
        if (requirements.permissions && requirements.permissions.length > 0) {
            if (params.checkPermissions !== false) {
                warnings.push(`Skill requires permissions: ${requirements.permissions.join(', ')}`);
            }
        }
    }

    /**
     * Validate position-related parameters
     */
    protected async validatePositionParameters(
        params: Record<string, any>, 
        errors: string[], 
        warnings: string[]
    ): Promise<void> {
        const positionFields = ['x', 'y', 'z', 'position', 'targetPosition', 'destination'];

        for (const field of positionFields) {
            if (field in params) {
                const value = params[field];
                
                if (field === 'position' || field === 'targetPosition' || field === 'destination') {
                    // Validate position object
                    if (typeof value !== 'object' || value === null) {
                        errors.push(`Parameter '${field}' must be an object with x, y, z properties`);
                        continue;
                    }
                    
                    if (typeof value.x !== 'number' || typeof value.y !== 'number' || typeof value.z !== 'number') {
                        errors.push(`Parameter '${field}' must have numeric x, y, z properties`);
                    }
                } else {
                    // Validate individual coordinate
                    if (typeof value !== 'number') {
                        errors.push(`Parameter '${field}' must be a number`);
                    } else if (!Number.isFinite(value)) {
                        errors.push(`Parameter '${field}' must be a finite number`);
                    }
                }
            }
        }
    }

    /**
     * Validate item-related parameters
     */
    protected async validateItemParameters(
        params: Record<string, any>, 
        errors: string[], 
        warnings: string[]
    ): Promise<void> {
        const itemFields = ['item', 'itemName', 'itemType', 'blockType', 'material'];

        for (const field of itemFields) {
            if (field in params) {
                const value = params[field];
                
                if (typeof value !== 'string' || value.trim().length === 0) {
                    errors.push(`Parameter '${field}' must be a non-empty string`);
                } else if (value.includes(' ')) {
                    warnings.push(`Parameter '${field}' contains spaces - ensure this is the correct item identifier`);
                }
            }
        }

        // Validate items array
        if ('items' in params) {
            const items = params.items;
            if (!Array.isArray(items)) {
                errors.push(`Parameter 'items' must be an array`);
            } else {
                items.forEach((item, index) => {
                    if (typeof item === 'string') {
                        if (item.trim().length === 0) {
                            errors.push(`Item at index ${index} must be a non-empty string`);
                        }
                    } else if (typeof item === 'object' && item !== null) {
                        if (!item.name || typeof item.name !== 'string') {
                            errors.push(`Item at index ${index} must have a 'name' property`);
                        }
                        if (item.count !== undefined && (typeof item.count !== 'number' || item.count < 1)) {
                            errors.push(`Item at index ${index} 'count' must be a positive number`);
                        }
                    } else {
                        errors.push(`Item at index ${index} must be a string or object with name property`);
                    }
                });
            }
        }
    }

    /**
     * Validate quantity and count parameters
     */
    protected async validateQuantityParameters(
        params: Record<string, any>, 
        errors: string[], 
        warnings: string[]
    ): Promise<void> {
        const quantityFields = ['count', 'amount', 'quantity', 'distance', 'range', 'timeout'];

        for (const field of quantityFields) {
            if (field in params) {
                const value = params[field];
                
                if (typeof value !== 'number') {
                    errors.push(`Parameter '${field}' must be a number`);
                    continue;
                }

                if (!Number.isFinite(value)) {
                    errors.push(`Parameter '${field}' must be a finite number`);
                    continue;
                }

                // Field-specific validations
                switch (field) {
                    case 'count':
                    case 'amount':
                    case 'quantity':
                        if (value < 1) {
                            errors.push(`Parameter '${field}' must be at least 1`);
                        }
                        if (value > 2304) { // Max stack size * inventory slots
                            warnings.push(`Parameter '${field}' is very large (${value}), this may take a long time`);
                        }
                        break;
                    
                    case 'distance':
                    case 'range':
                        if (value < 0) {
                            errors.push(`Parameter '${field}' must be non-negative`);
                        }
                        if (value > 1000) {
                            warnings.push(`Parameter '${field}' is very large (${value}), this may be unreachable`);
                        }
                        break;
                    
                    case 'timeout':
                        if (value < 1000) { // Less than 1 second
                            warnings.push(`Parameter '${field}' is very short (${value}ms), skill may timeout`);
                        }
                        if (value > 300000) { // More than 5 minutes
                            warnings.push(`Parameter '${field}' is very long (${value}ms), consider breaking into smaller tasks`);
                        }
                        break;
                }
            }
        }
    }

    /**
     * Default resource requirements - override in specific skills
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
     * Enhanced execution time estimation based on parameters
     */
    estimateExecutionTime(params: Record<string, any>): number {
        let baseTime = 5000; // 5 seconds base

        // Adjust based on common parameters
        if ('count' in params || 'amount' in params || 'quantity' in params) {
            const quantity = params.count || params.amount || params.quantity || 1;
            baseTime += Math.min(quantity * 100, 30000); // Max 30 seconds for quantity
        }

        if ('distance' in params || 'range' in params) {
            const distance = params.distance || params.range || 0;
            baseTime += Math.min(distance * 50, 20000); // Max 20 seconds for distance
        }

        // Adjust based on skill complexity
        if (this.skillDependencies && this.skillDependencies.length > 0) {
            baseTime += this.skillDependencies.length * 2000; // 2 seconds per dependency
        }

        return Math.min(baseTime, 120000); // Max 2 minutes
    }

    /**
     * Default cancellation support
     */
    isCancellable(): boolean {
        return true;
    }

    /**
     * Cleanup method called when skill is cancelled
     */
    protected async onCancel(context: ISkillContext): Promise<void> {
        this.log('info', 'Skill execution cancelled');
        // Override in subclasses for specific cleanup
    }

    /**
     * Pre-execution checks
     */
    protected async beforeExecute(context: ISkillContext): Promise<void> {
        // Check bot status
        if (!context.bot) {
            throw new Error('Bot instance is required');
        }

        // Check resource requirements if enabled
        if (context.params.checkResources !== false) {
            const requirements = this.getResourceRequirements(context.params);
            const permissionCheck = await this.checkBotPermissions(context.bot, requirements.permissions || []);
            
            if (!permissionCheck.hasPermissions) {
                this.log('warn', `Missing permissions: ${permissionCheck.missingPermissions.join(', ')}`);
            }
        }

        this.log('debug', `Starting execution with params:`, context.params);
    }

    /**
     * Post-execution cleanup
     */
    protected async afterExecute(context: ISkillContext, result: SkillResult): Promise<void> {
        this.log('debug', `Execution completed. Success: ${result.success}`);
        
        if (!result.success) {
            this.log('error', `Execution failed: ${(result as any).error}`);
        }
    }

    // Backward compatibility property for legacy skills
    protected get skillDependencies(): string[] {
        return [];
    }
}