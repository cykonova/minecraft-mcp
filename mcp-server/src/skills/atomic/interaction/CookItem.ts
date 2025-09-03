import { injectable } from 'tsyringe';
import minecraftData from 'minecraft-data';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const { goals: { GoalNear } } = mineflayer_pathfinder;

export interface ICookItemParams {
  itemName: string;
  fuelName: string;
  count?: number;
}

/**
 * Atomic skill for cooking items in a furnace
 * 
 * This skill handles:
 * - Finding a nearby furnace
 * - Validating items and fuel in inventory
 * - Setting up the furnace for cooking
 * - Monitoring cooking progress
 * - Handling furnace interactions
 */
@injectable()
export class CookItem extends AtomicSkill {
  readonly name = 'cookItem';
  readonly description = 'Cook items in a furnace using fuel';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['itemName', 'fuelName'],
    properties: {
      itemName: {
        type: 'string',
        description: 'The name of the item to cook (e.g., "raw_beef", "potato")',
        minLength: 1,
        maxLength: 50
      },
      fuelName: {
        type: 'string',
        description: 'The name of the fuel to use (e.g., "coal", "wood")',
        minLength: 1,
        maxLength: 50
      },
      count: {
        type: 'number',
        description: 'The number of items to cook (default: 1, max: 64)',
        default: 1,
        minimum: 1,
        maximum: 64
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { itemName, fuelName, count = 1 } = params as ICookItemParams;

    try {
      // Get Minecraft data
      const mcData = minecraftData((bot as any).version);
      
      // Validate and find closest matching items
      const closestItemName = this.findClosestItemName(itemName, mcData);
      if (!closestItemName) {
        return SkillResults.error(`No cookable item named '${itemName}' found in Minecraft`);
      }

      const closestFuelName = this.findClosestItemName(fuelName, mcData);
      if (!closestFuelName) {
        return SkillResults.error(`No fuel item named '${fuelName}' found in Minecraft`);
      }

      const item = mcData.itemsByName[closestItemName];
      const fuel = mcData.itemsByName[closestFuelName];

      // Check if we have the items in inventory
      const itemInInventory = this.getItemCount(bot, item.id);
      const fuelInInventory = this.getItemCount(bot, fuel.id);

      if (itemInInventory < 1) {
        return SkillResults.error(`You don't have any ${item.displayName} to cook`);
      }

      if (fuelInInventory < 1) {
        return SkillResults.error(`You don't have any ${fuel.displayName} to use as fuel`);
      }

      // Calculate actual cooking amounts
      const actualCount = Math.min(count, itemInInventory);
      const fuelNeeded = Math.ceil(actualCount / this.getItemsPerFuel(closestFuelName));
      
      if (fuelInInventory < fuelNeeded) {
        return SkillResults.error(
          `You need ${fuelNeeded} ${fuel.displayName} but only have ${fuelInInventory}`
        );
      }

      // Find a furnace
      const furnace = this.findNearbyFurnace(bot);
      if (!furnace) {
        return SkillResults.error('No furnace found nearby. You need to place one or find one nearby.');
      }

      this.log('info', `Cooking ${actualCount} ${item.displayName} using ${fuelNeeded} ${fuel.displayName}`);

      // Move to the furnace
      await this.moveToFurnace(bot, furnace);

      if (signal?.aborted) {
        return SkillResults.error('Cooking cancelled');
      }

      // Open and use the furnace
      const result = await this.useFurnace(bot, furnace, item.id, fuel.id, actualCount, fuelNeeded);
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to cook ${itemName}: ${errorMessage}`);
    }
  }

  /**
   * Find the closest matching item name
   */
  private findClosestItemName(inputName: string, mcData: any): string | null {
    const normalizedInput = inputName.toLowerCase().replace(/[_\s-]/g, '');
    
    // First try exact match
    if (mcData.itemsByName[inputName]) {
      return inputName;
    }

    // Try normalized match
    for (const itemName of Object.keys(mcData.itemsByName)) {
      const normalizedItemName = itemName.toLowerCase().replace(/[_\s-]/g, '');
      if (normalizedItemName === normalizedInput) {
        return itemName;
      }
    }

    // Try partial match
    for (const itemName of Object.keys(mcData.itemsByName)) {
      if (itemName.toLowerCase().includes(inputName.toLowerCase()) || 
          inputName.toLowerCase().includes(itemName.toLowerCase())) {
        return itemName;
      }
    }

    return null;
  }

  /**
   * Get item count in inventory
   */
  private getItemCount(bot: any, itemId: number): number {
    const items = bot.inventory.items();
    const item = items.find((item: any) => item.type === itemId);
    return item ? item.count : 0;
  }

  /**
   * Calculate how many items can be cooked per fuel
   */
  private getItemsPerFuel(fuelName: string): number {
    const fuelBurnTimes: { [key: string]: number } = {
      stick: 100,
      wooden_slab: 150,
      sapling: 100,
      planks: 300,
      wood: 300,
      log: 300,
      coal: 1600,
      charcoal: 1600,
      lava_bucket: 20000,
      coal_block: 16000,
      blaze_rod: 2400,
    };

    // Cooking takes 10 seconds per item (200 ticks)
    const cookTime = 200;
    const fuelKey = fuelName.toLowerCase().replace(/[_\s-]/g, '');
    const closestFuel = Object.keys(fuelBurnTimes).find(fuel => 
      fuel.includes(fuelKey) || fuelKey.includes(fuel)
    );
    
    if (!closestFuel) {
      return 1; // Conservative estimate if fuel not found
    }

    return Math.floor(fuelBurnTimes[closestFuel] / cookTime);
  }

  /**
   * Find a nearby furnace
   */
  private findNearbyFurnace(bot: any): any | null {
    const mcData = minecraftData((bot as any).version);
    const furnaceId = mcData.blocksByName.furnace.id;
    
    return bot.findBlock({
      matching: furnaceId,
      maxDistance: bot.nearbyBlockXZRange || 16
    });
  }

  /**
   * Move to the furnace
   */
  private async moveToFurnace(bot: any, furnace: any): Promise<void> {
    const goal = new GoalNear(furnace.position.x, furnace.position.y, furnace.position.z, 2);
    
    if (bot.pathfinder) {
      await bot.pathfinder.goto(goal);
      // Look at the furnace
      await bot.lookAt(furnace.position.offset(0.5, 0.5, 0.5));
    } else {
      throw new Error('Pathfinder plugin not available');
    }
  }

  /**
   * Use the furnace to cook items
   */
  private async useFurnace(
    bot: any, 
    furnaceBlock: any, 
    itemId: number, 
    fuelId: number, 
    itemCount: number, 
    fuelCount: number
  ): Promise<SkillResult> {
    try {
      // Open the furnace
      const furnace = await bot.openFurnace(furnaceBlock);
      
      // Clear any existing items first
      if (furnace.inputItem()) {
        await furnace.takeInput();
      }
      if (furnace.fuelItem()) {
        await furnace.takeFuel();
      }
      if (furnace.outputItem()) {
        await furnace.takeOutput();
      }

      // Put fuel in first
      await furnace.putFuel(fuelId, null, fuelCount);
      
      // Put items to cook
      await furnace.putInput(itemId, null, itemCount);

      // Close the furnace
      furnace.close();

      const cookingTime = itemCount * 10; // 10 seconds per item
      const location = `(${Math.floor(furnaceBlock.position.x)}, ${Math.floor(furnaceBlock.position.y)}, ${Math.floor(furnaceBlock.position.z)})`;

      return SkillResults.success(
        {
          itemsCooking: itemCount,
          fuelUsed: fuelCount,
          cookingTime,
          location: location
        },
        `Started cooking ${itemCount} items at ${location}. Will be ready in ${cookingTime} seconds.`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to use furnace: ${errorMessage}`);
    }
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      items: [params.itemName, params.fuelName],
      blocks: ['furnace'],
      environment: ['pathfinder']
    };
  }

  /**
   * Estimate execution time
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const baseTime = 10000; // 10 seconds for setup and navigation
    const cookingTime = (params.count || 1) * 10000; // 10 seconds per item
    return baseTime + cookingTime;
  }

  /**
   * Cooking can be cancelled during setup
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    const { bot } = context;
    try {
      // Stop any active pathfinding
      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
      }
      this.log('info', 'Cooking cancelled');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}