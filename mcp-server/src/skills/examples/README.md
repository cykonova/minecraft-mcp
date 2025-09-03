# Skill Base Classes Examples

This directory contains example implementations demonstrating the enhanced skill base classes introduced in REFACTOR-010.

## Overview

The skill base classes provide a consistent foundation for implementing Minecraft bot skills with:

- **Advanced parameter validation** with JSON Schema and custom patterns
- **Lifecycle hooks** for before/after execution and error handling
- **Resource requirement checking** for tools, items, permissions
- **Execution time estimation** with dynamic adjustment
- **Enhanced error handling** and recovery strategies
- **Logging integration** with contextual information
- **Metrics collection** for monitoring and debugging

## Example Skills

### ExampleAtomicSkill

An atomic skill that demonstrates chat functionality with enhanced features:

```typescript
import { ExampleAtomicSkill } from './examples/ExampleAtomicSkill.js';

const skill = new ExampleAtomicSkill();

// Execute with context
const context = SkillContextFactory.create(bot, {
    message: "Hello world!",
    count: 3,
    delay: 1000
}, serviceParams, metadata);

const result = await skill.execute(context);
```

**Features demonstrated:**
- JSON Schema parameter validation
- Custom validation patterns for chat messages
- Resource requirement specification
- Dynamic execution time estimation
- Lifecycle hooks for setup and cleanup
- Enhanced error handling with context

### ExampleCompositeSkill

A composite skill that orchestrates multiple atomic skills:

```typescript
import { ExampleCompositeSkill } from './examples/ExampleCompositeSkill.js';

const skill = new ExampleCompositeSkill();

// Execute with dependencies
const dependencies = {
    'exampleAtomic': atomicSkillInstance,
    'lookAround': lookAroundSkillInstance,
    'sendChat': sendChatSkillInstance,
};

const result = await skill.execute(context, dependencies);
```

**Features demonstrated:**
- Multi-step execution planning
- Dependency injection and validation
- Partial failure recovery strategies
- Progress tracking and monitoring
- Rollback capabilities
- Execution optimization

## Key Benefits

### 1. Consistent Interface
All skills implement the same base interface with standardized:
- Parameter validation
- Error handling
- Result formatting
- Logging patterns

### 2. Enhanced Reliability
- Comprehensive input validation prevents runtime errors
- Resource checking ensures prerequisites are met
- Lifecycle hooks enable proper setup and cleanup
- Robust error handling with recovery strategies

### 3. Better Observability
- Structured logging with contextual information
- Execution metrics for performance monitoring
- Progress tracking for long-running operations
- Detailed error reporting with codes and context

### 4. Developer Experience
- Type-safe interfaces with full TypeScript support
- Comprehensive documentation and examples
- Consistent patterns across all skill implementations
- Easy testing with dependency injection

## Usage Patterns

### Creating a New Atomic Skill

```typescript
import { AtomicSkill } from '../AtomicSkill.js';
import { ISkillContext, SkillResult } from '../index.js';

export class MyAtomicSkill extends AtomicSkill {
    readonly name = 'mySkill';
    readonly description = 'My custom skill';
    readonly edition = 'java';
    readonly category = 'verified';
    
    readonly inputSchema = {
        type: 'object',
        properties: {
            param1: { type: 'string' },
            param2: { type: 'number' },
        },
        required: ['param1'],
    };

    protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
        // Implementation here
        return this.createSuccessResult(data, message);
    }
}
```

### Creating a New Composite Skill

```typescript
import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext, SkillResult, SkillDependencyMap, ExecutionStep } from '../index.js';

export class MyCompositeSkill extends CompositeSkill {
    readonly name = 'myCompositeSkill';
    readonly description = 'My composite skill';
    readonly edition = 'java';
    readonly category = 'verified';
    readonly skillDependencies = ['dependency1', 'dependency2'];
    
    readonly inputSchema = {
        type: 'object',
        properties: {
            // Schema definition
        },
        required: [],
    };

    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        return [
            {
                skillName: 'dependency1',
                description: 'First step',
                params: { /* parameters */ },
                estimatedTime: 5000,
                optional: false,
            },
            // More steps...
        ];
    }

    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        return this.executeCompositeSkill(context, dependencies);
    }
}
```

## Migration from Legacy Skills

Existing skills can be migrated to use the new base classes:

1. **Extend the appropriate base class** (AtomicSkill or CompositeSkill)
2. **Implement required abstract methods** (name, description, inputSchema, executeSkill)
3. **Add parameter validation** using the inputSchema and custom validation
4. **Specify resource requirements** if needed
5. **Implement lifecycle hooks** for setup/cleanup
6. **Add proper error handling** with meaningful error codes

The base classes maintain backward compatibility with the existing skill system while providing enhanced capabilities for new implementations.