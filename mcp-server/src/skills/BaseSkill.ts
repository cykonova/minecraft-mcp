import { injectable } from 'tsyringe';
import { ISkill, isContextBasedSkill, isLegacySkill } from './ISkill.js';
import { ISkillContext, SkillContextFactory } from './ISkillContext.js';
import { SkillResult, SkillResults } from './SkillResult.js';
import { AnyBot } from '../types.js';
import { ISkillServiceParams } from '../types/skillType.js';

/**
 * Lifecycle hooks for skill execution
 */
export interface SkillLifecycleHooks {
    beforeExecute?(context: ISkillContext): Promise<void>;
    afterExecute?(context: ISkillContext, result: SkillResult): Promise<void>;
    onError?(context: ISkillContext, error: Error): Promise<SkillResult | undefined>;
}

/**
 * Execution metrics for monitoring and debugging
 */
export interface ExecutionMetrics {
    startTime: number;
    endTime?: number;
    duration?: number;
    memoryUsage?: NodeJS.MemoryUsage;
    parameterValidationTime?: number;
    executionTime?: number;
    error?: string;
}

/**
 * Parameter validation result
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Abstract base class for all skills providing common functionality
 * 
 * This class implements the core skill behavior including:
 * - Parameter validation with JSON Schema
 * - Execution timing and metrics
 * - Lifecycle hooks (before/after/error)
 * - Logging integration
 * - Support for both context-based and legacy execution patterns
 * - Error handling and recovery
 */
export abstract class BaseSkill implements ISkill {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly edition: 'java' | 'bedrock' | 'universal';
    abstract readonly category: 'verified' | 'library';
    readonly version: string = '1.0.0';
    readonly dependencies: string[] = [];

    abstract readonly inputSchema: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };

    // Execution metrics for monitoring
    protected metrics: ExecutionMetrics = {
        startTime: 0,
    };

    // Lifecycle hooks (can be overridden by subclasses)
    protected lifecycleHooks: SkillLifecycleHooks = {};

    /**
     * Main execution method that handles both context-based and legacy patterns
     */
    async execute(botOrContext: AnyBot | ISkillContext, args?: any, serviceParams?: any): Promise<SkillResult | any> {
        this.startMetrics();

        try {
            // Determine execution pattern and create context if needed
            const context = this.resolveExecutionContext(botOrContext, args, serviceParams);
            
            // Validate parameters
            const validation = await this.validateParameters(context.params);
            if (!validation.isValid) {
                return this.createValidationErrorResult(validation);
            }

            // Execute lifecycle hooks and skill logic
            await this.executeWithLifecycle(context);

        } catch (error) {
            return this.handleExecutionError(error);
        } finally {
            this.endMetrics();
        }
    }

    /**
     * Abstract method for actual skill implementation
     * Must be implemented by concrete skill classes
     */
    protected abstract executeSkill(context: ISkillContext): Promise<SkillResult>;

    /**
     * Validate parameters using JSON Schema and custom validation
     */
    protected async validateParameters(params: Record<string, any>): Promise<ValidationResult> {
        const validationStart = Date.now();
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // JSON Schema validation
            const schemaErrors = this.validateWithSchema(params);
            errors.push(...schemaErrors);

            // Custom validation (can be overridden by subclasses)
            const customValidation = await this.performCustomValidation(params);
            errors.push(...customValidation.errors);
            warnings.push(...customValidation.warnings);

        } catch (error) {
            errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
        }

        this.metrics.parameterValidationTime = Date.now() - validationStart;

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Schema-based parameter validation
     */
    protected validateWithSchema(params: Record<string, any>): string[] {
        const errors: string[] = [];

        // Check required parameters
        for (const required of this.inputSchema.required || []) {
            if (!(required in params) || params[required] === undefined || params[required] === null) {
                errors.push(`Missing required parameter: ${required}`);
            }
        }

        // Validate parameter types
        if (this.inputSchema.properties) {
            for (const [key, schema] of Object.entries(this.inputSchema.properties)) {
                if (key in params && params[key] !== undefined) {
                    const value = params[key];
                    const validationError = this.validateParameterType(key, value, schema);
                    if (validationError) {
                        errors.push(validationError);
                    }
                }
            }
        }

        return errors;
    }

    /**
     * Validate individual parameter type
     */
    protected validateParameterType(key: string, value: any, schema: any): string | null {
        if (schema.type) {
            const expectedType = schema.type;
            const actualType = typeof value;
            
            if (expectedType === 'array' && !Array.isArray(value)) {
                return `Parameter '${key}' must be an array, got ${actualType}`;
            } else if (expectedType !== 'array' && actualType !== expectedType) {
                return `Parameter '${key}' must be of type ${expectedType}, got ${actualType}`;
            }
        }

        // Additional validations
        if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
            return `Parameter '${key}' must be at least ${schema.minimum}, got ${value}`;
        }

        if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
            return `Parameter '${key}' must be at most ${schema.maximum}, got ${value}`;
        }

        if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
            return `Parameter '${key}' must have at least ${schema.minLength} characters`;
        }

        if (schema.maxLength !== undefined && typeof value === 'string' && value.length > schema.maxLength) {
            return `Parameter '${key}' must have at most ${schema.maxLength} characters`;
        }

        if (schema.enum && !schema.enum.includes(value)) {
            return `Parameter '${key}' must be one of: ${schema.enum.join(', ')}, got '${value}'`;
        }

        return null;
    }

    /**
     * Custom validation hook - override in subclasses for specific validation logic
     */
    protected async performCustomValidation(params: Record<string, any>): Promise<{ errors: string[], warnings: string[] }> {
        return { errors: [], warnings: [] };
    }

    /**
     * Execute skill with lifecycle hooks
     */
    protected async executeWithLifecycle(context: ISkillContext): Promise<SkillResult> {
        try {
            // Before execute hook
            if (this.lifecycleHooks.beforeExecute) {
                await this.lifecycleHooks.beforeExecute(context);
            }

            // Main skill execution
            const executionStart = Date.now();
            const result = await this.executeSkill(context);
            this.metrics.executionTime = Date.now() - executionStart;

            // After execute hook
            if (this.lifecycleHooks.afterExecute) {
                await this.lifecycleHooks.afterExecute(context, result);
            }

            return result;

        } catch (error) {
            // Error hook
            if (this.lifecycleHooks.onError) {
                const errorResult = await this.lifecycleHooks.onError(context, error as Error);
                if (errorResult) {
                    return errorResult;
                }
            }

            // Default error handling
            return this.handleExecutionError(error);
        }
    }

    /**
     * Resolve execution context from different calling patterns
     */
    protected resolveExecutionContext(
        botOrContext: AnyBot | ISkillContext,
        args?: any,
        serviceParams?: any
    ): ISkillContext {
        // Check if we already have a context
        if (this.isSkillContext(botOrContext)) {
            return botOrContext;
        }

        // Create context from legacy parameters
        const bot = botOrContext as AnyBot;
        const params = args || {};
        const service = serviceParams || this.createDefaultServiceParams();

        return SkillContextFactory.create(bot, params, service, {
            name: this.name,
            edition: this.edition,
            category: this.category,
            version: this.version,
        });
    }

    /**
     * Type guard to check if parameter is a skill context
     */
    protected isSkillContext(obj: any): obj is ISkillContext {
        return obj && 
               typeof obj === 'object' && 
               'bot' in obj && 
               'params' in obj && 
               'serviceParams' in obj && 
               'metadata' in obj;
    }

    /**
     * Create default service parameters for legacy support
     */
    protected createDefaultServiceParams(): ISkillServiceParams {
        return {
            cancelExecution: () => {
                this.log('warn', `Cancel execution called for ${this.name}`);
            },
            signal: undefined,
            resetTimeout: () => {
                this.log('info', `Timeout reset for ${this.name}`);
            },
            getStatsData: () => ({}),
            setStatsData: () => true,
        };
    }

    /**
     * Create error result for validation failures
     */
    protected createValidationErrorResult(validation: ValidationResult): SkillResult {
        return SkillResults.error(
            `Parameter validation failed: ${validation.errors.join(', ')}`,
            'VALIDATION_ERROR',
            { errors: validation.errors, warnings: validation.warnings }
        );
    }

    /**
     * Handle execution errors
     */
    protected handleExecutionError(error: unknown): SkillResult {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.metrics.error = errorMessage;
        
        this.log('error', `Skill execution failed: ${errorMessage}`, error);
        
        return SkillResults.fromError(error, 'EXECUTION_ERROR');
    }

    /**
     * Start execution metrics
     */
    protected startMetrics(): void {
        this.metrics = {
            startTime: Date.now(),
            memoryUsage: process.memoryUsage(),
        };
    }

    /**
     * End execution metrics
     */
    protected endMetrics(): void {
        this.metrics.endTime = Date.now();
        this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
    }

    /**
     * Get execution metrics (for monitoring and debugging)
     */
    getMetrics(): ExecutionMetrics {
        return { ...this.metrics };
    }

    /**
     * Logging helper with context
     */
    protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
        const logMessage = `[${this.name}] ${message}`;
        
        switch (level) {
            case 'debug':
                console.debug(logMessage, data || '');
                break;
            case 'info':
                console.log(logMessage, data || '');
                break;
            case 'warn':
                console.warn(logMessage, data || '');
                break;
            case 'error':
                console.error(logMessage, data || '');
                break;
        }
    }

    /**
     * Helper method to check if bot has required permissions
     */
    protected async checkBotPermissions(bot: AnyBot, requiredPermissions: string[]): Promise<{ hasPermissions: boolean, missingPermissions: string[] }> {
        const missingPermissions: string[] = [];

        // This is a basic implementation - can be enhanced based on bot capabilities
        for (const permission of requiredPermissions) {
            switch (permission) {
                case 'operator':
                    // Check if bot is an operator (Java Edition specific)
                    if (this.edition === 'java' && 'player' in bot) {
                        const player = (bot as any).player;
                        if (!player?.gamemode || player.gamemode !== 1) { // Creative mode approximation
                            missingPermissions.push(permission);
                        }
                    }
                    break;
                case 'creative':
                    // Check if bot is in creative mode
                    if (this.edition === 'java' && 'player' in bot) {
                        const player = (bot as any).player;
                        if (!player?.gamemode || player.gamemode !== 1) {
                            missingPermissions.push(permission);
                        }
                    }
                    break;
                default:
                    // Unknown permission - assume missing
                    missingPermissions.push(permission);
                    break;
            }
        }

        return {
            hasPermissions: missingPermissions.length === 0,
            missingPermissions,
        };
    }

    /**
     * Helper method to get bot position (unified interface)
     */
    protected getBotPosition(bot: AnyBot): { x: number, y: number, z: number } | null {
        if (this.edition === 'java' && 'entity' in bot && bot.entity) {
            return bot.entity.position;
        }
        
        if (this.edition === 'bedrock' && 'position' in bot) {
            return (bot as any).position;
        }

        return null;
    }

    /**
     * Helper method to safely get bot inventory
     */
    protected getBotInventory(bot: AnyBot): any[] {
        if (this.edition === 'java' && 'inventory' in bot) {
            return (bot as any).inventory.items() || [];
        }
        
        if (this.edition === 'bedrock' && 'inventory' in bot) {
            return (bot as any).inventory || [];
        }

        return [];
    }

    /**
     * Set lifecycle hooks
     */
    setLifecycleHooks(hooks: Partial<SkillLifecycleHooks>): void {
        this.lifecycleHooks = { ...this.lifecycleHooks, ...hooks };
    }

    /**
     * Helper to create success result with observations
     */
    protected createSuccessResult<T = any>(data?: T, message?: string, observations?: string[]): SkillResult<T> {
        return SkillResults.success(data, message, observations);
    }

    /**
     * Helper to create error result with context
     */
    protected createErrorResult(error: string, code?: string, details?: any): SkillResult {
        return SkillResults.error(error, code, details);
    }
}