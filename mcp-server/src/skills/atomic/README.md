# Atomic Skills

Atomic skills are the fundamental building blocks of the Minecraft MCP skill system. Each atomic skill performs a single, well-defined operation and follows the single responsibility principle.

## Overview

Atomic skills are organized into categories based on their functionality:

- **Movement**: Navigation and positioning (`movement/`)
- **Interaction**: Block and world interaction (`interaction/`)
- **Inventory**: Item and inventory management (`inventory/`)
- **Combat**: Fighting and combat mechanics (`combat/`)
- **Communication**: Chat and messaging (`communication/`)

## Architecture

All atomic skills extend the `AtomicSkill` base class, which provides:

- Parameter validation with JSON schema
- Resource requirement checking  
- Execution time estimation
- Error handling and recovery
- Dependency injection support
- Cancellation support

## Available Atomic Skills

### Movement Skills

#### `MoveToPosition`
Moves the bot to a specific x,y,z coordinate using pathfinding.

```typescript
import { MoveToPosition } from './atomic/movement/MoveToPosition.js';

const moveSkill = new MoveToPosition();
const result = await moveSkill.execute(context, {
  x: 100,
  y: 64,
  z: 200,
  range: 1,
  timeout: 30000
});
```

### Interaction Skills

#### `BreakBlock`
Breaks a single block at the specified coordinates.

```typescript
import { BreakBlock } from './atomic/interaction/BreakBlock.js';

const breakSkill = new BreakBlock();
const result = await breakSkill.execute(context, {
  x: 100,
  y: 64,
  z: 200,
  collect: true,
  timeout: 10000
});
```

#### `PlaceBlock`
Places a single block at the specified coordinates.

```typescript
import { PlaceBlock } from './atomic/interaction/PlaceBlock.js';

const placeSkill = new PlaceBlock();
const result = await placeSkill.execute(context, {
  blockName: 'stone',
  x: 100,
  y: 64,
  z: 200,
  giveItem: false
});
```

### Inventory Skills

#### `PickupItem`
Picks up a specific item from the ground nearby.

```typescript
import { PickupItem } from './atomic/inventory/PickupItem.js';

const pickupSkill = new PickupItem();
const result = await pickupSkill.execute(context, {
  itemName: 'apple',
  maxDistance: 32,
  timeout: 10000
});
```

#### `EquipItem`
Equips an item from inventory to the appropriate slot.

```typescript
import { EquipItem } from './atomic/inventory/EquipItem.js';

const equipSkill = new EquipItem();
const result = await equipSkill.execute(context, {
  itemName: 'iron_sword',
  destination: 'hand' // or 'auto'
});
```

### Combat Skills

#### `AttackEntity`
Attacks a specific entity (player, mob, or animal).

```typescript
import { AttackEntity } from './atomic/combat/AttackEntity.js';

const attackSkill = new AttackEntity();
const result = await attackSkill.execute(context, {
  targetType: 'hostile',
  targetName: 'Zombie',
  maxDistance: 16,
  timeout: 5000
});
```

### Communication Skills

#### `SendMessage`
Sends a chat message, command, or private message.

```typescript
import { SendMessage } from './atomic/communication/SendMessage.js';

const chatSkill = new SendMessage();
const result = await chatSkill.execute(context, {
  message: 'Hello, world!',
  delay: 0,
  recipient: 'PlayerName' // optional
});
```

## Creating New Atomic Skills

To create a new atomic skill:

1. **Extend AtomicSkill**: Your class should extend the `AtomicSkill` base class
2. **Define Schema**: Provide a JSON schema for parameter validation
3. **Implement Execute**: Implement the `executeSkill` method
4. **Add Metadata**: Set name, description, version, and category
5. **Use Dependency Injection**: Mark with `@injectable()` decorator

### Example Template

```typescript
import { injectable } from 'tsyringe';
import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult } from '../../SkillResult.js';

export interface IMySkillParams {
  param1: string;
  param2?: number;
}

@injectable()
export class MyAtomicSkill extends AtomicSkill {
  readonly name = 'MyAtomicSkill';
  readonly description = 'Brief description of what this skill does';
  readonly version = '1.0.0';
  readonly category = 'appropriate_category';
  
  readonly parameterSchema = {
    type: 'object',
    required: ['param1'],
    properties: {
      param1: {
        type: 'string',
        description: 'Description of param1'
      },
      param2: {
        type: 'number',
        description: 'Description of param2',
        default: 42
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { param1, param2 = 42 } = params as IMySkillParams;

    try {
      // Your implementation here
      
      return SkillResult.success('Operation completed successfully');
    } catch (error) {
      return SkillResult.failure(`Operation failed: ${error}`);
    }
  }

  getResourceRequirements(params: Record<string, any>) {
    return {
      items: ['required_item'],
      tools: ['required_tool'],
      permissions: ['required_permission']
    };
  }

  estimateExecutionTime(params: Record<string, any>): number {
    return 5000; // 5 seconds
  }
}
```

## Integration with Composite Skills

Atomic skills are designed to be composed together to create more complex behaviors. Use the dependency injection system to resolve and execute atomic skills within composite skills:

```typescript
import { CompositeSkill } from '../CompositeSkill.js';
import { skillDependency } from '../decorators/skillDependency.js';
import { MoveToPosition } from '../atomic/movement/MoveToPosition.js';
import { BreakBlock } from '../atomic/interaction/BreakBlock.js';

@injectable()
export class MineBlockSkill extends CompositeSkill {
  @skillDependency(MoveToPosition)
  private moveToPosition: MoveToPosition;

  @skillDependency(BreakBlock)
  private breakBlock: BreakBlock;

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    // Move to the block
    const moveResult = await this.moveToPosition.execute(context, {
      x: params.x,
      y: params.y,
      z: params.z,
      range: 3
    });

    if (!moveResult.success) {
      return moveResult;
    }

    // Break the block
    return await this.breakBlock.execute(context, {
      x: params.x,
      y: params.y,
      z: params.z,
      collect: true
    });
  }
}
```

## Best Practices

1. **Single Responsibility**: Each atomic skill should do exactly one thing
2. **Parameter Validation**: Use comprehensive JSON schemas for validation
3. **Error Handling**: Provide clear, actionable error messages
4. **Resource Declaration**: Declare required resources, tools, and permissions
5. **Time Estimation**: Provide realistic execution time estimates
6. **Logging**: Use the built-in logging methods for debugging
7. **Cancellation**: Support cancellation where appropriate
8. **Documentation**: Provide clear parameter descriptions and examples

## Testing Atomic Skills

Atomic skills can be tested individually or as part of composite skills. Use the MCP inspector or unit tests to verify functionality:

```bash
# Test with MCP inspector
npx @modelcontextprotocol/inspector node dist/mcp-server.js

# Run unit tests (when available)
npm test
```