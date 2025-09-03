/**
 * Skill Dependency System - Main Export Module
 * 
 * This module provides a comprehensive dependency injection system for Minecraft MCP skills.
 * It enables skills to declare dependencies on other skills and automatically resolves,
 * validates, and injects them at runtime.
 * 
 * Key Features:
 * - @skillDependency decorator for declarative dependency management
 * - Circular dependency detection and resolution
 * - Dependency validation with multiple rule types
 * - TSyringe container integration
 * - Lazy loading support
 * - Performance monitoring and caching
 * - Graph visualization capabilities
 * - Hot-reloading support
 * 
 * @example
 * ```typescript
 * // Create a composite skill with dependencies
 * @injectable()
 * @autoResolveDependencies
 * export class MyCompositeSkill extends CompositeSkill {
 *   @skillDependency({ name: 'basicMiner', optional: false })
 *   private miner!: ISkill;
 *   
 *   @skillDependency({ name: 'builder', lazy: true })
 *   private builderFactory!: LazySkillFactory;
 *   
 *   async execute(context: ISkillContext, dependencies: SkillDependencyMap) {
 *     const mineResult = await this.miner.execute(context);
 *     const builder = this.builderFactory();
 *     return this.createSuccessResult({ mineResult });
 *   }
 * }
 * 
 * // Use the dependency system
 * const skill = await createSkillWithDependencies(MyCompositeSkill);
 * const resolver = container.resolve(SkillResolver);
 * const result = await resolver.resolve('myCompositeSkill');
 * ```
 */

// Core dependency system components
export { SkillDependencyGraph } from './SkillDependencyGraph.js';
export type { 
    SkillNode, 
    CircularDependency, 
    GraphStatistics, 
    GraphVisualization,
    ResolutionOrder
} from './SkillDependencyGraph.js';

export { SkillResolver } from './SkillResolver.js';
export type {
    ResolutionContext,
    ResolutionOptions,
    ResolutionResult,
    ISkillProvider
} from './SkillResolver.js';

// Dependency injection system
export { SkillDependencyInjectionManager } from './injection/SkillDependencyInjectionManager.js';
export type {
    InjectionContext,
    InjectionOptions,
    InjectionResult
} from './injection/SkillDependencyInjectionManager.js';

export {
    autoInjectDependencies,
    createSkillWithDependencies
} from './injection/SkillDependencyInjectionManager.js';

// Validation system
export { SkillDependencyValidator, BuiltinValidationRules, ValidationSeverity } from './validation/SkillDependencyValidator.js';
export type {
    ValidationRule,
    ValidationContext,
    ValidationOptions,
    ValidationResult,
    ValidationSummary
} from './validation/SkillDependencyValidator.js';

// Decorator system
export {
    skillDependency,
    autoResolveDependencies,
    SkillDependencyInjector,
    injectSkillDependencies,
    getSkillDependencyNames,
    hasSkillDependencies,
    extractSkillDependencies
} from './decorators/skillDependency.js';

export type {
    SkillDependencyOptions,
    LazySkillFactory
} from './decorators/skillDependency.js';

export {
    SKILL_DEPENDENCIES_KEY,
    INJECTED_SKILLS_KEY
} from './decorators/skillDependency.js';

// Example implementations and demos
export {
    BasicMinerSkill,
    BasicCrafterSkill,
    BasicBuilderSkill,
    ToolCraftingSkill,
    AdvancedBaseBuilderSkill,
    DependencySystemDemo,
    USAGE_GUIDE
} from './examples/DependencySystemExample.js';

// Re-export core interfaces for convenience
export type { ISkill } from './ISkill.js';
export type { ICompositeSkill, SkillDependencyMap } from './ICompositeSkill.js';
export type { IAtomicSkill } from './IAtomicSkill.js';
export type { ISkillContext } from './ISkillContext.js';
export type { SkillResult } from './SkillResult.js';

// Utility types and helpers
import type { ISkill } from './ISkill.js';
import type { ICompositeSkill } from './ICompositeSkill.js';

export type SkillClass<T extends ISkill = ISkill> = new (...args: any[]) => T;
export type CompositeSkillClass<T extends ICompositeSkill = ICompositeSkill> = new (...args: any[]) => T;

/**
 * Dependency system configuration
 */
export interface DependencySystemConfig {
    /** Enable caching for performance */
    enableCaching: boolean;
    
    /** Enable validation by default */
    enableValidation: boolean;
    
    /** Allow circular dependencies with warnings */
    allowCircularDependencies: boolean;
    
    /** Maximum resolution depth */
    maxResolutionDepth: number;
    
    /** Cache TTL in milliseconds */
    cacheTTL: number;
    
    /** Enable performance monitoring */
    enablePerformanceMonitoring: boolean;
    
    /** Enable hot-reloading support */
    enableHotReloading: boolean;
}

/**
 * Default configuration for the dependency system
 */
export const DEFAULT_DEPENDENCY_CONFIG: DependencySystemConfig = {
    enableCaching: true,
    enableValidation: true,
    allowCircularDependencies: false,
    maxResolutionDepth: 50,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
    enablePerformanceMonitoring: true,
    enableHotReloading: false,
};

/**
 * System status and health information
 */
export interface DependencySystemStatus {
    /** Whether the system is initialized */
    isInitialized: boolean;
    
    /** Number of registered skills */
    totalSkills: number;
    
    /** Number of composite skills */
    compositeSkills: number;
    
    /** Number of atomic skills */
    atomicSkills: number;
    
    /** Total dependencies */
    totalDependencies: number;
    
    /** Cache statistics */
    cacheStats: {
        hitRate: number;
        size: number;
        evictions: number;
    };
    
    /** Validation summary */
    validationSummary: {
        totalIssues: number;
        criticalIssues: number;
        warnings: number;
    };
    
    /** Performance metrics */
    performance: {
        averageResolutionTime: number;
        totalResolutions: number;
        failedResolutions: number;
    };
}

/**
 * System health checker
 */
export class DependencySystemHealthChecker {
    constructor(
        private resolver: any, // SkillResolver
        private validator: any // SkillDependencyValidator
    ) {}
    
    /**
     * Get current system status
     */
    async getSystemStatus(): Promise<DependencySystemStatus> {
        const graph = this.resolver.getDependencyGraph();
        const statistics = graph.analyzeGraph();
        const cacheStats = this.resolver.getCacheStats();
        
        const validation = this.validator.validateGraph(graph);
        
        return {
            isInitialized: true,
            totalSkills: statistics.totalNodes,
            compositeSkills: graph.getAllNodes().filter(n => n.skill.type === 'composite').length,
            atomicSkills: graph.getAllNodes().filter(n => n.skill.type === 'atomic').length,
            totalDependencies: statistics.totalEdges,
            cacheStats: {
                hitRate: cacheStats.hits / Math.max(cacheStats.hits + cacheStats.misses, 1),
                size: 0, // Would need to implement in resolver
                evictions: cacheStats.evictions || 0,
            },
            validationSummary: {
                totalIssues: validation.statistics.totalIssues,
                criticalIssues: validation.statistics.criticalIssues + validation.statistics.errorIssues,
                warnings: validation.statistics.warningIssues,
            },
            performance: {
                averageResolutionTime: 0, // Would need metrics collection
                totalResolutions: 0,
                failedResolutions: 0,
            }
        };
    }
    
    /**
     * Perform health check
     */
    async performHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];
        
        try {
            const status = await this.getSystemStatus();
            
            // Check for critical validation issues
            if (status.validationSummary.criticalIssues > 0) {
                issues.push(`${status.validationSummary.criticalIssues} critical dependency issues found`);
            }
            
            // Check for circular dependencies
            const graph = this.resolver.getDependencyGraph();
            const circularDeps = graph.detectCircularDependencies();
            if (circularDeps.some(c => c.severity === 'error')) {
                issues.push('Critical circular dependencies detected');
            }
            
            // Check cache health
            if (status.cacheStats.hitRate < 0.1 && status.totalSkills > 5) {
                issues.push('Low cache hit rate may indicate performance issues');
            }
            
        } catch (error) {
            issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return {
            healthy: issues.length === 0,
            issues
        };
    }
}

/**
 * Main dependency system manager
 */
export class DependencySystemManager {
    private config: DependencySystemConfig;
    private healthChecker?: DependencySystemHealthChecker;
    
    constructor(
        private resolver: any, // SkillResolver
        private injectionManager: any, // SkillDependencyInjectionManager
        private validator: any, // SkillDependencyValidator
        config: Partial<DependencySystemConfig> = {}
    ) {
        this.config = { ...DEFAULT_DEPENDENCY_CONFIG, ...config };
        this.healthChecker = new DependencySystemHealthChecker(resolver, validator);
    }
    
    /**
     * Initialize the dependency system
     */
    async initialize(): Promise<void> {
        console.log('🚀 Initializing Skill Dependency System...');
        
        // Clear caches if needed
        if (this.config.enableCaching) {
            this.resolver.clearCache();
            this.injectionManager.clearCache();
        }
        
        // Perform initial validation if enabled
        if (this.config.enableValidation) {
            const graph = this.resolver.getDependencyGraph();
            const validation = this.validator.validateGraph(graph);
            
            if (!validation.isValid) {
                console.warn(`⚠️ Dependency validation found ${validation.statistics.totalIssues} issues`);
                
                for (const result of validation.results.slice(0, 5)) {
                    console.warn(`  • ${result.severity}: ${result.message}`);
                }
            }
        }
        
        console.log('✅ Skill Dependency System initialized successfully');
    }
    
    /**
     * Get system status
     */
    async getStatus(): Promise<DependencySystemStatus> {
        return this.healthChecker?.getSystemStatus() ?? ({} as DependencySystemStatus);
    }
    
    /**
     * Perform health check
     */
    async checkHealth(): Promise<{ healthy: boolean; issues: string[] }> {
        return this.healthChecker?.performHealthCheck() ?? { healthy: false, issues: ['Health checker not available'] };
    }
    
    /**
     * Shutdown the dependency system
     */
    async shutdown(): Promise<void> {
        console.log('🔄 Shutting down Skill Dependency System...');
        
        // Clear caches
        this.resolver.clearCache();
        this.injectionManager.clearCache();
        
        console.log('✅ Skill Dependency System shutdown complete');
    }
}

/**
 * Utility function to create a configured dependency system manager
 */
export function createDependencySystemManager(
    config: Partial<DependencySystemConfig> = {}
): DependencySystemManager {
    const { container } = require('tsyringe');
    
    const resolver = container.resolve(SkillResolver);
    const injectionManager = container.resolve(SkillDependencyInjectionManager);
    const validator = container.resolve(SkillDependencyValidator);
    
    return new DependencySystemManager(resolver, injectionManager, validator, config);
}

/**
 * Version information
 */
export const DEPENDENCY_SYSTEM_VERSION = '1.0.0';

/**
 * Feature flags for the dependency system
 */
export const FEATURE_FLAGS = {
    /** Enable advanced circular dependency resolution */
    ADVANCED_CIRCULAR_RESOLUTION: true,
    
    /** Enable dependency versioning support */
    DEPENDENCY_VERSIONING: true,
    
    /** Enable performance profiling */
    PERFORMANCE_PROFILING: true,
    
    /** Enable graph visualization */
    GRAPH_VISUALIZATION: true,
    
    /** Enable hot-reloading */
    HOT_RELOADING: false,
    
    /** Enable distributed dependency resolution */
    DISTRIBUTED_RESOLUTION: false,
} as const;

import { SkillDependencyGraph } from './SkillDependencyGraph.js';
import { SkillResolver } from './SkillResolver.js';
import { SkillDependencyInjectionManager } from './injection/SkillDependencyInjectionManager.js';
import { SkillDependencyValidator } from './validation/SkillDependencyValidator.js';
import { skillDependency, autoResolveDependencies } from './decorators/skillDependency.js';
import { createSkillWithDependencies } from './injection/SkillDependencyInjectionManager.js';

// Default export for convenience
export default {
    SkillDependencyGraph,
    SkillResolver,
    SkillDependencyInjectionManager,
    SkillDependencyValidator,
    skillDependency,
    autoResolveDependencies,
    createSkillWithDependencies,
    DependencySystemManager,
    createDependencySystemManager,
    DEFAULT_DEPENDENCY_CONFIG,
    FEATURE_FLAGS,
    VERSION: DEPENDENCY_SYSTEM_VERSION
};