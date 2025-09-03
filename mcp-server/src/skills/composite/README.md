# Composite Skills - REFACTOR-014

This directory contains the composite skills implementation that combines atomic skills into complex behaviors using dependency injection and advanced orchestration.

## Overview

Composite skills are complex behaviors built from atomic skills. They provide:

- **Dependency Injection**: Automatic injection of atomic skill dependencies using decorators
- **Execution Planning**: Multi-step execution with progress tracking  
- **Error Recovery**: Partial failure handling and rollback capabilities
- **State Management**: Complex state tracking during long-running operations
- **Orchestration**: Intelligent coordination of multiple skills

## Implemented Composite Skills

### 1. FollowPlayer (`followPlayer`)
**Purpose**: Follows a specified player around, maintaining a safe distance

**Features**:
- Continuous player tracking
- Maintains optimal distance (1-10 blocks)
- Responds to chat stop commands
- Handles pathfinding obstacles
- Automatic failure recovery

**Dependencies**: `goToSomeone`, `lookAround`, `readChat`

**Example Usage**:
```typescript
const result = await followSkill.execute(context, {
    playerName: 'Steve',
    distance: 3,
    duration: 300,  // 5 minutes
    stopOnCommand: true
});
```

### 2. GuardPlayer (`guardPlayer`)  
**Purpose**: Guards a specified player by fighting off hostile entities

**Features**:
- Stays close to protected player
- Continuous threat scanning (8-16 block radius)
- Engages hostile mobs automatically
- Alerts player of threats via chat
- Tactical positioning for defense

**Dependencies**: `goToSomeone`, `lookAround`, `attackSomeone`, `readChat`

**Example Usage**:
```typescript
const result = await guardSkill.execute(context, {
    playerName: 'Steve',
    duration: 600,     // 10 minutes
    guardDistance: 4,
    threatRadius: 10,
    alertPlayer: true
});
```

### 3. MineOreVein (`mineOreVein`)
**Purpose**: Mines entire ore veins by finding and extracting all connected ore blocks

**Features**:
- Analyzes ore vein structure
- Systematic or opportunistic mining patterns
- Avoids dangerous positions (lava, unstable areas)
- Progress tracking and efficiency metrics
- Inventory checking after completion

**Dependencies**: `mineResource`, `lookAround`, `goToKnownLocation`, `openInventory`

**Example Usage**:
```typescript
const result = await mineSkill.execute(context, {
    oreType: 'diamond_ore',
    maxBlocks: 32,
    systematic: true,
    avoidLava: true,
    checkInventory: true
});
```

### 4. BuildStructure (`buildStructure`)
**Purpose**: Builds complex structures from blueprints using systematic planning

**Features**:
- Blueprint loading (predefined or custom)
- Material requirement checking
- Phase-based construction planning
- Systematic block placement ordering
- Build progress tracking and efficiency metrics

**Dependencies**: `buildSomething`, `goToKnownLocation`, `openInventory`, `placeItemNearYou`

**Example Usage**:
```typescript
const result = await buildSkill.execute(context, {
    blueprintName: 'simple_house',
    startX: 100, startY: 64, startZ: 200,
    checkMaterials: true,
    systematic: true,
    allowPartialBuild: false
});
```

## Architecture

### Dependency Injection System

Uses `@skillDependency` decorator for declarative dependency management:

```typescript
@skillDependency({ 
    name: 'goToSomeone', 
    edition: 'java',
    category: 'verified'
})
private goToSomeone!: ISkill;
```

Features:
- **Type Safety**: Full TypeScript support with proper typing
- **Validation**: Edition, category, and version compatibility checking
- **Optional Dependencies**: Support for optional dependencies
- **Lazy Loading**: Factory pattern for delayed initialization
- **Auto-resolution**: Automatic dependency array population

### Execution Planning

Each composite skill creates detailed execution plans:

```typescript
interface ExecutionPlan {
    steps: ExecutionStep[];
    estimatedTotalTime: number;
    canRollback: boolean;
}

interface ExecutionStep {
    id: string;
    skillName: string;
    params: Record<string, any>;
    description: string;
    estimatedTime: number;
    optional: boolean;
    dependsOn?: string[];
}
```

### Progress Tracking

Real-time execution progress monitoring:

```typescript
interface ExecutionProgress {
    currentStep: number;
    totalSteps: number;
    completedSteps: string[];
    failedSteps: string[];
    estimatedTimeRemaining: number;
}
```

### Error Handling & Recovery

Sophisticated error handling with multiple recovery strategies:

- **Partial Failure Recovery**: Continue execution when non-critical steps fail
- **Rollback Capabilities**: Undo changes when complete failure occurs  
- **Retry Logic**: Automatic retries for recoverable errors
- **State Preservation**: Maintain execution state across failures

## Usage Patterns

### Basic Execution

```typescript
import { FollowPlayerSkill } from './composite/index.js';
import { injectSkillDependencies } from './decorators/skillDependency.js';

// Create skill instance
const followSkill = new FollowPlayerSkill();

// Get dependencies from provider
const dependencies = await skillsProvider.getSkillDependencies([
    'goToSomeone', 'lookAround', 'readChat'
]);

// Inject dependencies
injectSkillDependencies(followSkill, dependencies);

// Execute skill
const result = await followSkill.execute(context, dependencies);
```

### With TSyringe Container

```typescript
import { container } from 'tsyringe';
import { registerCompositeSkills } from './composite/index.js';

// Register all composite skills
registerCompositeSkills();

// Resolve skill from container
const followSkill = container.resolve(FollowPlayerSkill);

// Execute with dependency injection handled automatically
const result = await followSkill.execute(context, dependencies);
```

### Complex Workflow Example

```typescript
// Start guarding in background
const guardPromise = guardSkill.execute(guardContext, guardDependencies);

// Execute building task
const buildResult = await buildSkill.execute(buildContext, buildDependencies);

// Wait for guard completion
const guardResult = await guardPromise;

// Both tasks completed with protection provided during building
```

## State Management

Each composite skill maintains sophisticated internal state:

```typescript
// FollowPlayerSkill state
private followingActive = false;
private targetPlayer = '';
private followDistance = 3;
private lastPlayerPosition: { x: number, y: number, z: number } | null = null;

// GuardPlayerSkill state  
private guardingActive = false;
private protectedPlayer = '';
private activeThreats: Set<string> = new Set();
private lastThreatScan = 0;

// MineOreVeinSkill state
private currentVein: OreVeinInfo | null = null;
private minedPositions: Set<string> = new Set();
private totalMinedBlocks = 0;

// BuildStructureSkill state
private currentBlueprint: Blueprint | null = null;
private buildProgress: BuildProgress | null = null;
private buildStartPosition: { x: number, y: number, z: number } | null = null;
```

## Testing & Validation

Run the validation tests:

```bash
# Build the project
npm run build

# Run basic validation
node -e "require('reflect-metadata'); require('./dist/skills/composite/test.js').runAllTests();"
```

## Extension Guide

### Creating New Composite Skills

1. **Extend CompositeSkill base class**:
```typescript
export class MyCompositeSkill extends CompositeSkill {
    readonly name = 'myCompositeSkill';
    readonly description = 'My custom composite skill';
    readonly category = 'composite' as const;
    readonly edition = 'java' as const;
    
    readonly skillDependencies = ['dependency1', 'dependency2'];
    readonly inputSchema = { /* schema definition */ };
}
```

2. **Add dependency injection**:
```typescript
@skillDependency({ name: 'dependency1', edition: 'java' })
private dep1!: ISkill;
```

3. **Implement execution steps**:
```typescript
protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    return [
        {
            skillName: 'dependency1',
            params: { /* params */ },
            description: 'Step description',
            estimatedTime: 5000,
            optional: false
        }
    ];
}
```

4. **Implement main execution logic**:
```typescript
async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    // Inject dependencies
    Object.assign(this, dependencies);
    
    // Your execution logic here
    return this.executeCompositeSkill(context, dependencies);
}
```

### Best Practices

1. **State Management**: Use private properties for execution state
2. **Error Handling**: Override `handlePartialFailure` for custom recovery logic
3. **Progress Tracking**: Update progress during long-running operations
4. **Rollback Support**: Implement `rollbackStep` for critical operations
5. **Resource Cleanup**: Use try/finally blocks to clean up state

## Integration

The composite skills are automatically exported from the main skills index:

```typescript
// Available in main skills export
import { FollowPlayerSkill, GuardPlayerSkill } from '../skills/index.js';

// Or import directly from composite module
import { FollowPlayerSkill, GuardPlayerSkill } from '../skills/composite/index.js';
```

## Conclusion

The composite skills system provides a powerful framework for creating complex Minecraft bot behaviors through:

- **Declarative Dependencies**: Clean separation of concerns with dependency injection
- **Robust Orchestration**: Advanced execution planning and coordination
- **Failure Resilience**: Comprehensive error handling and recovery
- **State Management**: Sophisticated state tracking for complex operations
- **User Requirements**: Direct implementation of requested behaviors (follow, guard, mine, build)

This implementation fulfills all requirements of REFACTOR-014 and provides a solid foundation for building even more complex composite behaviors in the future.