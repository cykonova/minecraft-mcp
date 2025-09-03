/**
 * Advanced skill dependency resolver
 * 
 * This resolver provides comprehensive dependency resolution capabilities:
 * - Automatic skill loading and instantiation
 * - Dependency injection with TSyringe integration
 * - Resolution caching and optimization
 * - Hot-reloading support
 * - Conflict resolution
 * - Performance monitoring
 */

import { container, injectable, singleton } from 'tsyringe';
import { ISkill } from './ISkill.js';
import { ICompositeSkill, SkillDependencyMap } from './ICompositeSkill.js';
import { IAtomicSkill } from './IAtomicSkill.js';
import { SkillDependencyGraph, SkillNode, ResolutionOrder, GraphStatistics } from './SkillDependencyGraph.js';
import { 
    SkillDependencyInjector, 
    injectSkillDependencies, 
    hasSkillDependencies,
    LazySkillFactory
} from './decorators/skillDependency.js';

/**
 * Resolution context for dependency resolution
 */
export interface ResolutionContext {
    /** Current skill being resolved */
    currentSkill?: string;
    
    /** Skills being resolved (to detect circular dependencies) */
    resolutionStack: string[];
    
    /** Cache of resolved skills */
    resolvedSkills: Map<string, ISkill>;
    
    /** Performance metrics */
    metrics: {
        startTime: number;
        resolutionCount: number;
        cacheHits: number;
        cacheMisses: number;
    };
    
    /** Options for this resolution */
    options: ResolutionOptions;
}

/**
 * Options for dependency resolution
 */
export interface ResolutionOptions {
    /** Whether to use caching */
    useCache: boolean;
    
    /** Whether to validate dependencies */
    validateDependencies: boolean;
    
    /** Whether to inject dependencies automatically */
    autoInject: boolean;
    
    /** Maximum resolution depth to prevent infinite recursion */
    maxDepth: number;
    
    /** Whether to allow circular dependencies (with warnings) */
    allowCircular: boolean;
    
    /** Whether to prefer latest versions */
    preferLatestVersions: boolean;
    
    /** Edition filter */
    editionFilter?: 'java' | 'bedrock' | 'universal';
    
    /** Category filter */
    categoryFilter?: 'verified' | 'library';
}

/**
 * Resolution result
 */
export interface ResolutionResult {
    /** Whether resolution was successful */
    success: boolean;
    
    /** Resolved skill instance */
    skill?: ISkill;
    
    /** All resolved dependencies */
    dependencies: SkillDependencyMap;
    
    /** Resolution order that was used */
    resolutionOrder: string[];
    
    /** Any errors encountered */
    errors: string[];
    
    /** Warnings generated during resolution */
    warnings: string[];
    
    /** Performance metrics */
    metrics: {
        totalTime: number;
        resolutionCount: number;
        cacheHitRate: number;
        memoryUsage?: number;
    };
    
    /** Circular dependencies found */
    circularDependencies: string[][];
}

/**
 * Skill provider interface for resolving skills from different sources
 */
export interface ISkillProvider {
    /** Provider name */
    readonly name: string;
    
    /** Get a skill by name */
    getSkill(name: string): Promise<ISkill | undefined>;
    
    /** Get all available skills */
    getAllSkills(): Promise<ISkill[]>;
    
    /** Check if a skill exists */
    hasSkill(name: string): Promise<boolean>;
    
    /** Reload skills (for hot-reloading) */
    reload?(): Promise<void>;
}

/**
 * Resolution cache for performance optimization
 */
class ResolutionCache {
    private skillCache = new Map<string, ISkill>();
    private dependencyCache = new Map<string, SkillDependencyMap>();
    private resolutionOrderCache = new Map<string, ResolutionOrder>();
    private cacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
    };
    
    private readonly maxCacheSize = 1000;
    private readonly ttl = 5 * 60 * 1000; // 5 minutes
    private readonly cacheTimestamps = new Map<string, number>();
    
    getSkill(name: string): ISkill | undefined {
        if (this.isExpired(name)) {
            this.evict(name);
            return undefined;
        }
        
        const skill = this.skillCache.get(name);
        if (skill) {
            this.cacheStats.hits++;
            return skill;
        }
        
        this.cacheStats.misses++;
        return undefined;
    }
    
    setSkill(name: string, skill: ISkill): void {
        this.ensureCacheSize();
        this.skillCache.set(name, skill);
        this.cacheTimestamps.set(name, Date.now());
    }
    
    getDependencies(skillName: string): SkillDependencyMap | undefined {
        if (this.isExpired(`deps:${skillName}`)) {
            this.evictDependencies(skillName);
            return undefined;
        }
        
        const dependencies = this.dependencyCache.get(skillName);
        if (dependencies) {
            this.cacheStats.hits++;
            return dependencies;
        }
        
        this.cacheStats.misses++;
        return undefined;
    }
    
    setDependencies(skillName: string, dependencies: SkillDependencyMap): void {
        this.ensureCacheSize();
        this.dependencyCache.set(skillName, dependencies);
        this.cacheTimestamps.set(`deps:${skillName}`, Date.now());
    }
    
    clear(): void {
        this.skillCache.clear();
        this.dependencyCache.clear();
        this.resolutionOrderCache.clear();
        this.cacheTimestamps.clear();
    }
    
    getStats() {
        return { ...this.cacheStats };
    }
    
    private isExpired(key: string): boolean {
        const timestamp = this.cacheTimestamps.get(key);
        return !timestamp || (Date.now() - timestamp) > this.ttl;
    }
    
    private evict(key: string): void {
        this.skillCache.delete(key);
        this.cacheTimestamps.delete(key);
        this.cacheStats.evictions++;
    }
    
    private evictDependencies(skillName: string): void {
        this.dependencyCache.delete(skillName);
        this.cacheTimestamps.delete(`deps:${skillName}`);
        this.cacheStats.evictions++;
    }
    
    private ensureCacheSize(): void {
        while (this.skillCache.size >= this.maxCacheSize) {
            // Evict oldest entry
            const oldestKey = Array.from(this.cacheTimestamps.entries())
                .sort(([,a], [,b]) => a - b)[0]?.[0];
                
            if (oldestKey) {
                this.evict(oldestKey);
            } else {
                break;
            }
        }
    }
}

/**
 * Comprehensive skill dependency resolver
 */
@injectable()
@singleton()
export class SkillResolver {
    private dependencyGraph = new SkillDependencyGraph();
    private skillProviders = new Map<string, ISkillProvider>();
    private cache = new ResolutionCache();
    private injector = SkillDependencyInjector.getInstance();
    
    private defaultOptions: ResolutionOptions = {
        useCache: true,
        validateDependencies: true,
        autoInject: true,
        maxDepth: 50,
        allowCircular: false,
        preferLatestVersions: true,
    };
    
    constructor() {}
    
    /**
     * Register a skill provider
     */
    registerProvider(provider: ISkillProvider): void {
        this.skillProviders.set(provider.name, provider);
    }
    
    /**
     * Unregister a skill provider
     */
    unregisterProvider(providerName: string): boolean {
        return this.skillProviders.delete(providerName);
    }
    
    /**
     * Register skills with the dependency graph
     */
    registerSkill(skill: ISkill): void {
        this.dependencyGraph.addSkill(skill);
        
        // Store in TSyringe container if it's injectable
        try {
            if (skill.constructor && Reflect.hasMetadata('design:paramtypes', skill.constructor)) {
                container.registerInstance(`skill:${skill.name}`, skill);
            }
        } catch (error) {
            // Skip TSyringe registration if not applicable
        }
    }
    
    /**
     * Resolve a skill and all its dependencies
     */
    async resolve(skillName: string, options: Partial<ResolutionOptions> = {}): Promise<ResolutionResult> {
        const resolveOptions = { ...this.defaultOptions, ...options };
        
        const context: ResolutionContext = {
            resolutionStack: [],
            resolvedSkills: new Map(),
            metrics: {
                startTime: Date.now(),
                resolutionCount: 0,
                cacheHits: 0,
                cacheMisses: 0,
            },
            options: resolveOptions,
        };
        
        try {
            const skill = await this.resolveSkillWithContext(skillName, context);
            
            if (!skill) {
                return {
                    success: false,
                    dependencies: {},
                    resolutionOrder: [],
                    errors: [`Skill '${skillName}' not found`],
                    warnings: [],
                    metrics: this.buildMetrics(context),
                    circularDependencies: [],
                };
            }
            
            // Resolve all dependencies
            const dependencies = await this.resolveDependencies(skill, context);
            
            // Get resolution order
            const resolutionOrder = this.calculateResolutionOrder(context.resolvedSkills);
            
            // Validate if required
            const validation = resolveOptions.validateDependencies 
                ? this.validateResolution(skill, dependencies)
                : { errors: [], warnings: [] };
            
            // Inject dependencies if required
            if (resolveOptions.autoInject && skill.type === 'composite') {
                injectSkillDependencies(skill as ICompositeSkill, dependencies);
            }
            
            return {
                success: validation.errors.length === 0,
                skill,
                dependencies,
                resolutionOrder,
                errors: validation.errors,
                warnings: validation.warnings,
                metrics: this.buildMetrics(context),
                circularDependencies: this.findCircularDependencies(context.resolvedSkills),
            };
            
        } catch (error) {
            return {
                success: false,
                dependencies: {},
                resolutionOrder: [],
                errors: [error instanceof Error ? error.message : String(error)],
                warnings: [],
                metrics: this.buildMetrics(context),
                circularDependencies: [],
            };
        }
    }
    
    /**
     * Resolve multiple skills efficiently
     */
    async resolveMultiple(skillNames: string[], options: Partial<ResolutionOptions> = {}): Promise<Map<string, ResolutionResult>> {
        const results = new Map<string, ResolutionResult>();
        
        // Resolve skills in dependency order for better caching
        const resolutionOrder = this.dependencyGraph.calculateResolutionOrder();
        const orderedSkills = skillNames.sort((a, b) => {
            const aIndex = resolutionOrder.order.indexOf(a);
            const bIndex = resolutionOrder.order.indexOf(b);
            return aIndex - bIndex;
        });
        
        // Resolve each skill
        for (const skillName of orderedSkills) {
            const result = await this.resolve(skillName, options);
            results.set(skillName, result);
            
            // If resolution failed and not allowing failures, stop
            if (!result.success && !options.allowCircular) {
                break;
            }
        }
        
        return results;
    }
    
    /**
     * Get the dependency graph
     */
    getDependencyGraph(): SkillDependencyGraph {
        return this.dependencyGraph;
    }
    
    /**
     * Get graph statistics
     */
    getGraphStatistics(): GraphStatistics {
        return this.dependencyGraph.analyzeGraph();
    }
    
    /**
     * Clear all caches
     */
    clearCache(): void {
        this.cache.clear();
    }
    
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.cache.getStats();
    }
    
    /**
     * Validate the entire dependency graph
     */
    validateGraph(): { isValid: boolean; errors: string[]; warnings: string[] } {
        return this.dependencyGraph.validateGraph();
    }
    
    // Private methods
    
    /**
     * Resolve a skill with context tracking
     */
    private async resolveSkillWithContext(skillName: string, context: ResolutionContext): Promise<ISkill | undefined> {
        // Check for circular dependency
        if (context.resolutionStack.includes(skillName)) {
            if (!context.options.allowCircular) {
                throw new Error(`Circular dependency detected: ${context.resolutionStack.join(' → ')} → ${skillName}`);
            }
        }
        
        // Check depth limit
        if (context.resolutionStack.length >= context.options.maxDepth) {
            throw new Error(`Maximum resolution depth (${context.options.maxDepth}) exceeded`);
        }
        
        // Check cache first
        if (context.options.useCache) {
            const cached = this.cache.getSkill(skillName);
            if (cached) {
                context.metrics.cacheHits++;
                return cached;
            }
            context.metrics.cacheMisses++;
        }
        
        // Check if already resolved in this context
        if (context.resolvedSkills.has(skillName)) {
            return context.resolvedSkills.get(skillName);
        }
        
        context.resolutionStack.push(skillName);
        context.currentSkill = skillName;
        context.metrics.resolutionCount++;
        
        try {
            // Try to get from dependency graph first
            let skill = this.dependencyGraph.getNode(skillName)?.skill;
            
            // If not in graph, try skill providers
            if (!skill) {
                for (const provider of this.skillProviders.values()) {
                    skill = await provider.getSkill(skillName);
                    if (skill) {
                        // Register with dependency graph
                        this.dependencyGraph.addSkill(skill);
                        break;
                    }
                }
            }
            
            // Try TSyringe container
            if (!skill) {
                try {
                    skill = container.resolve(`skill:${skillName}` as any);
                } catch {
                    // Not available in container
                }
            }
            
            if (!skill) {
                return undefined;
            }
            
            // Apply filters
            if (!this.passesFilters(skill, context.options)) {
                return undefined;
            }
            
            // Cache the skill
            if (context.options.useCache) {
                this.cache.setSkill(skillName, skill);
            }
            
            // Store in context
            context.resolvedSkills.set(skillName, skill);
            
            return skill;
            
        } finally {
            context.resolutionStack.pop();
            context.currentSkill = context.resolutionStack[context.resolutionStack.length - 1];
        }
    }
    
    /**
     * Resolve all dependencies for a skill
     */
    private async resolveDependencies(skill: ISkill, context: ResolutionContext): Promise<SkillDependencyMap> {
        const dependencies: SkillDependencyMap = {};
        
        // Check cache first
        if (context.options.useCache) {
            const cached = this.cache.getDependencies(skill.name);
            if (cached) {
                context.metrics.cacheHits++;
                return cached;
            }
            context.metrics.cacheMisses++;
        }
        
        // Get dependency names
        const dependencyNames = this.getDependencyNames(skill);
        
        // Resolve each dependency
        for (const depName of dependencyNames) {
            const dependency = await this.resolveSkillWithContext(depName, context);
            if (dependency) {
                dependencies[depName] = dependency;
                
                // Recursively resolve dependencies of dependencies
                if (dependency.type === 'composite') {
                    const subDependencies = await this.resolveDependencies(dependency, context);
                    Object.assign(dependencies, subDependencies);
                }
            }
        }
        
        // Cache dependencies
        if (context.options.useCache) {
            this.cache.setDependencies(skill.name, dependencies);
        }
        
        return dependencies;
    }
    
    /**
     * Get dependency names for a skill
     */
    private getDependencyNames(skill: ISkill): string[] {
        if (skill.type === 'composite') {
            const compositeSkill = skill as ICompositeSkill;
            if (compositeSkill.skillDependencies) {
                return [...compositeSkill.skillDependencies];
            }
        }
        
        return skill.dependencies || [];
    }
    
    /**
     * Check if a skill passes the configured filters
     */
    private passesFilters(skill: ISkill, options: ResolutionOptions): boolean {
        if (options.editionFilter && skill.edition !== 'universal' && skill.edition !== options.editionFilter) {
            return false;
        }
        
        if (options.categoryFilter && skill.category !== options.categoryFilter) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Calculate resolution order from resolved skills
     */
    private calculateResolutionOrder(resolvedSkills: Map<string, ISkill>): string[] {
        // Create a temporary graph with just the resolved skills
        const tempGraph = new SkillDependencyGraph();
        
        for (const skill of resolvedSkills.values()) {
            tempGraph.addSkill(skill);
        }
        
        const order = tempGraph.calculateResolutionOrder();
        return order.order;
    }
    
    /**
     * Validate a complete resolution
     */
    private validateResolution(skill: ISkill, dependencies: SkillDependencyMap): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (skill.type === 'composite') {
            const compositeSkill = skill as ICompositeSkill;
            
            // Check if all required dependencies are present
            const requiredDeps = compositeSkill.skillDependencies || [];
            for (const depName of requiredDeps) {
                if (!dependencies[depName]) {
                    errors.push(`Required dependency '${depName}' not resolved for skill '${skill.name}'`);
                }
            }
            
            // Use injector validation if available
            if (hasSkillDependencies(compositeSkill)) {
                const validationErrors = this.injector.validateSkillDependencies(
                    compositeSkill.constructor as any,
                    dependencies
                );
                errors.push(...validationErrors);
            }
        }
        
        return { errors, warnings };
    }
    
    /**
     * Find circular dependencies in resolved skills
     */
    private findCircularDependencies(resolvedSkills: Map<string, ISkill>): string[][] {
        const circularDeps = this.dependencyGraph.detectCircularDependencies();
        return circularDeps.map(circular => circular.cycle);
    }
    
    /**
     * Build performance metrics from context
     */
    private buildMetrics(context: ResolutionContext) {
        const totalTime = Date.now() - context.metrics.startTime;
        const cacheHitRate = context.metrics.cacheHits + context.metrics.cacheMisses > 0
            ? context.metrics.cacheHits / (context.metrics.cacheHits + context.metrics.cacheMisses)
            : 0;
        
        return {
            totalTime,
            resolutionCount: context.metrics.resolutionCount,
            cacheHitRate,
            memoryUsage: process.memoryUsage?.()?.heapUsed,
        };
    }
}