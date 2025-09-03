# Skill Dependency System

A comprehensive dependency injection system for Minecraft MCP skills that enables complex skill orchestration through declarative dependency management.

## Overview

The Skill Dependency System provides:

- **Declarative Dependencies**: Use decorators to declare skill dependencies
- **Automatic Resolution**: Intelligent dependency graph resolution with circular detection
- **Type-Safe Injection**: Full TypeScript support with runtime validation
- **Performance Optimization**: Caching, lazy loading, and parallel execution
- **Advanced Validation**: Multi-level validation with custom rules
- **Graph Visualization**: Visual dependency analysis and debugging
- **TSyringe Integration**: Seamless integration with the existing DI container

## Quick Start

### 1. Create an Atomic Skill

```typescript
import { injectable } from 'tsyringe';
import { AtomicSkill } from '../AtomicSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillResult } from '../SkillResult.js';

@injectable()
export class BasicMinerSkill extends AtomicSkill {
    readonly name = 'basicMiner';
    readonly description = 'Mine blocks and collect resources';
    readonly edition = 'java' as const;
    readonly category = 'library' as const;
    readonly version = '1.0.0';

    readonly inputSchema = {
        type: 'object',
        properties: {
            blockType: { type: 'string', description: 'Block type to mine' },
            count: { type: 'number', description: 'Number of blocks', default: 1 }
        },
        required: ['blockType']
    };

    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        const { blockType, count = 1 } = context.params;
        
        // Mining implementation here
        return this.createSuccessResult(
            { minedBlocks: count, blockType },
            `Mined ${count} ${blockType}`
        );
    }
}
```

### 2. Create a Composite Skill with Dependencies

```typescript
import { injectable } from 'tsyringe';
import { CompositeSkill } from '../CompositeSkill.js';
import { skillDependency, autoResolveDependencies, LazySkillFactory } from '../decorators/skillDependency.js';

@injectable()
@autoResolveDependencies
export class ToolCraftingSkill extends CompositeSkill {
    readonly name = 'toolCrafting';
    readonly description = 'Craft tools by mining resources';
    readonly edition = 'java' as const;
    readonly category = 'verified' as const;

    // Direct dependency injection
    @skillDependency({ 
        name: 'basicMiner', 
        optional: false,
        version: '^1.0.0' 
    })
    private miner!: BasicMinerSkill;

    // Lazy dependency injection
    @skillDependency({ 
        name: 'basicBuilder',
        lazy: true,
        optional: true 
    })
    private builderFactory!: LazySkillFactory<BasicBuilderSkill>;

    readonly skillDependencies = ['basicMiner', 'basicBuilder'];

    readonly inputSchema = {
        type: 'object',
        properties: {
            tool: { type: 'string', description: 'Tool to craft' },
            material: { type: 'string', description: 'Material type' }
        },
        required: ['tool', 'material']
    };

    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        const { tool, material } = context.params;

        // Use injected miner directly
        const mineResult = await this.miner.execute({
            ...context,
            params: { blockType: material, count: 3 }
        });

        if (!mineResult.success) {
            return this.createErrorResult(`Mining failed: ${mineResult.error}`, 'MINING_FAILED');
        }

        // Use lazy builder if needed
        const builder = this.builderFactory();
        if (builder) {
            await builder.execute({
                ...context,
                params: { structure: 'workbench', material: 'wood' }
            });
        }

        return this.createSuccessResult(
            { tool: `${material}_${tool}`, resources: mineResult.data },
            `Crafted ${material} ${tool}`
        );
    }
}
```

### 3. Use the Dependency System

```typescript
import { container } from 'tsyringe';
import { createSkillWithDependencies, SkillResolver } from '../dependency-system.js';

// Create skill with automatic dependency injection
const toolCraftingSkill = await createSkillWithDependencies(ToolCraftingSkill);

// Or use the resolver for more control
const resolver = container.resolve(SkillResolver);
const result = await resolver.resolve('toolCrafting', {
    useCache: true,
    validateDependencies: true,
    autoInject: true
});

if (result.success && result.skill) {
    const executionResult = await result.skill.execute(context, result.dependencies);
}
```

## Core Components

### SkillDependencyGraph

Manages the dependency graph with advanced features:

```typescript
const graph = container.resolve(SkillDependencyGraph);

// Add skills to the graph
graph.addSkill(skill);

// Analyze dependencies
const statistics = graph.analyzeGraph();
console.log(`Total skills: ${statistics.totalNodes}`);
console.log(`Dependencies: ${statistics.totalEdges}`);
console.log(`Max depth: ${statistics.maxDepth}`);

// Detect circular dependencies
const circular = graph.detectCircularDependencies();
circular.forEach(c => console.log(`Circular: ${c.path}`));

// Calculate resolution order
const order = graph.calculateResolutionOrder();
console.log(`Resolution order: ${order.order.join(' → ')}`);

// Generate visualization
const visualization = graph.generateVisualization('hierarchical');
```

### SkillResolver

Resolves skills and their dependencies:

```typescript
const resolver = container.resolve(SkillResolver);

// Register skills
resolver.registerSkill(new BasicMinerSkill());
resolver.registerSkill(toolCraftingSkill);

// Resolve with options
const result = await resolver.resolve('toolCrafting', {
    useCache: true,
    validateDependencies: true,
    maxDepth: 20,
    editionFilter: 'java',
    categoryFilter: 'verified'
});

// Resolve multiple skills efficiently
const results = await resolver.resolveMultiple(['toolCrafting', 'baseBuilder']);
```

### SkillDependencyValidator

Comprehensive validation system:

```typescript
const validator = container.resolve(SkillDependencyValidator);

// Validate single skill
const skillValidation = validator.validateSkill(skill, dependencies, allSkills, graph);

// Validate entire graph
const graphValidation = validator.validateGraph(graph, {
    checkVersions: true,
    checkEditions: true,
    performanceAnalysis: true
});

console.log(`Validation: ${graphValidation.isValid ? 'PASSED' : 'FAILED'}`);
console.log(`Issues: ${graphValidation.statistics.totalIssues}`);

// Custom validation rules
const customRule = validator.createCustomRule(
    'custom-performance',
    'Performance Check',
    'Check for performance issues',
    ValidationSeverity.WARNING,
    (skill, deps, context) => {
        // Custom validation logic
        return [];
    }
);

validator.registerRule(customRule);
```

### SkillDependencyInjectionManager

Advanced dependency injection:

```typescript
const injectionManager = container.resolve(SkillDependencyInjectionManager);

// Inject dependencies with options
const result = await injectionManager.injectDependencies(skill, availableSkills, {
    validate: true,
    cache: true,
    allowPartial: false,
    timeout: 30000,
    monitorPerformance: true
});

console.log(`Injection successful: ${result.success}`);
console.log(`Dependencies injected: ${result.injectedDependencies.length}`);
console.log(`Time: ${result.metrics.totalTime}ms`);

// Inject multiple skills
const results = await injectionManager.injectMultipleSkills(skills, availableSkills);

// Create injected instances
const injectedSkill = await injectionManager.createInjectedInstance(ToolCraftingSkill);
```

## Decorator System

### @skillDependency

Declare dependencies on skill properties:

```typescript
export class MyCompositeSkill extends CompositeSkill {
    // Basic dependency
    @skillDependency({ name: 'basicMiner' })
    private miner!: ISkill;

    // Optional dependency
    @skillDependency({ name: 'advancedBuilder', optional: true })
    private builder?: ISkill;

    // Lazy loading
    @skillDependency({ name: 'heavyProcessor', lazy: true })
    private processorFactory!: LazySkillFactory;

    // With version and edition constraints
    @skillDependency({ 
        name: 'specialTool', 
        version: '^2.0.0',
        edition: 'java',
        category: 'verified',
        validate: (skill) => skill.name.includes('Special')
    })
    private specialTool!: ISkill;
}
```

### @autoResolveDependencies

Automatically populate `skillDependencies` array:

```typescript
@autoResolveDependencies
export class MySkill extends CompositeSkill {
    @skillDependency({ name: 'dep1' })
    private dep1!: ISkill;

    @skillDependency({ name: 'dep2' })
    private dep2!: ISkill;

    // skillDependencies automatically becomes ['dep1', 'dep2']
}
```

### @autoInjectDependencies

Automatically inject dependencies on creation:

```typescript
@autoInjectDependencies({ validate: true, cache: true })
export class MySkill extends CompositeSkill {
    // Dependencies will be injected automatically when the class is instantiated
}
```

## Validation System

### Built-in Validation Rules

The system includes comprehensive built-in validation rules:

1. **Missing Dependencies**: Ensures all required dependencies exist
2. **Edition Compatibility**: Validates edition compatibility
3. **Version Compatibility**: Checks version constraints
4. **Circular Dependencies**: Detects circular dependency cycles
5. **Dependency Depth**: Warns about excessive dependency chains
6. **Performance Impact**: Analyzes performance implications
7. **Category Consistency**: Checks category compatibility

### Custom Validation Rules

Create custom validation logic:

```typescript
const validator = container.resolve(SkillDependencyValidator);

const performanceRule = validator.createCustomRule(
    'performance-impact',
    'Performance Impact Analysis',
    'Analyze performance impact of skill dependencies',
    ValidationSeverity.WARNING,
    (skill, dependencies, context) => {
        const results = [];
        
        if (Object.keys(dependencies).length > 10) {
            results.push({
                ruleId: 'performance-impact',
                severity: ValidationSeverity.WARNING,
                message: `Skill ${skill.name} has many dependencies (${Object.keys(dependencies).length})`,
                skillName: skill.name,
                relatedSkills: Object.keys(dependencies),
                suggestion: 'Consider breaking down into smaller skills'
            });
        }
        
        return results;
    }
);

validator.registerRule(performanceRule);
```

## Graph Visualization

Generate visual representations of dependency relationships:

```typescript
const graph = container.resolve(SkillDependencyGraph);

// Generate visualization data
const visualization = graph.generateVisualization('hierarchical');

// Access visualization data
console.log('Nodes:', visualization.nodes.map(n => ({
    id: n.id,
    label: n.label,
    type: n.type,
    level: n.level
})));

console.log('Edges:', visualization.edges.map(e => ({
    from: e.from,
    to: e.to,
    type: e.type
})));

// Statistics
console.log('Statistics:', visualization.metadata.statistics);
```

The visualization data can be used with graph visualization libraries like:
- D3.js for custom web visualizations
- Graphviz for server-side graph generation
- Cytoscape.js for interactive web graphs
- vis.js for network visualizations

## Performance Features

### Caching

Multiple levels of caching for optimal performance:

```typescript
// Resolution caching
const result = await resolver.resolve('skill', { useCache: true });

// Injection caching
const injection = await injectionManager.injectDependencies(skill, deps, { cache: true });

// Clear caches when needed
resolver.clearCache();
injectionManager.clearCache();
```

### Lazy Loading

Defer expensive skill loading until needed:

```typescript
export class OptimizedSkill extends CompositeSkill {
    @skillDependency({ name: 'heavySkill', lazy: true })
    private heavySkillFactory!: LazySkillFactory;

    async execute(context: ISkillContext, deps: SkillDependencyMap) {
        // Only load if actually needed
        if (context.params.useHeavyProcessing) {
            const heavySkill = this.heavySkillFactory();
            if (heavySkill) {
                return await heavySkill.execute(context);
            }
        }
        
        return this.createSuccessResult('Light processing completed');
    }
}
```

### Parallel Execution

Skills can be executed in parallel when dependencies allow:

```typescript
const resolutionOrder = graph.calculateResolutionOrder();

// Parallel groups can be executed simultaneously
for (const parallelGroup of resolutionOrder.parallelGroups) {
    await Promise.all(parallelGroup.map(skillName => executeSkill(skillName)));
}
```

## Error Handling

Comprehensive error handling and recovery:

```typescript
const result = await resolver.resolve('problematicSkill', {
    allowPartial: true,  // Continue with missing optional dependencies
    maxDepth: 10,        // Prevent infinite recursion
    timeout: 30000       // Set timeout for resolution
});

if (!result.success) {
    console.log('Resolution errors:', result.errors);
    console.log('Warnings:', result.warnings);
    console.log('Circular dependencies:', result.circularDependencies);
}
```

## Integration with TSyringe

The system is fully integrated with TSyringe:

```typescript
// Register skills in container
container.registerSingleton('mySkill', MySkill);

// Skills can inject other services
@injectable()
export class ServiceAwareSkill extends AtomicSkill {
    constructor(
        @inject(TOKENS.InventoryService) private inventory: IInventoryService,
        @inject(TOKENS.MovementService) private movement: IMovementService
    ) {
        super();
    }
}

// Use container for skill creation
const skill = container.resolve(MyCompositeSkill);
```

## Testing

Testing skills with dependencies:

```typescript
describe('ToolCraftingSkill', () => {
    let skill: ToolCraftingSkill;
    let mockDependencies: SkillDependencyMap;

    beforeEach(async () => {
        // Create mock dependencies
        mockDependencies = {
            basicMiner: {
                name: 'basicMiner',
                execute: jest.fn().mockResolvedValue({
                    success: true,
                    data: { minedBlocks: 3, blockType: 'iron_ore' }
                })
            }
        };

        // Create skill with dependencies
        skill = await createSkillWithDependencies(ToolCraftingSkill, new Map(
            Object.entries(mockDependencies)
        ));
    });

    it('should craft tools using dependencies', async () => {
        const context = {
            bot: mockBot,
            params: { tool: 'pickaxe', material: 'iron' },
            serviceParams: {},
            metadata: { name: 'toolCrafting' }
        };

        const result = await skill.execute(context, mockDependencies);

        expect(result.success).toBe(true);
        expect(result.data.tool).toBe('iron_pickaxe');
        expect(mockDependencies.basicMiner.execute).toHaveBeenCalled();
    });
});
```

## Best Practices

1. **Keep Dependencies Minimal**: Only depend on what you actually need
2. **Use Lazy Loading**: For expensive or optional dependencies
3. **Validate Early**: Enable validation in development
4. **Monitor Performance**: Use performance monitoring in production
5. **Handle Failures Gracefully**: Always handle dependency resolution failures
6. **Version Your Skills**: Use semantic versioning for compatibility
7. **Document Dependencies**: Clearly document why dependencies are needed
8. **Test Thoroughly**: Test all dependency combinations
9. **Cache Wisely**: Use caching but ensure cache invalidation works
10. **Visualize Complex Graphs**: Use visualization to understand complex dependencies

## Troubleshooting

### Common Issues

1. **Circular Dependencies**
   ```typescript
   // Problem: A → B → C → A
   // Solution: Break the cycle or use lazy loading
   @skillDependency({ name: 'problemSkill', lazy: true })
   ```

2. **Missing Dependencies**
   ```typescript
   // Ensure all dependencies are registered
   resolver.registerSkill(new MissingSkill());
   ```

3. **Version Conflicts**
   ```typescript
   // Use compatible version ranges
   @skillDependency({ name: 'skill', version: '^1.0.0' })
   ```

4. **Performance Issues**
   ```typescript
   // Use lazy loading and caching
   @skillDependency({ name: 'heavySkill', lazy: true })
   
   // Enable caching
   const result = await resolver.resolve('skill', { useCache: true });
   ```

### Debugging

Enable detailed logging and use the health checker:

```typescript
const healthChecker = new DependencySystemHealthChecker(resolver, validator);
const health = await healthChecker.performHealthCheck();

if (!health.healthy) {
    console.log('Dependency system issues:', health.issues);
}

const status = await healthChecker.getSystemStatus();
console.log('System status:', status);
```

## Advanced Topics

### Hot Reloading

Support for runtime skill updates:

```typescript
// Enable hot reloading
const manager = createDependencySystemManager({
    enableHotReloading: true
});

// Skills can be updated at runtime
resolver.registerSkill(new UpdatedSkill());
```

### Distributed Dependencies

For complex setups with remote skills:

```typescript
// Custom skill provider for remote skills
class RemoteSkillProvider implements ISkillProvider {
    readonly name = 'remote';
    
    async getSkill(name: string): Promise<ISkill | undefined> {
        // Fetch skill from remote service
        return await this.fetchRemoteSkill(name);
    }
}

resolver.registerProvider(new RemoteSkillProvider());
```

### Custom Execution Patterns

Advanced execution patterns for composite skills:

```typescript
export class AdvancedCompositeSkill extends CompositeSkill {
    protected createExecutionSteps(params: any): Omit<ExecutionStep, 'id'>[] {
        return [
            {
                skillName: 'step1',
                description: 'First step',
                params: {},
                estimatedTime: 1000,
                optional: false
            },
            {
                skillName: 'step2',
                description: 'Second step',
                params: {},
                estimatedTime: 2000,
                optional: false,
                dependsOn: ['step1'] // Wait for step1
            }
        ];
    }
    
    // Custom rollback logic
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        // Implement step-specific rollback
    }
}
```

## API Reference

See the exported interfaces and classes in `dependency-system.ts` for the complete API reference.

## Version History

- **1.0.0**: Initial release with core dependency injection features
- Features planned for future releases:
  - Distributed dependency resolution
  - Advanced hot-reloading
  - Visual dependency editor
  - Performance optimization suggestions
  - Dependency conflict resolution

## Contributing

When contributing to the dependency system:

1. Add comprehensive tests for new features
2. Update documentation for API changes
3. Ensure backward compatibility
4. Add validation rules for new constraints
5. Consider performance implications
6. Update examples and usage guides

The dependency system is designed to be extensible and maintainable, supporting the complex skill orchestration needs of the Minecraft MCP server.