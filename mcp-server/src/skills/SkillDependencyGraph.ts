/**
 * Skill dependency graph for managing complex skill relationships
 * 
 * This system provides:
 * - Dependency graph construction and management
 * - Topological sorting for execution order
 * - Circular dependency detection
 * - Dependency resolution optimization
 * - Graph visualization and analysis
 * - Hot-reloading support
 */

import { ISkill } from './ISkill.js';
import { ICompositeSkill } from './ICompositeSkill.js';
import { SkillDependencyInjector, extractSkillDependencies } from './decorators/skillDependency.js';

/**
 * Graph node representing a skill and its metadata
 */
export interface SkillNode {
    /** Skill name (unique identifier) */
    name: string;
    
    /** The skill instance */
    skill: ISkill;
    
    /** Direct dependencies (skills this skill depends on) */
    dependencies: string[];
    
    /** Direct dependents (skills that depend on this skill) */
    dependents: string[];
    
    /** Skill metadata */
    metadata: {
        edition: 'java' | 'bedrock' | 'universal';
        category: 'verified' | 'library' | 'composite';
        version?: string;
        type?: 'atomic' | 'composite';
    };
    
    /** Graph analysis data */
    analysis: {
        /** Depth in dependency tree (0 = no dependencies) */
        depth: number;
        
        /** Number of skills that depend on this skill */
        dependentCount: number;
        
        /** Number of direct and indirect dependencies */
        totalDependencies: number;
        
        /** Whether this skill is part of a circular dependency */
        isCircular: boolean;
        
        /** Priority for execution ordering */
        priority: number;
    };
}

/**
 * Circular dependency information
 */
export interface CircularDependency {
    /** Skills involved in the cycle */
    cycle: string[];
    
    /** Description of the circular path */
    path: string;
    
    /** Severity of the circular dependency */
    severity: 'warning' | 'error';
    
    /** Suggested resolution strategies */
    suggestions: string[];
}

/**
 * Dependency graph statistics
 */
export interface GraphStatistics {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    averageDepth: number;
    circularDependencies: number;
    isolatedNodes: number;
    criticalNodes: string[]; // Nodes with many dependents
}

/**
 * Graph visualization data
 */
export interface GraphVisualization {
    nodes: Array<{
        id: string;
        label: string;
        type: 'atomic' | 'composite';
        edition: string;
        category: string;
        level: number;
        isCircular: boolean;
    }>;
    
    edges: Array<{
        from: string;
        to: string;
        type: 'dependency';
        weight?: number;
    }>;
    
    metadata: {
        generated: Date;
        statistics: GraphStatistics;
        layout: 'hierarchical' | 'network' | 'circular';
    };
}

/**
 * Resolution order result
 */
export interface ResolutionOrder {
    /** Skills in dependency resolution order */
    order: string[];
    
    /** Skills grouped by execution level */
    levels: string[][];
    
    /** Skills that can be loaded in parallel */
    parallelGroups: string[][];
    
    /** Any circular dependencies found */
    circularDependencies: CircularDependency[];
}

/**
 * Comprehensive skill dependency graph manager
 */
export class SkillDependencyGraph {
    private nodes: Map<string, SkillNode> = new Map();
    private adjacencyList: Map<string, Set<string>> = new Map();
    private reverseAdjacencyList: Map<string, Set<string>> = new Map();
    private circularDependencies: CircularDependency[] = [];
    private lastAnalysis?: Date;
    
    constructor() {}
    
    /**
     * Add a skill to the dependency graph
     */
    addSkill(skill: ISkill): void {
        const dependencies = this.extractDependencies(skill);
        
        const node: SkillNode = {
            name: skill.name,
            skill,
            dependencies,
            dependents: [],
            metadata: {
                edition: skill.edition,
                category: skill.category,
                version: skill.version,
                type: skill.type,
            },
            analysis: {
                depth: 0,
                dependentCount: 0,
                totalDependencies: dependencies.length,
                isCircular: false,
                priority: 0,
            },
        };
        
        this.nodes.set(skill.name, node);
        this.adjacencyList.set(skill.name, new Set(dependencies));
        this.reverseAdjacencyList.set(skill.name, new Set());
        
        // Update reverse adjacency list for dependencies
        for (const dep of dependencies) {
            if (!this.reverseAdjacencyList.has(dep)) {
                this.reverseAdjacencyList.set(dep, new Set());
            }
            this.reverseAdjacencyList.get(dep)!.add(skill.name);
        }
        
        // Update dependents
        this.updateDependents();
        
        // Invalidate analysis
        this.lastAnalysis = undefined;
    }
    
    /**
     * Remove a skill from the dependency graph
     */
    removeSkill(skillName: string): boolean {
        const node = this.nodes.get(skillName);
        if (!node) return false;
        
        // Remove from adjacency lists
        this.adjacencyList.delete(skillName);
        this.reverseAdjacencyList.delete(skillName);
        
        // Remove references from other nodes
        for (const [name, deps] of this.adjacencyList) {
            deps.delete(skillName);
        }
        
        for (const [name, dependents] of this.reverseAdjacencyList) {
            dependents.delete(skillName);
        }
        
        // Remove node
        this.nodes.delete(skillName);
        
        // Update dependents
        this.updateDependents();
        
        // Invalidate analysis
        this.lastAnalysis = undefined;
        
        return true;
    }
    
    /**
     * Get a skill node
     */
    getNode(skillName: string): SkillNode | undefined {
        return this.nodes.get(skillName);
    }
    
    /**
     * Get all skill nodes
     */
    getAllNodes(): SkillNode[] {
        return Array.from(this.nodes.values());
    }
    
    /**
     * Get direct dependencies of a skill
     */
    getDependencies(skillName: string): string[] {
        return Array.from(this.adjacencyList.get(skillName) || []);
    }
    
    /**
     * Get direct dependents of a skill
     */
    getDependents(skillName: string): string[] {
        return Array.from(this.reverseAdjacencyList.get(skillName) || []);
    }
    
    /**
     * Get all transitive dependencies of a skill
     */
    getTransitiveDependencies(skillName: string): string[] {
        const visited = new Set<string>();
        const dependencies = new Set<string>();
        
        const dfs = (name: string) => {
            if (visited.has(name)) return;
            visited.add(name);
            
            const deps = this.adjacencyList.get(name) || new Set();
            for (const dep of deps) {
                dependencies.add(dep);
                dfs(dep);
            }
        };
        
        dfs(skillName);
        return Array.from(dependencies);
    }
    
    /**
     * Get all transitive dependents of a skill
     */
    getTransitiveDependents(skillName: string): string[] {
        const visited = new Set<string>();
        const dependents = new Set<string>();
        
        const dfs = (name: string) => {
            if (visited.has(name)) return;
            visited.add(name);
            
            const deps = this.reverseAdjacencyList.get(name) || new Set();
            for (const dep of deps) {
                dependents.add(dep);
                dfs(dep);
            }
        };
        
        dfs(skillName);
        return Array.from(dependents);
    }
    
    /**
     * Detect circular dependencies using Tarjan's strongly connected components algorithm
     */
    detectCircularDependencies(): CircularDependency[] {
        this.circularDependencies = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const path: string[] = [];
        
        const dfs = (skillName: string) => {
            if (recursionStack.has(skillName)) {
                // Found a cycle
                const cycleStart = path.indexOf(skillName);
                const cycle = path.slice(cycleStart).concat(skillName);
                
                this.circularDependencies.push({
                    cycle: cycle.slice(0, -1), // Remove duplicate
                    path: cycle.join(' → '),
                    severity: this.assessCircularSeverity(cycle),
                    suggestions: this.generateCircularResolutionSuggestions(cycle),
                });
                
                return;
            }
            
            if (visited.has(skillName)) return;
            
            visited.add(skillName);
            recursionStack.add(skillName);
            path.push(skillName);
            
            const dependencies = this.adjacencyList.get(skillName) || new Set();
            for (const dep of dependencies) {
                dfs(dep);
            }
            
            recursionStack.delete(skillName);
            path.pop();
        };
        
        // Check all nodes for cycles
        for (const skillName of this.nodes.keys()) {
            if (!visited.has(skillName)) {
                dfs(skillName);
            }
        }
        
        // Mark circular nodes
        for (const circular of this.circularDependencies) {
            for (const skillName of circular.cycle) {
                const node = this.nodes.get(skillName);
                if (node) {
                    node.analysis.isCircular = true;
                }
            }
        }
        
        return this.circularDependencies;
    }
    
    /**
     * Calculate resolution order using topological sorting
     */
    calculateResolutionOrder(): ResolutionOrder {
        // First detect circular dependencies
        const circularDependencies = this.detectCircularDependencies();
        
        if (circularDependencies.length > 0) {
            // Handle circular dependencies by breaking cycles temporarily
            return this.calculateResolutionOrderWithCircularHandling(circularDependencies);
        }
        
        // Standard topological sort using Kahn's algorithm
        const inDegree = new Map<string, number>();
        const queue: string[] = [];
        const result: string[] = [];
        const levels: string[][] = [];
        
        // Initialize in-degree count
        for (const skillName of this.nodes.keys()) {
            const dependencies = this.adjacencyList.get(skillName) || new Set();
            inDegree.set(skillName, dependencies.size);
            
            if (dependencies.size === 0) {
                queue.push(skillName);
            }
        }
        
        // Process nodes level by level
        while (queue.length > 0) {
            const currentLevel = [...queue];
            levels.push(currentLevel);
            queue.length = 0;
            
            for (const skillName of currentLevel) {
                result.push(skillName);
                
                const dependents = this.reverseAdjacencyList.get(skillName) || new Set();
                for (const dependent of dependents) {
                    const currentInDegree = inDegree.get(dependent)! - 1;
                    inDegree.set(dependent, currentInDegree);
                    
                    if (currentInDegree === 0) {
                        queue.push(dependent);
                    }
                }
            }
        }
        
        // Identify parallel groups
        const parallelGroups = this.identifyParallelGroups(levels);
        
        return {
            order: result,
            levels,
            parallelGroups,
            circularDependencies,
        };
    }
    
    /**
     * Perform comprehensive graph analysis
     */
    analyzeGraph(): GraphStatistics {
        // Calculate depths
        this.calculateDepths();
        
        // Calculate priorities
        this.calculatePriorities();
        
        // Detect circular dependencies
        const circularDeps = this.detectCircularDependencies();
        
        // Calculate statistics
        const depths = Array.from(this.nodes.values()).map(node => node.analysis.depth);
        const dependentCounts = Array.from(this.nodes.values()).map(node => node.analysis.dependentCount);
        
        const statistics: GraphStatistics = {
            totalNodes: this.nodes.size,
            totalEdges: Array.from(this.adjacencyList.values()).reduce((sum, deps) => sum + deps.size, 0),
            maxDepth: Math.max(...depths, 0),
            averageDepth: depths.length > 0 ? depths.reduce((sum, d) => sum + d, 0) / depths.length : 0,
            circularDependencies: circularDeps.length,
            isolatedNodes: Array.from(this.nodes.values()).filter(node => 
                node.dependencies.length === 0 && node.dependents.length === 0
            ).length,
            criticalNodes: Array.from(this.nodes.values())
                .filter(node => node.analysis.dependentCount >= 3)
                .map(node => node.name),
        };
        
        this.lastAnalysis = new Date();
        return statistics;
    }
    
    /**
     * Generate graph visualization data
     */
    generateVisualization(layout: 'hierarchical' | 'network' | 'circular' = 'hierarchical'): GraphVisualization {
        const statistics = this.analyzeGraph();
        
        const nodes = Array.from(this.nodes.values()).map(node => ({
            id: node.name,
            label: node.name,
            type: (node.skill.type || 'atomic') as 'atomic' | 'composite',
            edition: node.metadata.edition,
            category: node.metadata.category,
            level: node.analysis.depth,
            isCircular: node.analysis.isCircular,
        }));
        
        const edges: Array<{ from: string; to: string; type: 'dependency'; weight?: number }> = [];
        
        for (const [skillName, dependencies] of this.adjacencyList) {
            for (const dep of dependencies) {
                edges.push({
                    from: dep,
                    to: skillName,
                    type: 'dependency',
                    weight: 1,
                });
            }
        }
        
        return {
            nodes,
            edges,
            metadata: {
                generated: new Date(),
                statistics,
                layout,
            },
        };
    }
    
    /**
     * Validate the entire dependency graph
     */
    validateGraph(): { isValid: boolean; errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Check for missing dependencies
        for (const [skillName, dependencies] of this.adjacencyList) {
            for (const dep of dependencies) {
                if (!this.nodes.has(dep)) {
                    errors.push(`Skill '${skillName}' depends on missing skill '${dep}'`);
                }
            }
        }
        
        // Check for circular dependencies
        const circularDeps = this.detectCircularDependencies();
        for (const circular of circularDeps) {
            if (circular.severity === 'error') {
                errors.push(`Circular dependency detected: ${circular.path}`);
            } else {
                warnings.push(`Potential circular dependency: ${circular.path}`);
            }
        }
        
        // Check for edition compatibility
        for (const [skillName, dependencies] of this.adjacencyList) {
            const skill = this.nodes.get(skillName)!;
            for (const depName of dependencies) {
                const dep = this.nodes.get(depName);
                if (dep && skill.metadata.edition !== 'universal' && dep.metadata.edition !== 'universal') {
                    if (skill.metadata.edition !== dep.metadata.edition) {
                        warnings.push(
                            `Edition mismatch: '${skillName}' (${skill.metadata.edition}) depends on ` +
                            `'${depName}' (${dep.metadata.edition})`
                        );
                    }
                }
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }
    
    // Private helper methods
    
    /**
     * Extract dependencies from a skill
     */
    private extractDependencies(skill: ISkill): string[] {
        if (skill.type === 'composite') {
            const compositeSkill = skill as ICompositeSkill;
            if (compositeSkill.skillDependencies) {
                return [...compositeSkill.skillDependencies];
            }
            
            // Try to extract from decorator metadata
            try {
                return extractSkillDependencies(skill.constructor as any);
            } catch {
                return [];
            }
        }
        
        return skill.dependencies || [];
    }
    
    /**
     * Update dependent arrays for all nodes
     */
    private updateDependents(): void {
        // Clear existing dependents
        for (const node of this.nodes.values()) {
            node.dependents = [];
        }
        
        // Rebuild dependents from adjacency list
        for (const [skillName, dependencies] of this.adjacencyList) {
            for (const dep of dependencies) {
                const depNode = this.nodes.get(dep);
                if (depNode) {
                    depNode.dependents.push(skillName);
                }
            }
        }
        
        // Update dependent counts
        for (const node of this.nodes.values()) {
            node.analysis.dependentCount = node.dependents.length;
        }
    }
    
    /**
     * Calculate depths using topological ordering
     */
    private calculateDepths(): void {
        const inDegree = new Map<string, number>();
        const queue: string[] = [];
        
        // Initialize in-degree and find roots
        for (const [skillName, dependencies] of this.adjacencyList) {
            inDegree.set(skillName, dependencies.size);
            if (dependencies.size === 0) {
                queue.push(skillName);
                const node = this.nodes.get(skillName)!;
                node.analysis.depth = 0;
            }
        }
        
        // Process nodes level by level
        while (queue.length > 0) {
            const skillName = queue.shift()!;
            const currentDepth = this.nodes.get(skillName)!.analysis.depth;
            
            const dependents = this.reverseAdjacencyList.get(skillName) || new Set();
            for (const dependent of dependents) {
                const dependentNode = this.nodes.get(dependent)!;
                dependentNode.analysis.depth = Math.max(dependentNode.analysis.depth, currentDepth + 1);
                
                const currentInDegree = inDegree.get(dependent)! - 1;
                inDegree.set(dependent, currentInDegree);
                
                if (currentInDegree === 0) {
                    queue.push(dependent);
                }
            }
        }
    }
    
    /**
     * Calculate priority scores for skills
     */
    private calculatePriorities(): void {
        for (const node of this.nodes.values()) {
            // Higher priority for skills with more dependents
            const dependentWeight = node.analysis.dependentCount * 2;
            
            // Higher priority for skills with fewer dependencies
            const dependencyWeight = Math.max(0, 5 - node.dependencies.length);
            
            // Higher priority for verified skills
            const categoryWeight = node.metadata.category === 'verified' ? 3 : 1;
            
            // Lower priority for circular dependencies
            const circularPenalty = node.analysis.isCircular ? -5 : 0;
            
            node.analysis.priority = dependentWeight + dependencyWeight + categoryWeight + circularPenalty;
        }
    }
    
    /**
     * Assess the severity of a circular dependency
     */
    private assessCircularSeverity(cycle: string[]): 'warning' | 'error' {
        // Simple heuristic: longer cycles or cycles involving critical skills are more severe
        if (cycle.length > 3) return 'error';
        
        const criticalSkills = Array.from(this.nodes.values())
            .filter(node => node.analysis.dependentCount >= 3)
            .map(node => node.name);
        
        const hasCriticalSkill = cycle.some(skill => criticalSkills.includes(skill));
        return hasCriticalSkill ? 'error' : 'warning';
    }
    
    /**
     * Generate suggestions for resolving circular dependencies
     */
    private generateCircularResolutionSuggestions(cycle: string[]): string[] {
        const suggestions: string[] = [];
        
        suggestions.push('Consider using lazy loading for one of the dependencies');
        suggestions.push('Extract common functionality into a shared service');
        suggestions.push('Use event-driven communication instead of direct dependencies');
        
        if (cycle.length === 2) {
            suggestions.push('Consider merging the two skills if they are tightly coupled');
        }
        
        return suggestions;
    }
    
    /**
     * Handle resolution order calculation with circular dependencies
     */
    private calculateResolutionOrderWithCircularHandling(circularDeps: CircularDependency[]): ResolutionOrder {
        // For now, return a simple order that breaks cycles by removing one edge from each cycle
        // This is a simplified approach - could be enhanced with more sophisticated algorithms
        
        const modifiedAdjacencyList = new Map(this.adjacencyList);
        
        // Break cycles by removing the "least important" edge from each cycle
        for (const circular of circularDeps) {
            if (circular.cycle.length >= 2) {
                // Remove the last edge in the cycle
                const from = circular.cycle[circular.cycle.length - 1];
                const to = circular.cycle[0];
                
                const deps = modifiedAdjacencyList.get(from);
                if (deps) {
                    deps.delete(to);
                }
            }
        }
        
        // Now perform topological sort on the modified graph
        const inDegree = new Map<string, number>();
        const queue: string[] = [];
        const result: string[] = [];
        const levels: string[][] = [];
        
        // Initialize in-degree count with modified graph
        for (const skillName of this.nodes.keys()) {
            const dependencies = modifiedAdjacencyList.get(skillName) || new Set();
            inDegree.set(skillName, dependencies.size);
            
            if (dependencies.size === 0) {
                queue.push(skillName);
            }
        }
        
        // Process nodes level by level
        while (queue.length > 0) {
            const currentLevel = [...queue];
            levels.push(currentLevel);
            queue.length = 0;
            
            for (const skillName of currentLevel) {
                result.push(skillName);
                
                const dependents = this.reverseAdjacencyList.get(skillName) || new Set();
                for (const dependent of dependents) {
                    const deps = modifiedAdjacencyList.get(dependent) || new Set();
                    if (deps.has(skillName)) { // Only if edge wasn't removed
                        const currentInDegree = inDegree.get(dependent)! - 1;
                        inDegree.set(dependent, currentInDegree);
                        
                        if (currentInDegree === 0) {
                            queue.push(dependent);
                        }
                    }
                }
            }
        }
        
        const parallelGroups = this.identifyParallelGroups(levels);
        
        return {
            order: result,
            levels,
            parallelGroups,
            circularDependencies: circularDeps,
        };
    }
    
    /**
     * Identify groups of skills that can be loaded in parallel
     */
    private identifyParallelGroups(levels: string[][]): string[][] {
        return levels.map(level => {
            // Within each level, skills can potentially be loaded in parallel
            // Could add more sophisticated analysis here
            return level;
        });
    }
}