/**
 * Comprehensive example demonstrating the skill dependency system
 * 
 * This example showcases all features of the dependency system:
 * - @skillDependency decorator usage
 * - Composite skill creation with dependencies
 * - Dependency resolution and injection
 * - Validation and error handling
 * - TSyringe integration
 * - Visualization capabilities
 */

import { injectable, container } from 'tsyringe';
import { CompositeSkill } from '../CompositeSkill.js';
import { AtomicSkill } from '../AtomicSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillResult, SkillResults } from '../SkillResult.js';
import { SkillDependencyMap, ExecutionStep } from '../ICompositeSkill.js';
import { 
    skillDependency, 
    autoResolveDependencies,
    LazySkillFactory
} from '../decorators/skillDependency.js';
import { 
    autoInjectDependencies,
    createSkillWithDependencies 
} from '../injection/SkillDependencyInjectionManager.js';
import { SkillResolver } from '../SkillResolver.js';
import { SkillDependencyGraph } from '../SkillDependencyGraph.js';
import { SkillDependencyInjectionManager } from '../injection/SkillDependencyInjectionManager.js';
import { SkillDependencyValidator } from '../validation/SkillDependencyValidator.js';

// ============================================================================
// Example Atomic Skills (Dependencies)
// ============================================================================

/**
 * Basic mining skill that other skills depend on
 */
@injectable()
export class BasicMinerSkill extends AtomicSkill {
    readonly name = 'basicMiner';
    readonly description = 'Basic mining operations';
    readonly edition = 'java' as const;
    readonly category = 'library' as const;
    readonly version = '1.0.0';

    readonly inputSchema = {
        type: 'object',
        properties: {
            blockType: { type: 'string', description: 'Type of block to mine' },
            count: { type: 'number', description: 'Number of blocks to mine', default: 1 },
        },
        required: ['blockType'],
    };

    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        const { blockType, count = 1 } = context.params;
        
        this.log('info', `Mining ${count} ${blockType} block(s)`);
        
        // Simulate mining
        await new Promise(resolve => setTimeout(resolve, 1000 * count));
        
        return this.createSuccessResult(
            { minedBlocks: count, blockType },
            `Successfully mined ${count} ${blockType} block(s)`
        );
    }
}

/**
 * Basic crafting skill
 */
@injectable()
export class BasicCrafterSkill extends AtomicSkill {
    readonly name = 'basicCrafter';
    readonly description = 'Basic crafting operations';
    readonly edition = 'java' as const;
    readonly category = 'library' as const;
    readonly version = '1.0.0';

    readonly inputSchema = {
        type: 'object',
        properties: {
            item: { type: 'string', description: 'Item to craft' },
            count: { type: 'number', description: 'Number of items to craft', default: 1 },
        },
        required: ['item'],
    };

    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        const { item, count = 1 } = context.params;
        
        this.log('info', `Crafting ${count} ${item}`);
        
        // Simulate crafting
        await new Promise(resolve => setTimeout(resolve, 500 * count));
        
        return this.createSuccessResult(
            { craftedItems: count, item },
            `Successfully crafted ${count} ${item}`
        );
    }
}

/**
 * Building skill that depends on other skills
 */
@injectable()
export class BasicBuilderSkill extends AtomicSkill {
    readonly name = 'basicBuilder';
    readonly description = 'Basic building operations';
    readonly edition = 'java' as const;
    readonly category = 'library' as const;
    readonly version = '1.0.0';

    readonly inputSchema = {
        type: 'object',
        properties: {
            structure: { type: 'string', description: 'Structure to build' },
            material: { type: 'string', description: 'Building material' },
        },
        required: ['structure', 'material'],
    };

    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        const { structure, material } = context.params;
        
        this.log('info', `Building ${structure} with ${material}`);
        
        // Simulate building
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return this.createSuccessResult(
            { structure, material, built: true },
            `Successfully built ${structure} with ${material}`
        );
    }
}

// ============================================================================
// Example Composite Skills (Using Dependencies)
// ============================================================================

/**
 * Tool crafting skill using decorator-based dependency injection
 */
@injectable()
@autoResolveDependencies // Automatically populates skillDependencies from decorators
@autoInjectDependencies() // Automatically injects dependencies when created
export class ToolCraftingSkill extends CompositeSkill {
    readonly name = 'toolCrafting';
    readonly description = 'Craft tools by mining resources and crafting';
    readonly edition = 'java' as const;
    readonly category = 'verified' as const;
    readonly version = '1.0.0';

    // Dependencies injected via decorators
    @skillDependency({ 
        name: 'basicMiner', 
        optional: false,
        version: '^1.0.0',
        category: 'library'
    })
    private miner!: BasicMinerSkill;

    @skillDependency({ 
        name: 'basicCrafter',
        optional: false,
        lazy: false // Direct injection
    })
    private crafter!: BasicCrafterSkill;

    @skillDependency({ 
        name: 'basicBuilder',
        optional: true, // Optional dependency
        lazy: true // Lazy loading
    })
    private builderFactory!: LazySkillFactory<BasicBuilderSkill>;

    readonly skillDependencies = ['basicMiner', 'basicCrafter', 'basicBuilder'];

    readonly inputSchema = {
        type: 'object',
        properties: {
            tool: { 
                type: 'string', 
                description: 'Tool to craft',
                enum: ['pickaxe', 'shovel', 'axe', 'sword'] 
            },
            material: { 
                type: 'string', 
                description: 'Tool material',
                enum: ['wood', 'stone', 'iron', 'diamond'],
                default: 'wood'
            },
            buildWorkshop: {
                type: 'boolean',
                description: 'Whether to build a workshop first',
                default: false
            }
        },
        required: ['tool'],
    };

    /**
     * Create execution steps for tool crafting
     */
    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        const { tool, material = 'wood', buildWorkshop = false } = params;
        const steps: Omit<ExecutionStep, 'id'>[] = [];

        // Step 1: Build workshop if requested (using lazy dependency)
        if (buildWorkshop) {
            steps.push({
                skillName: 'basicBuilder',
                description: 'Build crafting workshop',
                params: {
                    structure: 'workshop',
                    material: 'wood'
                },
                estimatedTime: 2000,
                optional: true, // Building workshop is optional
            });
        }

        // Step 2: Mine resources
        const resourcesNeeded = this.getResourcesForTool(tool, material);
        for (const resource of resourcesNeeded) {
            steps.push({
                skillName: 'basicMiner',
                description: `Mine ${resource.type} for tool crafting`,
                params: {
                    blockType: resource.type,
                    count: resource.count
                },
                estimatedTime: 1000 * resource.count,
                optional: false,
                dependsOn: buildWorkshop ? [`${this.name}-step-1`] : undefined,
            });
        }

        // Step 3: Craft the tool
        steps.push({
            skillName: 'basicCrafter',
            description: `Craft ${material} ${tool}`,
            params: {
                item: `${material}_${tool}`,
                count: 1
            },
            estimatedTime: 2000,
            optional: false,
            // Depends on all mining steps
            dependsOn: resourcesNeeded.map((_, index) => 
                `${this.name}-step-${buildWorkshop ? index + 2 : index + 1}`
            ),
        });

        return steps;
    }

    /**
     * Execute tool crafting with dependency injection
     */
    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        this.log('info', 'Starting tool crafting with dependency injection');

        const { tool, material = 'wood', buildWorkshop = false } = context.params;

        try {
            // Use injected dependencies directly
            const results: any[] = [];

            // Build workshop if requested (using lazy dependency)
            if (buildWorkshop) {
                const builder = this.builderFactory();
                if (builder) {
                    this.log('info', 'Building workshop using lazy-loaded builder');
                    const workshopResult = await builder.execute({
                        ...context,
                        params: { structure: 'workshop', material: 'wood' }
                    });
                    
                    if (workshopResult.success) {
                        results.push({ workshop: workshopResult.data });
                    } else {
                        this.log('warn', 'Workshop building failed, continuing without it');
                    }
                } else {
                    this.log('warn', 'Builder not available for workshop construction');
                }
            }

            // Mine resources using direct injection
            const resourcesNeeded = this.getResourcesForTool(tool, material);
            const minedResources: any[] = [];

            for (const resource of resourcesNeeded) {
                this.log('info', `Mining ${resource.count} ${resource.type} using injected miner`);
                const mineResult = await this.miner.execute({
                    ...context,
                    params: {
                        blockType: resource.type,
                        count: resource.count
                    }
                });

                if (mineResult.success) {
                    minedResources.push(mineResult.data);
                } else {
                    return this.createErrorResult(
                        `Failed to mine ${resource.type}: ${mineResult.error}`,
                        'MINING_FAILED'
                    );
                }
            }

            results.push({ resources: minedResources });

            // Craft tool using direct injection
            this.log('info', `Crafting ${material} ${tool} using injected crafter`);
            const craftResult = await this.crafter.execute({
                ...context,
                params: {
                    item: `${material}_${tool}`,
                    count: 1
                }
            });

            if (craftResult.success) {
                results.push({ tool: craftResult.data });
                return this.createSuccessResult(
                    {
                        tool: `${material}_${tool}`,
                        results,
                        workshopBuilt: buildWorkshop && results[0]?.workshop,
                    },
                    `Successfully crafted ${material} ${tool}`,
                    [
                        `Mined ${resourcesNeeded.length} types of resources`,
                        `Crafted 1 ${material} ${tool}`,
                        buildWorkshop ? 'Built workshop' : 'No workshop needed'
                    ]
                );
            } else {
                return this.createErrorResult(
                    `Failed to craft tool: ${craftResult.error}`,
                    'CRAFTING_FAILED'
                );
            }

        } catch (error) {
            return this.createErrorResult(
                `Tool crafting failed: ${error instanceof Error ? error.message : String(error)}`,
                'EXECUTION_ERROR'
            );
        }
    }

    /**
     * Helper to determine resources needed for a tool
     */
    private getResourcesForTool(tool: string, material: string): Array<{ type: string; count: number }> {
        const baseResources = {
            pickaxe: [{ type: 'stick', count: 2 }],
            shovel: [{ type: 'stick', count: 2 }],
            axe: [{ type: 'stick', count: 2 }],
            sword: [{ type: 'stick', count: 1 }],
        }[tool] || [];

        const materialResources = {
            wood: [{ type: 'wood', count: 3 }],
            stone: [{ type: 'cobblestone', count: 3 }],
            iron: [{ type: 'iron_ore', count: 3 }],
            diamond: [{ type: 'diamond', count: 3 }],
        }[material] || [];

        return [...baseResources, ...materialResources];
    }

    /**
     * Custom validation for tool crafting parameters
     */
    protected async performCustomValidation(params: Record<string, any>): Promise<{ errors: string[], warnings: string[] }> {
        const { errors, warnings } = await super.performCustomValidation(params);
        const { tool, material = 'wood' } = params;

        // Validate tool/material combinations
        if (tool === 'sword' && material === 'wood') {
            warnings.push('Wooden swords are not very effective');
        }

        if (material === 'diamond' && !['pickaxe', 'sword'].includes(tool)) {
            warnings.push('Diamond is most effective for pickaxes and swords');
        }

        return { errors, warnings };
    }
}

/**
 * Advanced composite skill demonstrating complex dependency relationships
 */
@injectable()
export class AdvancedBaseBuilderSkill extends CompositeSkill {
    readonly name = 'advancedBaseBuilder';
    readonly description = 'Build a complete base with tools, resources, and structures';
    readonly edition = 'java' as const;
    readonly category = 'verified' as const;
    readonly version = '2.0.0';

    // This skill depends on the tool crafting skill, creating a dependency chain
    readonly skillDependencies = ['toolCrafting', 'basicBuilder'];

    readonly inputSchema = {
        type: 'object',
        properties: {
            baseType: {
                type: 'string',
                description: 'Type of base to build',
                enum: ['simple', 'advanced', 'fortress'],
                default: 'simple'
            },
            includeFarms: {
                type: 'boolean',
                description: 'Whether to include farms',
                default: true
            },
            defensiveWalls: {
                type: 'boolean',
                description: 'Whether to build defensive walls',
                default: false
            }
        },
        required: [],
    };

    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        const { baseType = 'simple', includeFarms = true, defensiveWalls = false } = params;
        const steps: Omit<ExecutionStep, 'id'>[] = [];

        // Step 1: Craft tools needed for base building
        steps.push({
            skillName: 'toolCrafting',
            description: 'Craft tools for base construction',
            params: {
                tool: 'pickaxe',
                material: baseType === 'fortress' ? 'diamond' : 'iron',
                buildWorkshop: true
            },
            estimatedTime: 8000,
            optional: false,
        });

        // Step 2: Build main structure
        steps.push({
            skillName: 'basicBuilder',
            description: `Build ${baseType} base structure`,
            params: {
                structure: baseType === 'fortress' ? 'castle' : 'house',
                material: baseType === 'simple' ? 'wood' : 'stone'
            },
            estimatedTime: 10000,
            optional: false,
            dependsOn: [`${this.name}-step-1`],
        });

        // Step 3: Build farms if requested
        if (includeFarms) {
            steps.push({
                skillName: 'basicBuilder',
                description: 'Build farming area',
                params: {
                    structure: 'farm',
                    material: 'wood'
                },
                estimatedTime: 5000,
                optional: true,
                dependsOn: [`${this.name}-step-2`],
            });
        }

        // Step 4: Build defensive walls if requested
        if (defensiveWalls) {
            steps.push({
                skillName: 'basicBuilder',
                description: 'Build defensive walls',
                params: {
                    structure: 'walls',
                    material: 'stone'
                },
                estimatedTime: 15000,
                optional: true,
                dependsOn: [`${this.name}-step-2`],
            });
        }

        return steps;
    }

    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        this.log('info', 'Starting advanced base construction');

        // Use the enhanced composite execution with automatic orchestration
        return await this.executeCompositeSkill(context, dependencies);
    }

    /**
     * Custom rollback implementation for base building
     */
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        this.log('info', `Rolling back base construction step: ${stepId}`);
        
        // In a real implementation, this would tear down built structures
        if (stepId.includes('build')) {
            this.log('info', `Simulating structure demolition for step ${stepId}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    /**
     * This skill supports rollback
     */
    protected supportsRollback(): boolean {
        return true;
    }
}

// ============================================================================
// Usage Examples and Demonstration
// ============================================================================

/**
 * Comprehensive example showing how to use the skill dependency system
 */
export class DependencySystemDemo {
    private resolver: SkillResolver;
    private graph: SkillDependencyGraph;
    private injectionManager: SkillDependencyInjectionManager;
    private validator: SkillDependencyValidator;

    constructor() {
        // Get services from TSyringe container
        this.resolver = container.resolve(SkillResolver);
        this.graph = container.resolve(SkillDependencyGraph);
        this.injectionManager = container.resolve(SkillDependencyInjectionManager);
        this.validator = container.resolve(SkillDependencyValidator);
    }

    /**
     * Demonstrate complete dependency system workflow
     */
    async demonstrateFullWorkflow() {
        console.log('🚀 Starting Skill Dependency System Demonstration');
        
        // 1. Register all skills
        await this.registerSkills();
        
        // 2. Analyze dependency graph
        await this.analyzeDependencyGraph();
        
        // 3. Validate dependencies
        await this.validateDependencies();
        
        // 4. Demonstrate dependency injection
        await this.demonstrateDependencyInjection();
        
        // 5. Execute composite skills
        await this.executeCompositeSkills();
        
        // 6. Generate visualization
        await this.generateVisualization();
        
        console.log('✅ Skill Dependency System Demonstration Complete');
    }

    /**
     * Register all example skills
     */
    private async registerSkills() {
        console.log('\n📋 Registering Skills...');
        
        const skills = [
            new BasicMinerSkill(),
            new BasicCrafterSkill(),
            new BasicBuilderSkill(),
        ];

        for (const skill of skills) {
            this.resolver.registerSkill(skill);
            console.log(`  ✓ Registered: ${skill.name} (${skill.type || 'legacy'})`);
        }

        // Register composite skills
        const compositeSkills = [
            await createSkillWithDependencies(ToolCraftingSkill),
            await createSkillWithDependencies(AdvancedBaseBuilderSkill),
        ];

        for (const skill of compositeSkills) {
            this.resolver.registerSkill(skill);
            console.log(`  ✓ Registered: ${skill.name} (${skill.type})`);
        }
    }

    /**
     * Analyze the dependency graph
     */
    private async analyzeDependencyGraph() {
        console.log('\n📊 Analyzing Dependency Graph...');
        
        const statistics = this.resolver.getGraphStatistics();
        
        console.log(`  • Total Skills: ${statistics.totalNodes}`);
        console.log(`  • Total Dependencies: ${statistics.totalEdges}`);
        console.log(`  • Maximum Depth: ${statistics.maxDepth}`);
        console.log(`  • Average Depth: ${statistics.averageDepth.toFixed(2)}`);
        console.log(`  • Circular Dependencies: ${statistics.circularDependencies}`);
        console.log(`  • Critical Skills: ${statistics.criticalNodes.join(', ') || 'None'}`);

        // Check for resolution order
        const graph = this.resolver.getDependencyGraph();
        const resolutionOrder = graph.calculateResolutionOrder();
        
        console.log(`  • Resolution Order: ${resolutionOrder.order.join(' → ')}`);
        
        if (resolutionOrder.circularDependencies.length > 0) {
            console.log('  ⚠️ Circular Dependencies Found:');
            for (const circular of resolutionOrder.circularDependencies) {
                console.log(`    - ${circular.path} (${circular.severity})`);
            }
        }
    }

    /**
     * Validate all dependencies
     */
    private async validateDependencies() {
        console.log('\n🔍 Validating Dependencies...');
        
        const validation = this.validator.validateGraph(this.resolver.getDependencyGraph());
        
        console.log(`  • Overall Status: ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
        console.log(`  • Total Issues: ${validation.statistics.totalIssues}`);
        console.log(`  • Critical: ${validation.statistics.criticalIssues}`);
        console.log(`  • Errors: ${validation.statistics.errorIssues}`);
        console.log(`  • Warnings: ${validation.statistics.warningIssues}`);
        console.log(`  • Info: ${validation.statistics.infoIssues}`);

        // Show some example issues
        if (validation.results.length > 0) {
            console.log('  📝 Sample Validation Results:');
            for (const result of validation.results.slice(0, 3)) {
                console.log(`    ${this.getSeverityEmoji(result.severity)} ${result.message}`);
                if (result.suggestion) {
                    console.log(`      💡 ${result.suggestion}`);
                }
            }
        }
    }

    /**
     * Demonstrate dependency injection
     */
    private async demonstrateDependencyInjection() {
        console.log('\n💉 Demonstrating Dependency Injection...');
        
        const toolCraftingClass = ToolCraftingSkill;
        const availableSkills = new Map();
        
        // Add available skills
        availableSkills.set('basicMiner', new BasicMinerSkill());
        availableSkills.set('basicCrafter', new BasicCrafterSkill());
        availableSkills.set('basicBuilder', new BasicBuilderSkill());

        // Create instance with dependencies
        const toolCraftingSkill = await createSkillWithDependencies(
            toolCraftingClass,
            availableSkills,
            {
                validate: true,
                cache: true,
                monitorPerformance: true
            }
        );

        console.log(`  ✓ Created ${toolCraftingSkill.name} with dependencies`);
        console.log(`  📦 Dependencies: ${toolCraftingSkill.skillDependencies.join(', ')}`);

        // Test injection result
        const injectionResult = await this.injectionManager.injectDependencies(
            toolCraftingSkill,
            availableSkills,
            { validate: true, monitorPerformance: true }
        );

        console.log(`  📊 Injection Result:`);
        console.log(`    • Success: ${injectionResult.success ? '✅' : '❌'}`);
        console.log(`    • Dependencies Injected: ${injectionResult.injectedDependencies.length}`);
        console.log(`    • Time: ${injectionResult.metrics.totalTime}ms`);
        console.log(`    • Memory: ${injectionResult.metrics.memoryUsage ? Math.round(injectionResult.metrics.memoryUsage / 1024 / 1024) + 'MB' : 'N/A'}`);
    }

    /**
     * Execute composite skills to demonstrate the full workflow
     */
    private async executeCompositeSkills() {
        console.log('\n🎯 Executing Composite Skills...');
        
        // Resolve tool crafting skill
        const toolResolution = await this.resolver.resolve('toolCrafting', {
            useCache: true,
            validateDependencies: true,
            autoInject: true,
        });

        if (toolResolution.success && toolResolution.skill) {
            console.log(`  📝 Executing ${toolResolution.skill.name}...`);
            
            const mockContext = {
                bot: {} as any,
                params: {
                    tool: 'pickaxe',
                    material: 'iron',
                    buildWorkshop: true
                },
                serviceParams: {} as any,
                metadata: { 
                    name: 'toolCrafting',
                    edition: 'java' as const,
                    category: 'verified' as const,
                    version: '1.0.0'
                }
            };

            const executionResult = await (toolResolution.skill as ToolCraftingSkill)
                .execute(mockContext, toolResolution.dependencies);

            console.log(`  📊 Execution Result:`);
            console.log(`    • Success: ${executionResult.success ? '✅' : '❌'}`);
            if (executionResult.success) {
                console.log(`    • Result: ${executionResult.message}`);
                console.log(`    • Data: ${JSON.stringify(executionResult.data, null, 2)}`);
            } else {
                const errorResult = executionResult as any;
                console.log(`    • Error: ${errorResult.error || 'Unknown error'}`);
            }
        }
    }

    /**
     * Generate dependency graph visualization
     */
    private async generateVisualization() {
        console.log('\n🎨 Generating Dependency Graph Visualization...');
        
        const visualization = this.resolver.getDependencyGraph().generateVisualization('hierarchical');
        
        console.log(`  📊 Visualization Data:`);
        console.log(`    • Nodes: ${visualization.nodes.length}`);
        console.log(`    • Edges: ${visualization.edges.length}`);
        console.log(`    • Layout: ${visualization.metadata.layout}`);
        console.log(`    • Generated: ${visualization.metadata.generated.toISOString()}`);

        // Show node summary
        const nodesByType = visualization.nodes.reduce((acc, node) => {
            acc[node.type] = (acc[node.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log(`  📋 Node Types:`);
        for (const [type, count] of Object.entries(nodesByType)) {
            console.log(`    • ${type}: ${count}`);
        }

        // Show some sample edges
        console.log(`  🔗 Sample Dependencies:`);
        for (const edge of visualization.edges.slice(0, 3)) {
            console.log(`    • ${edge.from} → ${edge.to}`);
        }
    }

    /**
     * Helper to get emoji for validation severity
     */
    private getSeverityEmoji(severity: string): string {
        const emojis = {
            info: 'ℹ️',
            warning: '⚠️',
            error: '❌',
            critical: '🚨'
        };
        return emojis[severity as keyof typeof emojis] || '❓';
    }
}

// ============================================================================
// Usage Instructions and Quick Start
// ============================================================================

/**
 * Quick start guide for using the skill dependency system
 */
export const USAGE_GUIDE = `
# Skill Dependency System Usage Guide

## 1. Creating Atomic Skills
\`\`\`typescript
@injectable()
export class MyAtomicSkill extends AtomicSkill {
    readonly name = 'mySkill';
    readonly description = 'My skill description';
    readonly edition = 'java' as const;
    readonly category = 'library' as const;
    
    // Define input schema
    readonly inputSchema = { /* ... */ };
    
    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        // Implementation here
    }
}
\`\`\`

## 2. Creating Composite Skills with Dependencies
\`\`\`typescript
@injectable()
@autoResolveDependencies
export class MyCompositeSkill extends CompositeSkill {
    // Decorator-based dependency injection
    @skillDependency({ name: 'basicMiner', optional: false })
    private miner!: BasicMinerSkill;
    
    @skillDependency({ name: 'basicBuilder', lazy: true, optional: true })
    private builderFactory!: LazySkillFactory<BasicBuilderSkill>;
    
    readonly skillDependencies = ['basicMiner', 'basicBuilder'];
    
    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        // Use injected dependencies
        const result = await this.miner.execute(context);
        
        // Use lazy dependency
        const builder = this.builderFactory();
        if (builder) {
            await builder.execute(context);
        }
        
        return this.createSuccessResult(/* ... */);
    }
}
\`\`\`

## 3. Using the Dependency System
\`\`\`typescript
// Get resolver from container
const resolver = container.resolve(SkillResolver);

// Register skills
resolver.registerSkill(new MyAtomicSkill());

// Create skill with dependencies
const skill = await createSkillWithDependencies(MyCompositeSkill);

// Resolve and execute
const result = await resolver.resolve('myCompositeSkill');
if (result.success) {
    const executionResult = await result.skill.execute(context, result.dependencies);
}
\`\`\`

## 4. Validation and Analysis
\`\`\`typescript
const validator = container.resolve(SkillDependencyValidator);
const graph = container.resolve(SkillDependencyGraph);

// Validate entire graph
const validation = validator.validateGraph(graph);

// Analyze dependencies
const statistics = graph.analyzeGraph();

// Generate visualization
const visualization = graph.generateVisualization('hierarchical');
\`\`\`

## 5. Advanced Features
- Circular dependency detection
- Lazy loading with factories
- Performance monitoring
- Hot-reloading support
- Custom validation rules
- Dependency versioning
- TSyringe integration
`;

// Note: Classes are already exported above with their declarations