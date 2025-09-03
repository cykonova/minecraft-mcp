/**
 * Skill dependency decorator for declarative dependency management
 * 
 * This decorator system enables skills to declare their dependencies in a clean,
 * type-safe manner while supporting advanced dependency injection features like:
 * - Direct injection
 * - Lazy loading
 * - Optional dependencies
 * - Version constraints
 * - Runtime validation
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import { ISkill } from '../ISkill.js';
import { ICompositeSkill, SkillDependencyMap } from '../ICompositeSkill.js';

/**
 * Metadata key for skill dependencies
 */
export const SKILL_DEPENDENCIES_KEY = Symbol('skillDependencies');

/**
 * Metadata key for injected skill properties
 */
export const INJECTED_SKILLS_KEY = Symbol('injectedSkills');

/**
 * Dependency configuration options
 */
export interface SkillDependencyOptions {
    /** 
     * Skill name to inject 
     */
    name: string;
    
    /** 
     * Whether this dependency is optional 
     */
    optional?: boolean;
    
    /** 
     * Whether to use lazy loading (inject a factory instead of the skill instance)
     */
    lazy?: boolean;
    
    /** 
     * Version constraint (semantic versioning)
     */
    version?: string;
    
    /** 
     * Edition constraint ('java', 'bedrock', 'universal')
     */
    edition?: 'java' | 'bedrock' | 'universal';
    
    /** 
     * Category constraint ('verified', 'library')
     */
    category?: 'verified' | 'library';
    
    /** 
     * Custom validation function
     */
    validate?: (skill: ISkill) => boolean | string;
    
    /** 
     * Custom error message for validation failures
     */
    validationError?: string;
}

/**
 * Lazy skill factory interface
 */
export interface LazySkillFactory<T extends ISkill = ISkill> {
    (): T | undefined;
    readonly isLoaded: boolean;
    readonly skillName: string;
}

/**
 * Internal dependency metadata
 */
interface DependencyMetadata extends SkillDependencyOptions {
    propertyKey: string | symbol;
    propertyType?: any;
}

/**
 * Skill dependency decorator for property injection
 * 
 * @example
 * ```typescript
 * @injectable()
 * export class MyCompositeSkill extends CompositeSkill {
 *   @skillDependency({ name: 'mineResource' })
 *   private miner!: ISkill;
 *   
 *   @skillDependency({ name: 'craftItems', optional: true })
 *   private crafter?: ISkill;
 *   
 *   @skillDependency({ name: 'buildSomething', lazy: true })
 *   private builderFactory!: LazySkillFactory;
 *   
 *   async execute(context: ISkillContext, dependencies: SkillDependencyMap) {
 *     // Dependencies are automatically injected
 *     const mineResult = await this.miner.execute(...);
 *     
 *     if (this.crafter) {
 *       const craftResult = await this.crafter.execute(...);
 *     }
 *     
 *     const builder = this.builderFactory();
 *     if (builder) {
 *       const buildResult = await builder.execute(...);
 *     }
 *   }
 * }
 * ```
 */
export function skillDependency(options: SkillDependencyOptions) {
    return function (target: any, propertyKey: string | symbol) {
        // Get or create dependency metadata
        const existingDeps: DependencyMetadata[] = Reflect.getMetadata(SKILL_DEPENDENCIES_KEY, target.constructor) || [];
        
        // Get property type if available
        const propertyType = Reflect.getMetadata('design:type', target, propertyKey);
        
        const dependencyMeta: DependencyMetadata = {
            ...options,
            propertyKey,
            propertyType,
        };
        
        existingDeps.push(dependencyMeta);
        
        // Store dependency metadata
        Reflect.defineMetadata(SKILL_DEPENDENCIES_KEY, existingDeps, target.constructor);
        
        // Mark property as injected
        const injectedProps: (string | symbol)[] = Reflect.getMetadata(INJECTED_SKILLS_KEY, target.constructor) || [];
        injectedProps.push(propertyKey);
        Reflect.defineMetadata(INJECTED_SKILLS_KEY, injectedProps, target.constructor);
    };
}

/**
 * Class decorator to automatically populate skillDependencies array from property decorators
 */
export function autoResolveDependencies<T extends ICompositeSkill>(target: new (...args: any[]) => T) {
    const dependencies: DependencyMetadata[] = Reflect.getMetadata(SKILL_DEPENDENCIES_KEY, target) || [];
    
    // Create skillDependencies array from decorated properties
    const skillNames = dependencies.map(dep => dep.name);
    
    // Add to prototype so it's available on instances
    (target.prototype as any).skillDependencies = skillNames;
    
    return target;
}

/**
 * Skill dependency injection utility
 */
export class SkillDependencyInjector {
    private static instance: SkillDependencyInjector;
    
    private constructor() {}
    
    static getInstance(): SkillDependencyInjector {
        if (!SkillDependencyInjector.instance) {
            SkillDependencyInjector.instance = new SkillDependencyInjector();
        }
        return SkillDependencyInjector.instance;
    }
    
    /**
     * Inject dependencies into a skill instance
     */
    injectDependencies(skill: ICompositeSkill, dependencies: SkillDependencyMap): void {
        const dependencyMetadata: DependencyMetadata[] = 
            Reflect.getMetadata(SKILL_DEPENDENCIES_KEY, skill.constructor) || [];
        
        for (const depMeta of dependencyMetadata) {
            try {
                const injectedValue = this.resolveDependency(depMeta, dependencies);
                
                if (injectedValue !== undefined) {
                    (skill as any)[depMeta.propertyKey] = injectedValue;
                } else if (!depMeta.optional) {
                    throw new Error(
                        `Required dependency '${depMeta.name}' not found for skill '${skill.name}'`
                    );
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Failed to inject dependency '${depMeta.name}' into skill '${skill.name}': ${errorMessage}`
                );
            }
        }
    }
    
    /**
     * Resolve a single dependency
     */
    private resolveDependency(depMeta: DependencyMetadata, dependencies: SkillDependencyMap): any {
        const targetSkill = dependencies[depMeta.name];
        
        if (!targetSkill) {
            if (depMeta.optional) {
                return undefined;
            }
            throw new Error(`Dependency '${depMeta.name}' not found`);
        }
        
        // Validate dependency
        this.validateDependency(targetSkill, depMeta);
        
        // Return lazy factory or direct skill
        if (depMeta.lazy) {
            return this.createLazyFactory(targetSkill, depMeta.name);
        }
        
        return targetSkill;
    }
    
    /**
     * Validate a dependency against its constraints
     */
    private validateDependency(skill: ISkill, depMeta: DependencyMetadata): void {
        const errors: string[] = [];
        
        // Version validation
        if (depMeta.version && skill.version) {
            if (!this.isVersionCompatible(skill.version, depMeta.version)) {
                errors.push(`Version mismatch: required ${depMeta.version}, found ${skill.version}`);
            }
        }
        
        // Edition validation
        if (depMeta.edition && skill.edition !== 'universal' && skill.edition !== depMeta.edition) {
            errors.push(`Edition mismatch: required ${depMeta.edition}, found ${skill.edition}`);
        }
        
        // Category validation
        if (depMeta.category && skill.category !== depMeta.category) {
            errors.push(`Category mismatch: required ${depMeta.category}, found ${skill.category}`);
        }
        
        // Custom validation
        if (depMeta.validate) {
            const validationResult = depMeta.validate(skill);
            if (typeof validationResult === 'string') {
                errors.push(validationResult);
            } else if (!validationResult) {
                errors.push(depMeta.validationError || 'Custom validation failed');
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Dependency validation failed for '${depMeta.name}': ${errors.join(', ')}`);
        }
    }
    
    /**
     * Check if a version satisfies a version constraint
     * Simple semantic version checking (supports ^, ~, >=, <=, etc.)
     */
    private isVersionCompatible(actualVersion: string, requiredVersion: string): boolean {
        // Basic implementation - could be enhanced with a proper semver library
        if (requiredVersion.startsWith('^')) {
            const required = requiredVersion.slice(1);
            return this.compareVersions(actualVersion, required) >= 0;
        }
        
        if (requiredVersion.startsWith('~')) {
            const required = requiredVersion.slice(1);
            return this.compareVersions(actualVersion, required) >= 0;
        }
        
        if (requiredVersion.startsWith('>=')) {
            const required = requiredVersion.slice(2).trim();
            return this.compareVersions(actualVersion, required) >= 0;
        }
        
        if (requiredVersion.startsWith('<=')) {
            const required = requiredVersion.slice(2).trim();
            return this.compareVersions(actualVersion, required) <= 0;
        }
        
        if (requiredVersion.startsWith('>')) {
            const required = requiredVersion.slice(1).trim();
            return this.compareVersions(actualVersion, required) > 0;
        }
        
        if (requiredVersion.startsWith('<')) {
            const required = requiredVersion.slice(1).trim();
            return this.compareVersions(actualVersion, required) < 0;
        }
        
        // Exact match
        return actualVersion === requiredVersion;
    }
    
    /**
     * Compare two version strings
     * Returns: -1 if a < b, 0 if a === b, 1 if a > b
     */
    private compareVersions(a: string, b: string): number {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        const maxLength = Math.max(aParts.length, bParts.length);
        
        for (let i = 0; i < maxLength; i++) {
            const aPart = aParts[i] || 0;
            const bPart = bParts[i] || 0;
            
            if (aPart < bPart) return -1;
            if (aPart > bPart) return 1;
        }
        
        return 0;
    }
    
    /**
     * Create a lazy factory for a skill
     */
    private createLazyFactory(skill: ISkill, skillName: string): LazySkillFactory {
        let loaded = false;
        let cachedSkill: ISkill | undefined;
        
        const factory = () => {
            if (!loaded) {
                cachedSkill = skill;
                loaded = true;
            }
            return cachedSkill;
        };
        
        Object.defineProperties(factory, {
            isLoaded: {
                get: () => loaded,
                enumerable: true,
            },
            skillName: {
                value: skillName,
                enumerable: true,
            },
        });
        
        return factory as LazySkillFactory;
    }
    
    /**
     * Get dependency metadata for a skill class
     */
    getDependencyMetadata(skillClass: new (...args: any[]) => ICompositeSkill): DependencyMetadata[] {
        return Reflect.getMetadata(SKILL_DEPENDENCIES_KEY, skillClass) || [];
    }
    
    /**
     * Get all dependency names for a skill class
     */
    getDependencyNames(skillClass: new (...args: any[]) => ICompositeSkill): string[] {
        const metadata = this.getDependencyMetadata(skillClass);
        return metadata.map(dep => dep.name);
    }
    
    /**
     * Validate all dependencies for a skill class
     */
    validateSkillDependencies(skillClass: new (...args: any[]) => ICompositeSkill, availableSkills: SkillDependencyMap): string[] {
        const dependencies = this.getDependencyMetadata(skillClass);
        const errors: string[] = [];
        
        for (const dep of dependencies) {
            try {
                const skill = availableSkills[dep.name];
                if (!skill) {
                    if (!dep.optional) {
                        errors.push(`Required dependency '${dep.name}' not available`);
                    }
                    continue;
                }
                
                this.validateDependency(skill, dep);
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }
        
        return errors;
    }
}

/**
 * Convenience function to inject dependencies
 */
export function injectSkillDependencies(skill: ICompositeSkill, dependencies: SkillDependencyMap): void {
    const injector = SkillDependencyInjector.getInstance();
    injector.injectDependencies(skill, dependencies);
}

/**
 * Convenience function to get dependency names
 */
export function getSkillDependencyNames(skillClass: new (...args: any[]) => ICompositeSkill): string[] {
    const injector = SkillDependencyInjector.getInstance();
    return injector.getDependencyNames(skillClass);
}

/**
 * Type guard to check if a skill has dependency metadata
 */
export function hasSkillDependencies(skill: ICompositeSkill): boolean {
    const dependencies: DependencyMetadata[] = Reflect.getMetadata(SKILL_DEPENDENCIES_KEY, skill.constructor) || [];
    return dependencies.length > 0;
}

/**
 * Get skill dependencies as a simple name array (for backward compatibility)
 */
export function extractSkillDependencies(skillClass: new (...args: any[]) => ICompositeSkill): string[] {
    const injector = SkillDependencyInjector.getInstance();
    return injector.getDependencyNames(skillClass);
}