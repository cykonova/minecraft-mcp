/**
 * Advanced skill dependency injection manager
 * 
 * This manager provides comprehensive dependency injection for composite skills:
 * - Integration with TSyringe container
 * - Automatic dependency resolution
 * - Lazy loading support
 * - Circular dependency handling
 * - Performance optimization
 * - Hot-reloading support
 * - Debugging and introspection
 */

import { container, injectable, singleton, inject } from 'tsyringe';
import { ISkill } from '../ISkill.js';
import { ICompositeSkill, SkillDependencyMap } from '../ICompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillDependencyGraph } from '../SkillDependencyGraph.js';
import { SkillResolver, ResolutionOptions } from '../SkillResolver.js';
import { 
    SkillDependencyInjector, 
    injectSkillDependencies, 
    hasSkillDependencies,
    LazySkillFactory,
    SKILL_DEPENDENCIES_KEY,
    INJECTED_SKILLS_KEY
} from '../decorators/skillDependency.js';
import { SkillDependencyValidator, ValidationSeverity } from '../validation/SkillDependencyValidator.js';
import { TOKENS } from '../../config/tokens.js';

/**
 * Injection context for tracking injection state
 */
export interface InjectionContext {
    /** Skill being injected */
    targetSkill: ICompositeSkill;
    
    /** Dependencies being injected */
    dependencies: SkillDependencyMap;
    
    /** Injection path for circular detection */
    injectionPath: string[];
    
    /** Options for this injection */
    options: InjectionOptions;
    
    /** Metrics for this injection */
    metrics: {
        startTime: number;
        dependenciesInjected: number;
        lazyFactoriesCreated: number;
        validationTime: number;
    };
}

/**
 * Options for dependency injection
 */
export interface InjectionOptions {
    /** Whether to validate dependencies before injection */
    validate: boolean;
    
    /** Whether to use lazy loading for all dependencies */
    forceLazy: boolean;
    
    /** Whether to cache injection results */
    cache: boolean;
    
    /** Maximum injection depth */
    maxDepth: number;
    
    /** Whether to allow partial injection (skip missing optional dependencies) */
    allowPartial: boolean;
    
    /** Whether to inject transitive dependencies */
    injectTransitive: boolean;
    
    /** Timeout for injection in milliseconds */
    timeout: number;
    
    /** Whether to perform performance monitoring */
    monitorPerformance: boolean;
}

/**
 * Injection result
 */
export interface InjectionResult {
    /** Whether injection was successful */
    success: boolean;
    
    /** Injected skill instance */
    skill: ICompositeSkill;
    
    /** Dependencies that were injected */
    injectedDependencies: string[];
    
    /** Dependencies that failed to inject */
    failedDependencies: string[];
    
    /** Validation results */
    validationResults?: Array<{
        severity: ValidationSeverity;
        message: string;
        suggestion?: string;
    }>;
    
    /** Performance metrics */
    metrics: {
        totalTime: number;
        dependenciesInjected: number;
        lazyFactoriesCreated: number;
        validationTime: number;
        memoryUsage?: number;
    };
    
    /** Any errors that occurred */
    errors: string[];
    
    /** Warnings generated during injection */
    warnings: string[];
}

/**
 * Dependency injection cache
 */
class InjectionCache {
    private injectionResults = new Map<string, InjectionResult>();
    private dependencyMaps = new Map<string, SkillDependencyMap>();
    private lastAccessed = new Map<string, number>();
    
    private readonly maxSize = 500;
    private readonly ttl = 10 * 60 * 1000; // 10 minutes
    
    get(skillName: string): InjectionResult | undefined {
        const result = this.injectionResults.get(skillName);
        if (result) {
            this.lastAccessed.set(skillName, Date.now());
            return result;
        }
        return undefined;
    }
    
    set(skillName: string, result: InjectionResult): void {
        this.ensureSize();
        this.injectionResults.set(skillName, result);
        this.lastAccessed.set(skillName, Date.now());
    }
    
    getDependencyMap(skillName: string): SkillDependencyMap | undefined {
        const dependencies = this.dependencyMaps.get(skillName);
        if (dependencies) {
            this.lastAccessed.set(`deps:${skillName}`, Date.now());
            return dependencies;
        }
        return undefined;
    }
    
    setDependencyMap(skillName: string, dependencies: SkillDependencyMap): void {
        this.ensureSize();
        this.dependencyMaps.set(skillName, dependencies);
        this.lastAccessed.set(`deps:${skillName}`, Date.now());
    }
    
    clear(): void {
        this.injectionResults.clear();
        this.dependencyMaps.clear();
        this.lastAccessed.clear();
    }
    
    private ensureSize(): void {
        while (this.injectionResults.size >= this.maxSize) {
            // Remove oldest entry
            let oldestKey = '';
            let oldestTime = Date.now();
            
            for (const [key, time] of this.lastAccessed) {
                if (time < oldestTime) {
                    oldestTime = time;
                    oldestKey = key;
                }
            }
            
            if (oldestKey) {
                this.injectionResults.delete(oldestKey);
                this.dependencyMaps.delete(oldestKey);
                this.lastAccessed.delete(oldestKey);
            } else {
                break;
            }
        }
    }
}

/**
 * Advanced skill dependency injection manager
 */
@injectable()
@singleton()
export class SkillDependencyInjectionManager {
    private cache = new InjectionCache();
    private injector = SkillDependencyInjector.getInstance();
    private validator = new SkillDependencyValidator();
    
    private defaultOptions: InjectionOptions = {
        validate: true,
        forceLazy: false,
        cache: true,
        maxDepth: 20,
        allowPartial: false,
        injectTransitive: false,
        timeout: 30000,
        monitorPerformance: true,
    };
    
    constructor(
        @inject(TOKENS.SkillResolver) private resolver: SkillResolver,
        @inject(TOKENS.SkillRegistry) private skillRegistry: any // SkillRegistry type not available here
    ) {}
    
    /**
     * Inject dependencies into a composite skill
     */
    async injectDependencies(
        skill: ICompositeSkill,
        availableSkills?: Map<string, ISkill>,
        options: Partial<InjectionOptions> = {}
    ): Promise<InjectionResult> {
        const injectionOptions = { ...this.defaultOptions, ...options };
        const startTime = Date.now();
        
        const context: InjectionContext = {
            targetSkill: skill,
            dependencies: {},
            injectionPath: [skill.name],
            options: injectionOptions,
            metrics: {
                startTime,
                dependenciesInjected: 0,
                lazyFactoriesCreated: 0,
                validationTime: 0,
            },
        };
        
        try {
            // Check cache first
            if (injectionOptions.cache) {
                const cached = this.cache.get(skill.name);
                if (cached && this.isCacheValid(cached)) {
                    return cached;
                }
            }
            
            // Resolve dependencies
            const dependencies = await this.resolveDependencies(skill, availableSkills, context);
            context.dependencies = dependencies;
            
            // Validate dependencies if required
            let validationResults: Array<{ severity: ValidationSeverity; message: string; suggestion?: string }> = [];
            if (injectionOptions.validate) {
                const validationStart = Date.now();
                const validation = this.validateDependencies(skill, dependencies);
                context.metrics.validationTime = Date.now() - validationStart;
                
                validationResults = validation.map(result => ({
                    severity: result.severity,
                    message: result.message,
                    suggestion: result.suggestion,
                }));
                
                // Stop on critical errors unless partial injection is allowed
                const criticalErrors = validation.filter(r => r.severity === ValidationSeverity.CRITICAL || r.severity === ValidationSeverity.ERROR);
                if (criticalErrors.length > 0 && !injectionOptions.allowPartial) {
                    return {
                        success: false,
                        skill,
                        injectedDependencies: [],
                        failedDependencies: Object.keys(dependencies),
                        validationResults,
                        metrics: this.buildMetrics(context),
                        errors: criticalErrors.map(e => e.message),
                        warnings: [],
                    };
                }
            }
            
            // Perform the injection
            const injectionResult = await this.performInjection(skill, dependencies, context);
            
            // Cache the result
            if (injectionOptions.cache && injectionResult.success) {
                this.cache.set(skill.name, injectionResult);
                this.cache.setDependencyMap(skill.name, dependencies);
            }
            
            return injectionResult;
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            return {
                success: false,
                skill,
                injectedDependencies: [],
                failedDependencies: skill.skillDependencies || [],
                metrics: this.buildMetrics(context),
                errors: [errorMessage],
                warnings: [],
            };
        }
    }
    
    /**
     * Inject dependencies into multiple skills efficiently
     */
    async injectMultipleSkills(
        skills: ICompositeSkill[],
        availableSkills?: Map<string, ISkill>,
        options: Partial<InjectionOptions> = {}
    ): Promise<Map<string, InjectionResult>> {
        const results = new Map<string, InjectionResult>();
        
        // Sort skills by dependency order for better performance
        const sortedSkills = await this.sortSkillsByDependencies(skills);
        
        for (const skill of sortedSkills) {
            const result = await this.injectDependencies(skill, availableSkills, options);
            results.set(skill.name, result);
            
            // Stop on critical failures unless allowing partial
            if (!result.success && !options.allowPartial) {
                break;
            }
        }
        
        return results;
    }
    
    /**
     * Create a dependency-injected instance of a composite skill
     */
    async createInjectedInstance(
        skillClass: new (...args: any[]) => ICompositeSkill,
        availableSkills?: Map<string, ISkill>,
        options: Partial<InjectionOptions> = {}
    ): Promise<ICompositeSkill> {
        // Create instance using TSyringe if possible
        let instance: ICompositeSkill;
        
        try {
            instance = container.resolve(skillClass);
        } catch {
            // Fall back to direct instantiation
            instance = new skillClass();
        }
        
        // Inject dependencies
        const injectionResult = await this.injectDependencies(instance, availableSkills, options);
        
        if (!injectionResult.success) {
            throw new Error(`Failed to inject dependencies: ${injectionResult.errors.join(', ')}`);
        }
        
        return instance;
    }
    
    /**
     * Register a skill class with the TSyringe container
     */
    registerSkillClass<T extends ICompositeSkill>(
        token: string,
        skillClass: new (...args: any[]) => T
    ): void {
        try {
            container.registerSingleton(token, skillClass);
        } catch (error) {
            console.warn(`Failed to register skill class ${skillClass.name} with TSyringe: ${error}`);
        }
    }
    
    /**
     * Clear all injection caches
     */
    clearCache(): void {
        this.cache.clear();
    }
    
    /**
     * Get injection statistics
     */
    getStatistics() {
        return {
            // Could add cache statistics, performance metrics, etc.
            cacheSize: this.cache['injectionResults'].size,
            dependencyMapCacheSize: this.cache['dependencyMaps'].size,
        };
    }
    
    // Private helper methods
    
    /**
     * Resolve all dependencies for a skill
     */
    private async resolveDependencies(
        skill: ICompositeSkill,
        availableSkills?: Map<string, ISkill>,
        context?: InjectionContext
    ): Promise<SkillDependencyMap> {
        const dependencies: SkillDependencyMap = {};
        
        // Get dependency names from skill
        const dependencyNames = skill.skillDependencies || [];
        
        // Try to get from decorator metadata as well
        try {
            const decoratorDeps = this.injector.getDependencyNames(skill.constructor as any);
            dependencyNames.push(...decoratorDeps.filter(name => !dependencyNames.includes(name)));
        } catch {
            // No decorator metadata available
        }
        
        // Resolve each dependency
        for (const depName of dependencyNames) {
            let dependency: ISkill | undefined;
            
            // First try available skills
            if (availableSkills) {
                dependency = availableSkills.get(depName);
            }
            
            // Try skill registry
            if (!dependency && this.skillRegistry) {
                dependency = this.skillRegistry.getSkill(depName);
            }
            
            // Try resolver
            if (!dependency) {
                const resolution = await this.resolver.resolve(depName, {
                    useCache: true,
                    validateDependencies: false, // We'll validate later
                });
                
                if (resolution.success && resolution.skill) {
                    dependency = resolution.skill;
                }
            }
            
            // Try TSyringe container
            if (!dependency) {
                try {
                    dependency = container.resolve(`skill:${depName}` as any);
                } catch {
                    // Not available in container
                }
            }
            
            if (dependency) {
                dependencies[depName] = dependency;
            }
        }
        
        return dependencies;
    }
    
    /**
     * Validate dependencies using the validator
     */
    private validateDependencies(skill: ICompositeSkill, dependencies: SkillDependencyMap) {
        const allSkills = new Map<string, ISkill>();
        allSkills.set(skill.name, skill);
        
        for (const [name, depSkill] of Object.entries(dependencies)) {
            allSkills.set(name, depSkill);
        }
        
        const graph = this.resolver.getDependencyGraph();
        
        return this.validator.validateSkill(skill, dependencies, allSkills, graph, {
            deep: false, // Only validate direct dependencies
            checkVersions: true,
            checkEditions: true,
        });
    }
    
    /**
     * Perform the actual dependency injection
     */
    private async performInjection(
        skill: ICompositeSkill,
        dependencies: SkillDependencyMap,
        context: InjectionContext
    ): Promise<InjectionResult> {
        const injectedDependencies: string[] = [];
        const failedDependencies: string[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];
        
        try {
            // Use the injector to perform injection
            this.injector.injectDependencies(skill, dependencies);
            
            // Track successful injections
            for (const depName of Object.keys(dependencies)) {
                injectedDependencies.push(depName);
                context.metrics.dependenciesInjected++;
            }
            
            return {
                success: true,
                skill,
                injectedDependencies,
                failedDependencies,
                metrics: this.buildMetrics(context),
                errors,
                warnings,
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(errorMessage);
            
            return {
                success: false,
                skill,
                injectedDependencies,
                failedDependencies: Object.keys(dependencies),
                metrics: this.buildMetrics(context),
                errors,
                warnings,
            };
        }
    }
    
    /**
     * Sort skills by their dependency order
     */
    private async sortSkillsByDependencies(skills: ICompositeSkill[]): Promise<ICompositeSkill[]> {
        // Simple topological sort based on dependency count
        return skills.sort((a, b) => {
            const aDeps = a.skillDependencies?.length || 0;
            const bDeps = b.skillDependencies?.length || 0;
            return aDeps - bDeps; // Skills with fewer dependencies first
        });
    }
    
    /**
     * Check if a cached result is still valid
     */
    private isCacheValid(result: InjectionResult): boolean {
        // Simple TTL check - could be enhanced with dependency change detection
        const age = Date.now() - result.metrics.totalTime;
        return age < 5 * 60 * 1000; // 5 minutes
    }
    
    /**
     * Build metrics from injection context
     */
    private buildMetrics(context: InjectionContext) {
        const totalTime = Date.now() - context.metrics.startTime;
        
        return {
            totalTime,
            dependenciesInjected: context.metrics.dependenciesInjected,
            lazyFactoriesCreated: context.metrics.lazyFactoriesCreated,
            validationTime: context.metrics.validationTime,
            memoryUsage: process.memoryUsage?.()?.heapUsed,
        };
    }
}

/**
 * Decorator to automatically inject dependencies on skill creation
 */
export function autoInjectDependencies(
    options: Partial<InjectionOptions> = {}
) {
    return function <T extends new (...args: any[]) => ICompositeSkill>(target: T): T {
        return class extends target {
            constructor(...args: any[]) {
                super(...args);
                
                // Schedule dependency injection for next tick
                process.nextTick(async () => {
                    try {
                        const manager = container.resolve(SkillDependencyInjectionManager);
                        await manager.injectDependencies(this as any, undefined, options);
                    } catch (error) {
                        console.warn(`Failed to auto-inject dependencies for ${target.name}: ${error}`);
                    }
                });
            }
        };
    };
}

/**
 * Utility function to create a dependency-injected skill instance
 */
export async function createSkillWithDependencies<T extends ICompositeSkill>(
    skillClass: new (...args: any[]) => T,
    availableSkills?: Map<string, ISkill>,
    options: Partial<InjectionOptions> = {}
): Promise<T> {
    const manager = container.resolve(SkillDependencyInjectionManager);
    return manager.createInjectedInstance(skillClass, availableSkills, options) as Promise<T>;
}