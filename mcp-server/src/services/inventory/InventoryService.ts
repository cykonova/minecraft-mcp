/**
 * Main InventoryService implementation using Strategy pattern
 */

import { injectable, inject, singleton } from 'tsyringe';
import { UnifiedBot } from '../../bots/UnifiedBot.js';
import { 
  IInventoryService,
  InventoryItem,
  InventoryState,
  FindItemOptions,
  MoveItemOptions,
  DropItemOptions,
  EquipmentDestination,
  InventoryOptimizationOptions,
  InventoryOperationResult
} from './IInventoryService.js';
import { IInventoryStrategy } from './strategies/IInventoryStrategy.js';
import { JavaInventoryStrategy } from './strategies/JavaInventoryStrategy.js';
import { BedrockInventoryStrategy } from './strategies/BedrockInventoryStrategy.js';

@injectable()
@singleton()
export class InventoryService implements IInventoryService {
  private strategies = new Map<'java' | 'bedrock', IInventoryStrategy>();
  private initializedBots = new Set<string>();

  constructor(
    @inject('JavaInventoryStrategy') private javaStrategy: JavaInventoryStrategy,
    @inject('BedrockInventoryStrategy') private bedrockStrategy: BedrockInventoryStrategy
  ) {
    this.strategies.set('java', javaStrategy);
    this.strategies.set('bedrock', bedrockStrategy);
  }

  async initialize(bot: UnifiedBot): Promise<void> {
    if (this.initializedBots.has(bot.username)) {
      return;
    }

    const strategy = this.getStrategy(bot);
    await strategy.initialize(bot);
    this.initializedBots.add(bot.username);
  }

  async getInventoryState(bot: UnifiedBot): Promise<InventoryState> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.getInventoryState(bot);
  }

  async findItems(bot: UnifiedBot, options: FindItemOptions): Promise<InventoryItem[]> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.findItems(bot, options);
  }

  async findItem(bot: UnifiedBot, options: FindItemOptions): Promise<InventoryItem | null> {
    const items = await this.findItems(bot, options);
    return items.length > 0 ? items[0] : null;
  }

  async getItemBySlot(bot: UnifiedBot, slot: number): Promise<InventoryItem | null> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.getItemBySlot(bot, slot);
  }

  async getItemCount(bot: UnifiedBot, itemName: string): Promise<number> {
    const items = await this.findItems(bot, { name: itemName });
    return items.reduce((total, item) => total + item.count, 0);
  }

  async hasItem(bot: UnifiedBot, itemName: string, count: number = 1): Promise<boolean> {
    const totalCount = await this.getItemCount(bot, itemName);
    return totalCount >= count;
  }

  async isInventoryFull(bot: UnifiedBot): Promise<boolean> {
    const state = await this.getInventoryState(bot);
    return state.freeSlots === 0;
  }

  async getFreeSlots(bot: UnifiedBot): Promise<number> {
    const state = await this.getInventoryState(bot);
    return state.freeSlots;
  }

  async moveItem(bot: UnifiedBot, options: MoveItemOptions): Promise<InventoryOperationResult> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.moveItem(bot, options);
  }

  async equipItem(bot: UnifiedBot, itemName: string, destination?: EquipmentDestination): Promise<InventoryOperationResult> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.equipItem(bot, itemName, destination);
  }

  async unequipItem(bot: UnifiedBot, destination: EquipmentDestination): Promise<InventoryOperationResult> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.unequipItem(bot, destination);
  }

  async dropItem(bot: UnifiedBot, options: DropItemOptions): Promise<InventoryOperationResult> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.dropItem(bot, options);
  }

  async dropAllItems(bot: UnifiedBot, itemName: string): Promise<InventoryOperationResult> {
    const items = await this.findItems(bot, { name: itemName });
    
    if (items.length === 0) {
      return {
        success: false,
        message: `No ${itemName} found in inventory`
      };
    }

    let totalDropped = 0;
    const results: InventoryOperationResult[] = [];

    for (const item of items) {
      const result = await this.dropItem(bot, { slot: item.slot, count: item.count });
      results.push(result);
      
      if (result.success) {
        totalDropped += item.count;
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return {
      success: successCount > 0,
      message: successCount === items.length 
        ? `Dropped all ${totalDropped} ${itemName}` 
        : `Dropped ${totalDropped} ${itemName} (${successCount}/${items.length} stacks)`,
      affectedSlots: results.flatMap(r => r.affectedSlots || [])
    };
  }

  async pickupNearbyItems(bot: UnifiedBot, itemNames?: string[], radius: number = 3): Promise<InventoryOperationResult> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.pickupNearbyItems(bot, itemNames, radius);
  }

  async consolidateStacks(bot: UnifiedBot): Promise<InventoryOperationResult> {
    const state = await this.getInventoryState(bot);
    const itemGroups = new Map<string, InventoryItem[]>();
    
    // Group items by name
    for (const item of state.items) {
      if (!itemGroups.has(item.name)) {
        itemGroups.set(item.name, []);
      }
      itemGroups.get(item.name)!.push(item);
    }
    
    let consolidatedStacks = 0;
    let totalMoves = 0;
    
    for (const [itemName, items] of itemGroups) {
      if (items.length <= 1) continue;
      
      // Sort by count (ascending) to consolidate into fuller stacks
      items.sort((a, b) => a.count - b.count);
      
      for (let i = 0; i < items.length - 1; i++) {
        const sourceItem = items[i];
        const targetItem = items[i + 1];
        
        // Skip if source is empty or target is full (assuming max stack size of 64)
        if (sourceItem.count === 0 || targetItem.count >= 64) continue;
        
        const availableSpace = 64 - targetItem.count;
        const transferAmount = Math.min(sourceItem.count, availableSpace);
        
        if (transferAmount > 0) {
          const result = await this.moveItem(bot, {
            fromSlot: sourceItem.slot,
            toSlot: targetItem.slot,
            count: transferAmount
          });
          
          if (result.success) {
            sourceItem.count -= transferAmount;
            targetItem.count += transferAmount;
            totalMoves++;
            
            if (sourceItem.count === 0) {
              consolidatedStacks++;
            }
          }
        }
      }
    }
    
    return {
      success: totalMoves > 0,
      message: totalMoves > 0 
        ? `Consolidated ${consolidatedStacks} stacks with ${totalMoves} moves`
        : 'No stacks needed consolidation'
    };
  }

  async sortInventory(bot: UnifiedBot, options: InventoryOptimizationOptions = {}): Promise<InventoryOperationResult> {
    const state = await this.getInventoryState(bot);
    
    // Get non-hotbar items for sorting (slots 9-35)
    const inventoryItems = state.items.filter(item => item.slot >= 9 && item.slot < 36);
    
    if (inventoryItems.length === 0) {
      return {
        success: false,
        message: 'No items to sort in inventory'
      };
    }
    
    // Sort items based on options
    let sortedItems = [...inventoryItems];
    
    if (options.sortByType) {
      sortedItems.sort((a, b) => {
        // Group by item type/category (this is a simplified version)
        const getCategory = (name: string) => {
          if (name.includes('ore') || name.includes('ingot')) return 'materials';
          if (name.includes('sword') || name.includes('axe') || name.includes('pickaxe')) return 'tools';
          if (name.includes('helmet') || name.includes('chestplate') || name.includes('leggings') || name.includes('boots')) return 'armor';
          if (name.includes('food') || name.includes('bread') || name.includes('meat')) return 'food';
          return 'misc';
        };
        
        const categoryA = getCategory(a.name);
        const categoryB = getCategory(b.name);
        
        if (categoryA !== categoryB) {
          return categoryA.localeCompare(categoryB);
        }
        
        return a.name.localeCompare(b.name);
      });
    } else if (options.sortByName) {
      sortedItems.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // Move items to their sorted positions
    let moveCount = 0;
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      const targetSlot = 9 + i; // Start from slot 9 (first inventory slot after hotbar)
      
      if (item.slot !== targetSlot) {
        const result = await this.moveItem(bot, {
          fromSlot: item.slot,
          toSlot: targetSlot,
          swapIfOccupied: true
        });
        
        if (result.success) {
          moveCount++;
        }
      }
    }
    
    return {
      success: moveCount > 0,
      message: moveCount > 0 
        ? `Sorted inventory with ${moveCount} moves`
        : 'Inventory was already sorted'
    };
  }

  async optimizeInventory(bot: UnifiedBot, options: InventoryOptimizationOptions = {}): Promise<InventoryOperationResult> {
    const results: InventoryOperationResult[] = [];
    
    // Step 1: Consolidate stacks
    if (options.consolidateStacks !== false) {
      const consolidateResult = await this.consolidateStacks(bot);
      results.push(consolidateResult);
    }
    
    // Step 2: Sort inventory
    if (options.sortByType || options.sortByName) {
      const sortResult = await this.sortInventory(bot, options);
      results.push(sortResult);
    }
    
    // Step 3: Move priority items to hotbar
    if (options.moveToHotbar && options.moveToHotbar.length > 0) {
      let hotbarMoves = 0;
      
      for (let i = 0; i < Math.min(options.moveToHotbar.length, 9); i++) {
        const itemName = options.moveToHotbar[i];
        const item = await this.findItem(bot, { name: itemName });
        
        if (item && item.slot >= 9) { // Only move if not already in hotbar
          const result = await this.moveItem(bot, {
            fromSlot: item.slot,
            toSlot: i,
            swapIfOccupied: true
          });
          
          if (result.success) {
            hotbarMoves++;
          }
        }
      }
      
      results.push({
        success: hotbarMoves > 0,
        message: `Moved ${hotbarMoves} priority items to hotbar`
      });
    }
    
    const successfulOperations = results.filter(r => r.success);
    const messages = successfulOperations.map(r => r.message).join('; ');
    
    return {
      success: successfulOperations.length > 0,
      message: successfulOperations.length > 0 
        ? `Optimized inventory: ${messages}`
        : 'No optimization needed'
    };
  }

  async getMissingItems(bot: UnifiedBot, requiredItems: Record<string, number>): Promise<Record<string, number>> {
    const missingItems: Record<string, number> = {};
    
    for (const [itemName, requiredCount] of Object.entries(requiredItems)) {
      const currentCount = await this.getItemCount(bot, itemName);
      
      if (currentCount < requiredCount) {
        missingItems[itemName] = requiredCount - currentCount;
      }
    }
    
    return missingItems;
  }

  async canAccommodateItems(bot: UnifiedBot, items: Record<string, number>): Promise<boolean> {
    const state = await this.getInventoryState(bot);
    
    // Calculate how many slots would be needed for the new items
    let slotsNeeded = 0;
    
    for (const [itemName, count] of Object.entries(items)) {
      // Check if we already have some of this item (can stack)
      const existingItems = await this.findItems(bot, { name: itemName });
      let remainingCount = count;
      
      // Account for existing stack space
      for (const existingItem of existingItems) {
        const stackSpace = Math.max(0, 64 - existingItem.count); // Assuming 64 max stack size
        remainingCount -= stackSpace;
      }
      
      // Calculate additional slots needed
      if (remainingCount > 0) {
        slotsNeeded += Math.ceil(remainingCount / 64);
      }
    }
    
    return state.freeSlots >= slotsNeeded;
  }

  async getEquippedItems(bot: UnifiedBot): Promise<{
    hand?: InventoryItem;
    offHand?: InventoryItem;
    head?: InventoryItem;
    torso?: InventoryItem;
    legs?: InventoryItem;
    feet?: InventoryItem;
  }> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.getEquippedItems(bot);
  }

  async getHotbarItems(bot: UnifiedBot): Promise<InventoryItem[]> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.getHotbarItems(bot);
  }

  async setHotbarSlot(bot: UnifiedBot, slot: number): Promise<InventoryOperationResult> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.setHotbarSlot(bot, slot);
  }

  async getActiveHotbarSlot(bot: UnifiedBot): Promise<number> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.getActiveHotbarSlot(bot);
  }

  async validateItemName(bot: UnifiedBot, itemName: string): Promise<string | null> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.validateItemName(bot, itemName);
  }

  async getClosestItemName(bot: UnifiedBot, itemName: string): Promise<string | null> {
    await this.initialize(bot);
    const strategy = this.getStrategy(bot);
    return strategy.getClosestItemName(bot, itemName);
  }

  async cleanup(bot: UnifiedBot): Promise<void> {
    const strategy = this.getStrategy(bot);
    await strategy.cleanup(bot);
    this.initializedBots.delete(bot.username);
  }

  private getStrategy(bot: UnifiedBot): IInventoryStrategy {
    const strategy = this.strategies.get(bot.edition);
    
    if (!strategy) {
      throw new Error(`No inventory strategy available for ${bot.edition} edition`);
    }
    
    return strategy;
  }
}