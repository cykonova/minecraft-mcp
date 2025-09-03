# InventoryService

A comprehensive inventory management service for Minecraft bots that supports both Java and Bedrock editions using the Strategy pattern.

## Overview

The InventoryService provides a unified interface for managing bot inventories across different Minecraft editions. It abstracts inventory operations that were previously spread across bot wrappers and skills, providing:

- **Unified Interface**: Single API for both Java and Bedrock editions
- **Strategy Pattern**: Edition-specific implementations for optimal performance
- **Dependency Injection**: Injectable service using TSyringe
- **Comprehensive Operations**: Find, move, equip, drop, optimize inventory items
- **Type Safety**: Full TypeScript support with detailed interfaces

## Architecture

```
InventoryService (main service)
├── IInventoryService (interface)
├── JavaInventoryStrategy (Java Edition implementation)
└── BedrockInventoryStrategy (Bedrock Edition implementation)
```

## Usage

### Basic Usage

```typescript
import { container } from 'tsyringe';
import { InventoryService } from './services/inventory/InventoryService.js';
import { UnifiedBot } from './bots/UnifiedBot.js';

// Get the service from the DI container
const inventoryService = container.resolve(InventoryService);

// Initialize for a bot
await inventoryService.initialize(bot);

// Get current inventory state
const state = await inventoryService.getInventoryState(bot);
console.log(`Bot has ${state.usedSlots}/${state.totalSlots} slots used`);
```

### Finding Items

```typescript
// Find all diamond items
const diamonds = await inventoryService.findItems(bot, { name: 'diamond' });

// Find first sword item
const sword = await inventoryService.findItem(bot, { 
  name: 'sword',
  exactMatch: false 
});

// Check if bot has enough food
const hasFood = await inventoryService.hasItem(bot, 'bread', 5);

// Get total count of a specific item
const coalCount = await inventoryService.getItemCount(bot, 'coal');
```

### Equipment Management

```typescript
// Equip a diamond sword
const equipResult = await inventoryService.equipItem(bot, 'diamond_sword');
if (equipResult.success) {
  console.log('Successfully equipped diamond sword');
}

// Equip armor to specific slots
await inventoryService.equipItem(bot, 'diamond_helmet', 'head');
await inventoryService.equipItem(bot, 'iron_chestplate', 'torso');

// Get currently equipped items
const equipped = await inventoryService.getEquippedItems(bot);
console.log('Main hand:', equipped.hand?.name);

// Unequip helmet
await inventoryService.unequipItem(bot, 'head');
```

### Item Management

```typescript
// Drop specific items
await inventoryService.dropItem(bot, { name: 'dirt', count: 32 });

// Drop all items of a type
await inventoryService.dropAllItems(bot, 'cobblestone');

// Move item between slots
await inventoryService.moveItem(bot, {
  fromSlot: 15,
  toSlot: 0, // Move to hotbar slot 0
  count: 1
});

// Pick up nearby items
await inventoryService.pickupNearbyItems(bot, ['diamond', 'emerald'], 5);
```

### Inventory Optimization

```typescript
// Consolidate item stacks
const consolidateResult = await inventoryService.consolidateStacks(bot);

// Sort inventory alphabetically
await inventoryService.sortInventory(bot, { sortByName: true });

// Full optimization with custom options
await inventoryService.optimizeInventory(bot, {
  consolidateStacks: true,
  sortByType: true,
  moveToHotbar: ['diamond_pickaxe', 'diamond_sword', 'bread'],
  keepInInventory: ['diamond', 'emerald']
});
```

### Inventory Planning

```typescript
// Check what items are missing for a recipe
const requiredItems = {
  'iron_ingot': 3,
  'stick': 2
};
const missingItems = await inventoryService.getMissingItems(bot, requiredItems);

// Check if inventory can fit new items
const newItems = { 'diamond_ore': 64, 'gold_ore': 32 };
const canFit = await inventoryService.canAccommodateItems(bot, newItems);
```

### Hotbar Management

```typescript
// Get hotbar items
const hotbarItems = await inventoryService.getHotbarItems(bot);

// Set active hotbar slot
await inventoryService.setHotbarSlot(bot, 0);

// Get current active slot
const activeSlot = await inventoryService.getActiveHotbarSlot(bot);
```

## Integration with Skills

The InventoryService can be easily integrated into existing skills:

```typescript
import { injectable, inject } from 'tsyringe';
import { InventoryService } from '../services/inventory/InventoryService.js';

@injectable()
export class MySkill {
  constructor(
    @inject('InventoryService') private inventoryService: InventoryService
  ) {}

  async execute(bot: UnifiedBot, params: any) {
    // Use inventory service in skill
    const hasPickaxe = await this.inventoryService.hasItem(bot, 'pickaxe');
    
    if (!hasPickaxe) {
      return { success: false, message: 'Need a pickaxe to mine' };
    }

    await this.inventoryService.equipItem(bot, 'pickaxe');
    // ... rest of skill logic
  }
}
```

## Error Handling

All operations return `InventoryOperationResult` objects with success status and descriptive messages:

```typescript
const result = await inventoryService.equipItem(bot, 'invalid_item');
if (!result.success) {
  console.error('Equipment failed:', result.message);
  if (result.error) {
    console.error('Underlying error:', result.error);
  }
}
```

## Strategy Pattern Details

The service automatically selects the appropriate strategy based on the bot's edition:

- **JavaInventoryStrategy**: Uses Mineflayer APIs for Java Edition bots
- **BedrockInventoryStrategy**: Uses bedrock-protocol APIs for Bedrock Edition bots

Each strategy implements the same interface but provides edition-specific optimizations and packet handling.

## Performance Considerations

- **Caching**: Bedrock strategy includes inventory state caching
- **Batch Operations**: Multiple operations are optimized to reduce API calls  
- **Lazy Loading**: Strategies are only initialized when first used
- **Memory Management**: Proper cleanup when bots disconnect

## Future Enhancements

- **Recipe Integration**: Automatic crafting support
- **Advanced Sorting**: Custom sorting algorithms
- **Inventory Profiles**: Save/load inventory configurations
- **Cross-Bot Trading**: Transfer items between bots
- **Smart Stacking**: Intelligent stack management based on usage patterns