/**
 * Comprehensive skill dependency validation system
 * 
 * This validation system provides:
 * - Static dependency validation
 * - Runtime dependency validation
 * - Version compatibility checking
 * - Edition compatibility validation
 * - Performance impact assessment
 * - Security validation
 * - Custom validation rules
 */

import { ISkill } from '../ISkill.js';
import { ICompositeSkill, SkillDependencyMap } from '../ICompositeSkill.js';
import { SkillDependencyGraph } from '../SkillDependencyGraph.js';
import { SkillDependencyInjector } from '../decorators/skillDependency.js';

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

/**
 * Validation rule interface
 */
export interface ValidationRule {
    /** Rule identifier */
    id: string;
    
    /** Rule name */
    name: string;
    
    /** Rule description */
    description: string;
    
    /** Severity level */
    severity: ValidationSeverity;
    
    /** Whether this rule is enabled */
    enabled: boolean;
    
    /** Validate a skill and its dependencies */
    validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[];
}

/**
 * Validation context
 */
export interface ValidationContext {
    /** All available skills */
    allSkills: Map<string, ISkill>;
    
    /** Dependency graph */
    dependencyGraph: SkillDependencyGraph;
    
    /** Current validation path */
    validationPath: string[];
    
    /** Validation options */
    options: ValidationOptions;
    
    /** Metadata for this validation run */
    metadata: {
        startTime: number;
        skillsValidated: number;
        rulesApplied: number;
    };
}

/**
 * Validation options
 */
export interface ValidationOptions {
    /** Whether to perform deep validation */
    deep: boolean;
    
    /** Whether to validate transitive dependencies */
    validateTransitive: boolean;
    
    /** Whether to check version compatibility */
    checkVersions: boolean;
    
    /** Whether to validate edition compatibility */
    checkEditions: boolean;
    
    /** Whether to perform performance analysis */
    performanceAnalysis: boolean;
    
    /** Custom validation rules to include */
    customRules: ValidationRule[];
    
    /** Rules to exclude by ID */
    excludeRules: string[];
    
    /** Maximum validation depth */
    maxDepth: number;
    
    /** Timeout for validation in milliseconds */
    timeout: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
    /** Rule that generated this result */
    ruleId: string;
    
    /** Severity level */
    severity: ValidationSeverity;
    
    /** Message describing the issue */
    message: string;
    
    /** Skill that has the issue */
    skillName: string;
    
    /** Related skills (dependencies, etc.) */
    relatedSkills: string[];
    
    /** Suggested fix */
    suggestion?: string;
    
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Validation summary
 */
export interface ValidationSummary {
    /** Overall validation status */
    isValid: boolean;
    
    /** All validation results */
    results: ValidationResult[];
    
    /** Results grouped by severity */
    resultsBySeverity: Record<ValidationSeverity, ValidationResult[]>;
    
    /** Results grouped by skill */
    resultsBySkill: Record<string, ValidationResult[]>;
    
    /** Performance metrics */
    metrics: {
        totalTime: number;
        skillsValidated: number;
        rulesApplied: number;
        averageTimePerSkill: number;
    };
    
    /** Summary statistics */
    statistics: {
        totalIssues: number;
        criticalIssues: number;
        errorIssues: number;
        warningIssues: number;
        infoIssues: number;
    };
}

/**
 * Built-in validation rules
 */
export class BuiltinValidationRules {
    /**
     * Validate that all required dependencies exist
     */
    static readonly MISSING_DEPENDENCIES: ValidationRule = {
        id: 'missing-dependencies',
        name: 'Missing Dependencies',
        description: 'Check that all required dependencies exist',
        severity: ValidationSeverity.ERROR,
        enabled: true,
        validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[] {
            const results: ValidationResult[] = [];
            
            const requiredDeps = skill.dependencies || [];
            if (skill.type === 'composite') {
                const compositeDeps = (skill as ICompositeSkill).skillDependencies || [];
                requiredDeps.push(...compositeDeps);
            }
            
            for (const depName of requiredDeps) {
                if (!dependencies[depName] && !context.allSkills.has(depName)) {
                    results.push({
                        ruleId: this.id,
                        severity: this.severity,
                        message: `Required dependency '${depName}' is missing`,
                        skillName: skill.name,
                        relatedSkills: [depName],
                        suggestion: `Ensure skill '${depName}' is registered and available`,
                    });
                }
            }
            
            return results;
        }
    };
    
    /**
     * Validate edition compatibility
     */
    static readonly EDITION_COMPATIBILITY: ValidationRule = {
        id: 'edition-compatibility',
        name: 'Edition Compatibility',
        description: 'Check that skill editions are compatible',
        severity: ValidationSeverity.WARNING,
        enabled: true,
        validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[] {
            const results: ValidationResult[] = [];
            
            if (!context.options.checkEditions) return results;
            
            for (const [depName, depSkill] of Object.entries(dependencies)) {
                if (skill.edition !== 'universal' && depSkill.edition !== 'universal') {
                    if (skill.edition !== depSkill.edition) {
                        results.push({
                            ruleId: this.id,
                            severity: this.severity,
                            message: `Edition mismatch: '${skill.name}' (${skill.edition}) depends on '${depName}' (${depSkill.edition})`,
                            skillName: skill.name,
                            relatedSkills: [depName],
                            suggestion: 'Consider using universal skills or create edition-specific alternatives',
                            metadata: {
                                skillEdition: skill.edition,
                                dependencyEdition: depSkill.edition,
                            }
                        });
                    }
                }
            }
            
            return results;
        }
    };
    
    /**
     * Validate version compatibility
     */
    static readonly VERSION_COMPATIBILITY: ValidationRule = {
        id: 'version-compatibility',
        name: 'Version Compatibility',
        description: 'Check version compatibility between skills and dependencies',
        severity: ValidationSeverity.WARNING,
        enabled: true,
        validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[] {
            const results: ValidationResult[] = [];
            
            if (!context.options.checkVersions) return results;
            
            // This is a simplified version check - could be enhanced with semver
            for (const [depName, depSkill] of Object.entries(dependencies)) {
                if (skill.version && depSkill.version) {
                    // Simple major version check
                    const skillMajor = skill.version.split('.')[0];
                    const depMajor = depSkill.version.split('.')[0];
                    
                    if (skillMajor !== depMajor) {
                        results.push({
                            ruleId: this.id,
                            severity: ValidationSeverity.WARNING,
                            message: `Potential version incompatibility: '${skill.name}' v${skill.version} depends on '${depName}' v${depSkill.version}`,
                            skillName: skill.name,
                            relatedSkills: [depName],
                            suggestion: 'Verify that these versions are compatible',
                            metadata: {
                                skillVersion: skill.version,
                                dependencyVersion: depSkill.version,
                            }
                        });
                    }
                }
            }
            
            return results;
        }
    };
    
    /**
     * Validate circular dependencies
     */
    static readonly CIRCULAR_DEPENDENCIES: ValidationRule = {
        id: 'circular-dependencies',
        name: 'Circular Dependencies',
        description: 'Detect circular dependencies',
        severity: ValidationSeverity.ERROR,
        enabled: true,
        validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[] {
            const results: ValidationResult[] = [];
            
            const circularDeps = context.dependencyGraph.detectCircularDependencies();
            
            for (const circular of circularDeps) {
                if (circular.cycle.includes(skill.name)) {
                    results.push({
                        ruleId: this.id,
                        severity: circular.severity === 'error' ? ValidationSeverity.ERROR : ValidationSeverity.WARNING,
                        message: `Circular dependency detected: ${circular.path}`,
                        skillName: skill.name,
                        relatedSkills: circular.cycle.filter(name => name !== skill.name),
                        suggestion: circular.suggestions.join('; '),
                        metadata: {
                            cycle: circular.cycle,
                            cycleLength: circular.cycle.length,
                        }
                    });
                }
            }
            
            return results;
        }
    };
    
    /**
     * Validate dependency depth
     */
    static readonly DEPENDENCY_DEPTH: ValidationRule = {
        id: 'dependency-depth',
        name: 'Dependency Depth',
        description: 'Check for excessive dependency depth',
        severity: ValidationSeverity.WARNING,
        enabled: true,
        validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[] {
            const results: ValidationResult[] = [];
            
            const node = context.dependencyGraph.getNode(skill.name);
            if (node && node.analysis.depth > 5) {
                results.push({
                    ruleId: this.id,
                    severity: this.severity,
                    message: `Skill has deep dependency chain (depth: ${node.analysis.depth})`,
                    skillName: skill.name,
                    relatedSkills: [],
                    suggestion: 'Consider flattening the dependency hierarchy or using composition',
                    metadata: {
                        depth: node.analysis.depth,
                        totalDependencies: node.analysis.totalDependencies,
                    }
                });
            }
            
            return results;
        }
    };
    
    /**
     * Validate performance impact
     */
    static readonly PERFORMANCE_IMPACT: ValidationRule = {
        id: 'performance-impact',
        name: 'Performance Impact',
        description: 'Assess potential performance impact of dependencies',
        severity: ValidationSeverity.INFO,
        enabled: true,
        validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[] {
            const results: ValidationResult[] = [];
            
            if (!context.options.performanceAnalysis) return results;
            
            const node = context.dependencyGraph.getNode(skill.name);
            if (node) {
                // High number of dependencies might impact performance
                if (node.analysis.totalDependencies > 10) {
                    results.push({
                        ruleId: this.id,
                        severity: ValidationSeverity.INFO,
                        message: `Skill has many dependencies (${node.analysis.totalDependencies}) which may impact performance`,
                        skillName: skill.name,
                        relatedSkills: Object.keys(dependencies),
                        suggestion: 'Consider lazy loading or splitting into smaller skills',
                        metadata: {
                            totalDependencies: node.analysis.totalDependencies,
                            directDependencies: node.dependencies.length,
                        }
                    });
                }
                
                // Skills with many dependents are critical
                if (node.analysis.dependentCount > 5) {
                    results.push({
                        ruleId: this.id,
                        severity: ValidationSeverity.INFO,
                        message: `Skill is a critical dependency (${node.analysis.dependentCount} dependents)`,
                        skillName: skill.name,
                        relatedSkills: node.dependents,
                        suggestion: 'Ensure this skill is well-tested and stable',
                        metadata: {
                            dependentCount: node.analysis.dependentCount,
                            dependents: node.dependents,
                        }
                    });
                }
            }
            
            return results;
        }
    };
    
    /**
     * Validate category consistency
     */
    static readonly CATEGORY_CONSISTENCY: ValidationRule = {
        id: 'category-consistency',
        name: 'Category Consistency',
        description: 'Check category consistency between skills and dependencies',
        severity: ValidationSeverity.WARNING,
        enabled: true,
        validate(skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext): ValidationResult[] {
            const results: ValidationResult[] = [];
            
            // Verified skills should prefer verified dependencies
            if (skill.category === 'verified') {
                for (const [depName, depSkill] of Object.entries(dependencies)) {
                    if (depSkill.category === 'library') {
                        results.push({
                            ruleId: this.id,
                            severity: ValidationSeverity.WARNING,
                            message: `Verified skill '${skill.name}' depends on library skill '${depName}'`,
                            skillName: skill.name,
                            relatedSkills: [depName],
                            suggestion: 'Consider promoting the dependency to verified or finding a verified alternative',
                            metadata: {
                                skillCategory: skill.category,
                                dependencyCategory: depSkill.category,
                            }
                        });
                    }
                }
            }
            
            return results;
        }
    };
    
    /**
     * Get all built-in rules
     */
    static getAllRules(): ValidationRule[] {
        return [
            this.MISSING_DEPENDENCIES,
            this.EDITION_COMPATIBILITY,
            this.VERSION_COMPATIBILITY,
            this.CIRCULAR_DEPENDENCIES,
            this.DEPENDENCY_DEPTH,
            this.PERFORMANCE_IMPACT,
            this.CATEGORY_CONSISTENCY,
        ];
    }
}

/**
 * Comprehensive skill dependency validator
 */
export class SkillDependencyValidator {
    private rules: Map<string, ValidationRule> = new Map();
    private defaultOptions: ValidationOptions = {
        deep: true,
        validateTransitive: true,
        checkVersions: true,
        checkEditions: true,
        performanceAnalysis: true,
        customRules: [],
        excludeRules: [],
        maxDepth: 50,
        timeout: 30000, // 30 seconds
    };
    
    constructor() {
        // Register built-in rules
        for (const rule of BuiltinValidationRules.getAllRules()) {
            this.registerRule(rule);
        }
    }
    
    /**
     * Register a validation rule
     */
    registerRule(rule: ValidationRule): void {
        this.rules.set(rule.id, rule);
    }
    
    /**
     * Unregister a validation rule
     */
    unregisterRule(ruleId: string): boolean {
        return this.rules.delete(ruleId);
    }
    
    /**
     * Get all registered rules
     */
    getRules(): ValidationRule[] {
        return Array.from(this.rules.values());
    }
    
    /**
     * Enable or disable a rule
     */
    setRuleEnabled(ruleId: string, enabled: boolean): boolean {
        const rule = this.rules.get(ruleId);
        if (rule) {
            rule.enabled = enabled;
            return true;
        }
        return false;
    }
    
    /**
     * Validate a single skill and its dependencies
     */
    validateSkill(
        skill: ISkill,
        dependencies: SkillDependencyMap,
        allSkills: Map<string, ISkill>,
        dependencyGraph: SkillDependencyGraph,
        options: Partial<ValidationOptions> = {}
    ): ValidationResult[] {
        const validationOptions = { ...this.defaultOptions, ...options };
        const results: ValidationResult[] = [];
        
        const context: ValidationContext = {
            allSkills,
            dependencyGraph,
            validationPath: [skill.name],
            options: validationOptions,
            metadata: {
                startTime: Date.now(),
                skillsValidated: 1,
                rulesApplied: 0,
            }
        };
        
        // Apply all enabled rules
        for (const rule of this.rules.values()) {
            if (!rule.enabled || validationOptions.excludeRules.includes(rule.id)) {
                continue;
            }
            
            try {
                const ruleResults = rule.validate(skill, dependencies, context);
                results.push(...ruleResults);
                context.metadata.rulesApplied++;
            } catch (error) {
                results.push({
                    ruleId: rule.id,
                    severity: ValidationSeverity.ERROR,
                    message: `Validation rule '${rule.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
                    skillName: skill.name,
                    relatedSkills: [],
                    suggestion: 'Check the validation rule implementation',
                });
            }
        }
        
        // Apply custom rules
        for (const customRule of validationOptions.customRules) {
            if (!customRule.enabled) continue;
            
            try {
                const ruleResults = customRule.validate(skill, dependencies, context);
                results.push(...ruleResults);
                context.metadata.rulesApplied++;
            } catch (error) {
                results.push({
                    ruleId: customRule.id,
                    severity: ValidationSeverity.ERROR,
                    message: `Custom validation rule '${customRule.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
                    skillName: skill.name,
                    relatedSkills: [],
                });
            }
        }
        
        return results;
    }
    
    /**
     * Validate multiple skills
     */
    validateSkills(
        skills: ISkill[],
        allSkills: Map<string, ISkill>,
        dependencyGraph: SkillDependencyGraph,
        options: Partial<ValidationOptions> = {}
    ): ValidationSummary {
        const validationOptions = { ...this.defaultOptions, ...options };
        const startTime = Date.now();
        let allResults: ValidationResult[] = [];
        let totalRulesApplied = 0;
        
        const injector = SkillDependencyInjector.getInstance();
        
        for (const skill of skills) {
            // Build dependency map for this skill
            const dependencies: SkillDependencyMap = {};
            const depNames = skill.dependencies || [];
            
            if (skill.type === 'composite') {
                const compositeDeps = (skill as ICompositeSkill).skillDependencies || [];
                depNames.push(...compositeDeps);
            }
            
            for (const depName of depNames) {
                const depSkill = allSkills.get(depName);
                if (depSkill) {
                    dependencies[depName] = depSkill;
                }
            }
            
            // Validate this skill
            const skillResults = this.validateSkill(skill, dependencies, allSkills, dependencyGraph, options);
            allResults.push(...skillResults);
            
            // If deep validation is enabled, validate transitive dependencies
            if (validationOptions.deep && validationOptions.validateTransitive) {
                const transitiveDeps = dependencyGraph.getTransitiveDependencies(skill.name);
                for (const depName of transitiveDeps) {
                    const depSkill = allSkills.get(depName);
                    if (depSkill) {
                        const depDependencies: SkillDependencyMap = {};
                        const depDepNames = depSkill.dependencies || [];
                        
                        for (const depDepName of depDepNames) {
                            const depDepSkill = allSkills.get(depDepName);
                            if (depDepSkill) {
                                depDependencies[depDepName] = depDepSkill;
                            }
                        }
                        
                        const depResults = this.validateSkill(depSkill, depDependencies, allSkills, dependencyGraph, options);
                        allResults.push(...depResults);
                    }
                }
            }
        }
        
        const totalTime = Date.now() - startTime;
        
        // Group results
        const resultsBySeverity: Record<ValidationSeverity, ValidationResult[]> = {
            [ValidationSeverity.INFO]: [],
            [ValidationSeverity.WARNING]: [],
            [ValidationSeverity.ERROR]: [],
            [ValidationSeverity.CRITICAL]: [],
        };
        
        const resultsBySkill: Record<string, ValidationResult[]> = {};
        
        for (const result of allResults) {
            resultsBySeverity[result.severity].push(result);
            
            if (!resultsBySkill[result.skillName]) {
                resultsBySkill[result.skillName] = [];
            }
            resultsBySkill[result.skillName].push(result);
        }
        
        // Calculate statistics
        const statistics = {
            totalIssues: allResults.length,
            criticalIssues: resultsBySeverity[ValidationSeverity.CRITICAL].length,
            errorIssues: resultsBySeverity[ValidationSeverity.ERROR].length,
            warningIssues: resultsBySeverity[ValidationSeverity.WARNING].length,
            infoIssues: resultsBySeverity[ValidationSeverity.INFO].length,
        };
        
        const isValid = statistics.criticalIssues === 0 && statistics.errorIssues === 0;
        
        return {
            isValid,
            results: allResults,
            resultsBySeverity,
            resultsBySkill,
            metrics: {
                totalTime,
                skillsValidated: skills.length,
                rulesApplied: totalRulesApplied,
                averageTimePerSkill: skills.length > 0 ? totalTime / skills.length : 0,
            },
            statistics,
        };
    }
    
    /**
     * Validate the entire dependency graph
     */
    validateGraph(
        dependencyGraph: SkillDependencyGraph,
        options: Partial<ValidationOptions> = {}
    ): ValidationSummary {
        const allSkills = new Map<string, ISkill>();
        const skills: ISkill[] = [];
        
        for (const node of dependencyGraph.getAllNodes()) {
            allSkills.set(node.name, node.skill);
            skills.push(node.skill);
        }
        
        return this.validateSkills(skills, allSkills, dependencyGraph, options);
    }
    
    /**
     * Create a custom validation rule
     */
    createCustomRule(
        id: string,
        name: string,
        description: string,
        severity: ValidationSeverity,
        validateFn: (skill: ISkill, dependencies: SkillDependencyMap, context: ValidationContext) => ValidationResult[]
    ): ValidationRule {
        return {
            id,
            name,
            description,
            severity,
            enabled: true,
            validate: validateFn,
        };
    }
}