import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { closest, distance } from 'fastest-levenshtein';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalFollow },
} = mineflayer_pathfinder;

export interface IPickupItemParams {
  itemName: string;
  maxDistance?: number;
  timeout?: number;
}

/**
 * Atomic skill for picking up a specific item from the ground
 * 
 * This skill handles:
 * - Finding the nearest item of specified type
 * - Navigation to the item
 * - Item collection
 * - Inventory tracking
 */
@injectable()
export class PickupItem extends AtomicSkill {
  readonly name = 'PickupItem';
  readonly description = 'Pick up a specific item from the ground nearby';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['itemName'],
    properties: {
      itemName: {
        type: 'string',
        description: 'Name of the item to pick up (e.g., "stone", "apple", "iron_ingot")'
      },
      maxDistance: {
        type: 'number',
        description: 'Maximum distance to search for items (default: (bot as any).nearbyEntityRadius)',
        default: 32,
        minimum: 1,
        maximum: 128
      },
      timeout: {
        type: 'number',
        description: 'Maximum time in milliseconds to spend collecting (default: 10000)',
        default: 10000,
        minimum: 1000,
        maximum: 30000
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { itemName, maxDistance, timeout = 10000 } = params as IPickupItemParams;

    const mcData = minecraftData((bot as any).version);
    const searchDistance = maxDistance || (bot as any).nearbyEntityRadius || 32;

    // Find closest matching item name
    const closestItemName = this.findClosestItemName(bot, itemName);
    if (!closestItemName) {
      return SkillResults.error(`Unknown item: ${itemName}`);
    }

    this.log('info', `Looking for ${closestItemName} within ${searchDistance} blocks`);

    // Find the item entity
    const targetItem = this.findItemEntity(bot, closestItemName, searchDistance);
    if (!targetItem) {
      return SkillResults.error(`No ${closestItemName} found on the ground nearby`);
    }

    const itemDistance = bot.entity.position.distanceTo(targetItem.position);
    this.log('debug', `Found ${closestItemName} at distance ${itemDistance.toFixed(2)}`);

    try {
      // Record inventory before pickup
      const inventoryBefore = this.getInventorySnapshot(bot);

      // Navigate to the item
      const goal = new GoalFollow(targetItem, 0);
      
      const startTime = Date.now();
      (bot as any).pathfinder.goto(goal);

      // Wait for item collection or timeout
      while (targetItem.isValid && Date.now() - startTime < timeout) {
        const currentDistance = bot.entity.position.distanceTo(targetItem.position);
        
        // If we're close enough, the item should be collected automatically
        if (currentDistance < 1.5) {
          await bot.waitForTicks(2); // Give time for collection
          break;
        }

        await bot.waitForTicks(1);
      }

      // Stop pathfinding
      (bot as any).pathfinder.setGoal(null);

      // Check if we collected the item
      const inventoryAfter = this.getInventorySnapshot(bot);
      const itemsCollected = this.compareInventories(inventoryBefore, inventoryAfter);

      if (itemsCollected.length > 0) {
        const collectedList = itemsCollected
          .map(item => `${item.count} ${item.name}`)
          .join(', ');
        return SkillResults.success(null, `Successfully picked up: ${collectedList}`);
      }

      // Check if item still exists
      if (targetItem.isValid) {
        return SkillResults.error(`Could not reach ${closestItemName} for collection`);
      } else {
        // Item disappeared (might have been collected by someone else)
        return SkillResults.error(`${closestItemName} was collected by someone else or despawned`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Stop any ongoing pathfinding
      try {
        (bot as any).pathfinder.setGoal(null);
      } catch (stopError) {
        // Ignore
      }

      return SkillResults.error(`Failed to collect ${closestItemName}: ${errorMessage}`);
    }
  }

  /**
   * Find the closest matching item name
   */
  private findClosestItemName(bot: any, itemName: string): string | null {
    const mcData = minecraftData((bot as any).version);
    const availableItems = Object.keys(mcData.itemsByName);
    
    const closestMatch = closest(itemName.toLowerCase(), availableItems);
    const matchDistance = distance(itemName.toLowerCase(), closestMatch);
    
    if (matchDistance > 2) {
      return null; // Too different
    }
    
    return closestMatch;
  }

  /**
   * Find an item entity on the ground
   */
  private findItemEntity(bot: any, itemName: string, maxDistance: number): any | null {
    const mcData = minecraftData((bot as any).version);
    const itemId = mcData.itemsByName[itemName]?.id;
    
    if (!itemId) {
      return null;
    }

    const version = parseInt((bot as any).version.split('.')[1]);
    
    return bot.nearestEntity((entity: any) => {
      if (!entity || entity.name?.toLowerCase() !== 'item') {
        return false;
      }

      if (entity.position.distanceTo(bot.entity.position) > maxDistance) {
        return false;
      }

      // Check metadata based on version
      if (version < 10) {
        // 1.8 format
        return (entity.metadata[10] as any)?.blockId === itemId;
      } else {
        // 1.9+ format  
        return (entity.metadata[8] as any)?.itemId === itemId;
      }
    });
  }

  /**
   * Get inventory snapshot
   */
  private getInventorySnapshot(bot: any): Array<{name: string, count: number}> {
    if (!bot.inventory?.items) {
      return [];
    }
    
    return bot.inventory.items().map((item: any) => ({
      name: item.name,
      count: item.count,
    }));
  }

  /**
   * Compare inventories to find new items
   */
  private compareInventories(
    before: Array<{name: string, count: number}>,
    after: Array<{name: string, count: number}>
  ): Array<{name: string, count: number}> {
    const beforeMap = new Map(before.map(item => [item.name, item.count]));
    const afterMap = new Map(after.map(item => [item.name, item.count]));
    
    const differences: Array<{name: string, count: number}> = [];
    
    afterMap.forEach((newCount, name) => {
      const oldCount = beforeMap.get(name) || 0;
      if (newCount > oldCount) {
        differences.push({ name, count: newCount - oldCount });
      }
    });
    
    return differences;
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      environment: ['pathfinder']
    };
  }

  /**
   * Estimate execution time based on search distance
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const baseTime = 2000; // 2 seconds base
    const searchDistance = params.maxDistance || 32;
    const navigationTime = Math.min(searchDistance * 100, 10000); // Max 10 seconds
    
    return baseTime + navigationTime;
  }
}