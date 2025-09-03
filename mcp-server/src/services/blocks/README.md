# Block Interaction Service

The BlockInteractionService is a comprehensive service that handles all block-related operations in Minecraft, supporting both Java and Bedrock editions.

## Features

- **Block Properties**: Query block properties like hardness, material, transparency, etc.
- **Block Validation**: Validate if block operations are possible before execution
- **Block Interaction**: Break, place, and activate blocks with edition-specific logic
- **Block Search**: Find blocks by type, distance, and other criteria
- **Safety Checks**: Identify safe positions and prevent unsafe operations
- **Tool Optimization**: Find the best tool for breaking specific blocks

## Usage

### Basic Setup

```typescript
import { container } from 'tsyringe';
import { TOKENS } from '../../config/tokens.js';
import { IBlockInteractionService } from './IBlockInteractionService.js';

// Get the service from the DI container
const blockService = container.resolve<IBlockInteractionService>(TOKENS.BlockInteractionService);
```

### Block Properties

```typescript
// Get block properties
const stoneBlock = blockService.getBlockByName('stone');
console.log(`Stone hardness: ${stoneBlock?.hardness}`);

// Check block characteristics
const blockId = 1; // stone
console.log(`Is solid: ${blockService.isSolid(blockId)}`);
console.log(`Is safe: ${blockService.isSafe(blockId)}`);
console.log(`Can stand on: ${blockService.canStandOn(blockId)}`);
```

### Block Interactions

```typescript
import { Vec3 } from 'vec3';

// Break a block
const position = new Vec3(10, 64, 10);
try {
  await blockService.breakBlock(bot, position);
  console.log('Block broken successfully');
} catch (error) {
  console.error('Failed to break block:', error.message);
}

// Place a block
const placePosition = new Vec3(10, 65, 10);
try {
  await blockService.placeBlock(bot, placePosition, 'stone');
  console.log('Block placed successfully');
} catch (error) {
  console.error('Failed to place block:', error.message);
}

// Activate a block (open chest, door, etc.)
const chestPosition = new Vec3(5, 64, 5);
try {
  await blockService.activateBlock(bot, chestPosition);
  console.log('Block activated successfully');
} catch (error) {
  console.error('Failed to activate block:', error.message);
}
```

### Block Validation

```typescript
// Validate operations before executing
const validation = blockService.validateBlockOperation(bot, position, 'break');
if (!validation.isValid) {
  console.log(`Cannot break block: ${validation.reason}`);
} else if (!validation.isReachable) {
  console.log('Block is not reachable');
} else {
  // Safe to proceed with breaking
  await blockService.breakBlock(bot, position);
}
```

### Block Search and Utilities

```typescript
// Find nearest block of a specific type
const nearestDiamond = blockService.findNearestBlock(bot, 'diamond_ore', {
  maxDistance: 50,
  onlyReachable: true
});

if (nearestDiamond) {
  console.log(`Found diamond ore at: ${nearestDiamond}`);
}

// Find all blocks of a type in range
const coalBlocks = blockService.findBlocksInRange(bot, 'coal_ore', {
  maxDistance: 20
});
console.log(`Found ${coalBlocks.length} coal ore blocks nearby`);

// Check if position is safe
const safePosition = blockService.isSafePosition(bot, new Vec3(0, 65, 0));
console.log(`Position is safe: ${safePosition}`);

// Find a safe position near target
const targetPos = new Vec3(100, 64, 100);
const safePos = blockService.findSafePosition(bot, targetPos, 5);
if (safePos) {
  console.log(`Found safe position: ${safePos}`);
}
```

### Tool Selection

```typescript
// Get the best tool for a block
const bestTool = blockService.getBestTool(bot, 'stone');
if (bestTool) {
  console.log(`Best tool for stone: ${bestTool.name}`);
  
  // Calculate break time with the tool
  const breakTime = blockService.calculateBreakTime(bot, position, bestTool);
  console.log(`Will take ${breakTime}ms to break`);
}
```

### Advanced Usage

```typescript
// Find placement face for a block
const placementInfo = blockService.findPlacementFace(bot, new Vec3(0, 65, 0));
if (placementInfo) {
  await blockService.placeBlock(bot, new Vec3(0, 65, 0), 'stone', {
    referenceBlock: placementInfo.referenceBlock,
    face: placementInfo.face
  });
}

// Get adjacent positions
const adjacent = blockService.getAdjacentPositions(new Vec3(0, 64, 0), true);
console.log(`Found ${adjacent.length} adjacent positions`);
```

## Edition Support

The service automatically detects the bot edition and uses the appropriate methods:

- **Java Edition**: Uses Mineflayer's `dig()`, `placeBlock()`, and `activateBlock()` methods
- **Bedrock Edition**: Uses custom protocol methods via `BedrockBotWrapper`

## Error Handling

All methods include comprehensive error handling:

```typescript
try {
  await blockService.breakBlock(bot, position);
} catch (error) {
  if (error.message.includes('not reachable')) {
    // Handle reachability issues
  } else if (error.message.includes('Cannot break bedrock')) {
    // Handle unbreakable blocks
  } else {
    // Handle other errors
  }
}
```

## Integration with Skills

Use the service in your skills for consistent block handling:

```typescript
import { container } from 'tsyringe';
import { TOKENS } from '../../config/tokens.js';
import { IBlockInteractionService } from '../services/blocks/IBlockInteractionService.js';

export const myBlockSkill = async (bot: UnifiedBot, params: any): Promise<any> => {
  const blockService = container.resolve<IBlockInteractionService>(TOKENS.BlockInteractionService);
  
  const position = new Vec3(params.x, params.y, params.z);
  
  // Validate first
  const validation = blockService.validateBlockOperation(bot, position, 'break');
  if (!validation.isValid) {
    return { success: false, message: validation.reason };
  }
  
  // Execute the operation
  try {
    await blockService.breakBlock(bot, position);
    return { success: true, message: 'Block broken successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};
```

## Testing

Run the comprehensive test suite:

```bash
npm test -- --testPathPattern=BlockInteractionService.test.ts
```

The tests cover:
- Block property queries
- Java and Bedrock edition interactions
- Validation logic
- Error handling
- Utility functions