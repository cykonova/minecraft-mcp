# Skill Interface Documentation

This document describes the redesigned skill interface hierarchy that provides a consistent, type-safe, and dependency-injection-ready system for Minecraft MCP skills.

## Overview

The skill system has been redesigned with the following goals:
- **Unified interfaces**: Merge the confusing `ISkill` and `SkillDefinition` interfaces
- **Clear hierarchy**: Distinguish between atomic and composite skills
- **Consistent parameters**: Standardize how skills receive and handle parameters
- **Dependency injection**: Support for composite skills that depend on other skills
- **Type safety**: Strong typing for parameters, results, and contexts
- **Backward compatibility**: Maintain compatibility with existing skills

## Core Interfaces

### ISkill (Base Interface)

The unified base interface that merges the previous `ISkill` and `SkillDefinition` interfaces:

```typescript
interface ISkill {
  name: string;                    // Unique skill identifier
  description: string;             // Human-readable description
  edition: 'java' | 'bedrock' | 'universal';  // Minecraft edition compatibility
  category: 'verified' | 'library';           // Skill category
  type?: 'atomic' | 'composite';   // Skill type for new hierarchy
  version?: string;                // Semantic version (e.g., "1.2.0")
  dependencies?: string[];         // Other skills this depends on
  inputSchema: object;            // JSON Schema for parameter validation
  execute(botOrContext: AnyBot | ISkillContext, args?: any, serviceParams?: any): Promise<SkillResult | any>;
}
```

### IAtomicSkill (Single-Purpose Skills)

Atomic skills perform one specific task and don't depend on other skills:

```typescript
interface IAtomicSkill extends ISkill {
  readonly type: 'atomic';
  execute(context: ISkillContext): Promise<SkillResult>;
  
  // Optional methods for enhanced functionality
  validateParams?(params: Record<string, any>): string[] | undefined;
  estimateExecutionTime?(params: Record<string, any>): number;
  isCancellable?(): boolean;
  getResourceRequirements?(params: Record<string, any>): ResourceRequirements;
}
```

**Examples**: `mineResource`, `craftItems`, `goToLocation`, `sendChat`

### ICompositeSkill (Multi-Step Skills)

Composite skills orchestrate multiple other skills to achieve complex tasks:

```typescript
interface ICompositeSkill extends ISkill {
  readonly type: 'composite';
  readonly skillDependencies: string[];  // Skills this composite depends on
  
  execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult>;
  
  // Optional methods for advanced orchestration
  planExecution?(params: Record<string, any>): ExecutionPlan;
  validateDependencies?(dependencies: SkillDependencyMap): string[] | undefined;
  handlePartialFailure?(step: ExecutionStep, error: SkillResult, context: ISkillContext): Promise<boolean>;
  getProgress?(): ExecutionProgress;
}
```

**Examples**: `buildHouse`, `farmWheat`, `tradeMission`

## Supporting Types

### ISkillContext

Standardized execution context that replaces the (bot, params, serviceParams) parameter pattern:

```typescript
interface ISkillContext {
  bot: AnyBot;                    // Bot instance (Java/Bedrock/Universal)
  params: Record<string, any>;    // Skill-specific parameters
  serviceParams: ISkillServiceParams;  // Service functions (cancel, timeout, etc.)
  metadata: SkillMetadata;        // Skill execution metadata
}
```

### SkillResult

Standardized result type for consistent error handling and success reporting:

```typescript
type SkillResult<T = any> = SkillSuccess<T> | SkillError;

interface SkillSuccess<T> {
  success: true;
  data?: T;
  message?: string;
  observations?: string[];
}

interface SkillError {
  success: false;
  error: string;
  code?: string;
  details?: any;
}
```

## Migration Guide

### For Existing Skills (Legacy)

Existing skills continue to work without changes. The system automatically detects legacy skills and provides compatibility shims.

**Legacy skill signature** (still supported):
```typescript
async function skillName(bot: Bot, params: ISkillParams, serviceParams: ISkillServiceParams): Promise<boolean>
```

### For New Atomic Skills

Use the `BaseAtomicSkill` class or implement `IAtomicSkill`:

```typescript
import { BaseAtomicSkill } from '../IAtomicSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillResult, SkillResults } from '../SkillResult.js';

export class MyAtomicSkill extends BaseAtomicSkill {
  readonly name = 'myAtomicSkill';
  readonly description = 'Does something specific';
  readonly edition = 'java';
  readonly category = 'verified';
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Target to interact with' },
      count: { type: 'number', description: 'Number of items' }
    },
    required: ['target']
  };

  async execute(context: ISkillContext): Promise<SkillResult> {
    try {
      const { target, count = 1 } = context.params;
      
      // Perform the skill logic
      const result = await this.performTask(context.bot, target, count);
      
      return SkillResults.success(result, `Successfully completed task with ${target}`);
    } catch (error) {
      return SkillResults.fromError(error, 'EXECUTION_FAILED');
    }
  }
  
  private async performTask(bot: AnyBot, target: string, count: number): Promise<any> {
    // Implementation
  }
}
```

### For New Composite Skills

Use the `BaseCompositeSkill` class or implement `ICompositeSkill`:

```typescript
import { BaseCompositeSkill } from '../ICompositeSkill.js';
import { ISkillContext, SkillDependencyMap } from '../ICompositeSkill.js';
import { SkillResult, SkillResults } from '../SkillResult.js';

export class BuildHouseSkill extends BaseCompositeSkill {
  readonly name = 'buildHouse';
  readonly description = 'Builds a complete house';
  readonly edition = 'java';
  readonly category = 'verified';
  readonly skillDependencies = ['mineResource', 'craftItems', 'placeBlocks'];
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      size: { type: 'string', description: 'House size: small, medium, large' },
      location: { type: 'object', description: 'Build location coordinates' }
    },
    required: ['size', 'location']
  };

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    try {
      // Step 1: Gather materials
      const materialsResult = await this.executeDependency(
        'mineResource', 
        { name: 'wood', count: 64 }, 
        context, 
        dependencies
      );
      
      if (!materialsResult.success) {
        return materialsResult;
      }

      // Step 2: Craft building materials
      const craftResult = await this.executeDependency(
        'craftItems', 
        { item: 'wooden_planks', count: 32 }, 
        context, 
        dependencies
      );
      
      if (!craftResult.success) {
        return craftResult;
      }

      // Step 3: Build the structure
      const buildResult = await this.executeDependency(
        'placeBlocks', 
        { blocks: this.generateHouseBlocks(context.params) }, 
        context, 
        dependencies
      );
      
      return buildResult;
    } catch (error) {
      return SkillResults.fromError(error, 'BUILD_HOUSE_FAILED');
    }
  }
  
  private generateHouseBlocks(params: any): any[] {
    // Generate block placement instructions based on house size and location
    return [];
  }
}
```

## Parameter Handling

### Old Pattern (Legacy)
```typescript
async function skill(bot: Bot, params: ISkillParams, serviceParams: ISkillServiceParams) {
  const { target, count } = params;
  // ...
}
```

### New Pattern (Recommended)
```typescript
async execute(context: ISkillContext): Promise<SkillResult> {
  const { target, count = 1 } = context.params;
  const { bot, serviceParams } = context;
  // ...
}
```

## Error Handling

### Old Pattern
```typescript
if (error) {
  bot.emit('alteraBotEndObservation', 'Error occurred');
  return false;
}
```

### New Pattern
```typescript
if (error) {
  context.bot.emit('alteraBotEndObservation', 'Error occurred');
  return SkillResults.error('Error occurred', 'SKILL_ERROR', error);
}
```

## Dependency Injection

The skill system now supports automatic dependency injection for composite skills:

```typescript
// Skills are automatically resolved based on skillDependencies
readonly skillDependencies = ['mineResource', 'craftItems'];

async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
  // dependencies contains resolved skill instances
  const mineSkill = dependencies['mineResource'];
  const craftSkill = dependencies['craftItems'];
  
  // Execute dependencies with proper context
  const result = await this.executeDependency('mineResource', { ... }, context, dependencies);
}
```

## Type Guards and Utilities

The system provides helpful type guards and utilities:

```typescript
import { isContextBasedSkill, isLegacySkill, createSkillDefinition } from '../ISkill.js';

// Check skill type
if (isContextBasedSkill(skill)) {
  // Use new context-based execution
  result = await skill.execute(context);
} else if (isLegacySkill(skill)) {
  // Use legacy execution
  result = await skill.execute(bot, params, serviceParams);
}

// Create skill definitions
const skill = createSkillDefinition(name, description, edition, category, schema, executeFunction);
```

## Best Practices

1. **Use atomic skills for single-purpose tasks** - mining, crafting, movement
2. **Use composite skills for complex workflows** - building, farming, trading
3. **Always return SkillResult from new skills** - provides consistent error handling
4. **Validate parameters using inputSchema** - automatic validation with helpful errors
5. **Use dependency injection for reusable functionality** - don't duplicate logic
6. **Implement proper error handling** - return meaningful error messages and codes
7. **Add progress tracking for long-running composite skills** - better user experience
8. **Use semantic versioning for skill versions** - track compatibility and changes

## Backward Compatibility

The system maintains full backward compatibility:

- **Legacy skills work unchanged** - no migration required
- **Existing parameter patterns supported** - (bot, params, serviceParams) still works
- **Gradual migration path** - skills can be updated one at a time
- **Type safety preserved** - legacy patterns still benefit from TypeScript checking

This design provides a clean path forward while ensuring existing functionality remains intact.