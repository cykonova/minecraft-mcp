import { injectable } from 'tsyringe';
import minecraftData from 'minecraft-data';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const { goals: { GoalNear } } = mineflayer_pathfinder;

export interface ISmeltItemParams {
  itemName: string;
  fuelName: string;
  count?: number;
}

/**
 * Atomic skill for smelting items/ores in a furnace
 * 
 * This skill handles:
 * - Finding a nearby furnace
 * - Validating ores/items and fuel in inventory
 * - Setting up the furnace for smelting
 * - Monitoring smelting progress
 * - Handling furnace interactions for ore processing
 */
@injectable()
export class SmeltItem extends AtomicSkill {
  readonly name = 'smeltItem';
  readonly description = 'Smelt ores and other items in a furnace using fuel';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['itemName', 'fuelName'],
    properties: {
      itemName: {
        type: 'string',
        description: 'The name of the item/ore to smelt (e.g., "iron_ore", "gold_ore", "sand")',
        minLength: 1,
        maxLength: 50
      },
      fuelName: {
        type: 'string',
        description: 'The name of the fuel to use (e.g., "coal", "charcoal", "wood")',
        minLength: 1,
        maxLength: 50
      },
      count: {
        type: 'number',
        description: 'The number of items to smelt (default: 1, max: 64)',
        default: 1,
        minimum: 1,
        maximum: 64
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { itemName, fuelName, count = 1 } = params as ISmeltItemParams;

    try {
      // Get Minecraft data
      const mcData = minecraftData((bot as any).version);
      
      // Validate and find closest matching items
      const closestItemName = this.findClosestItemName(itemName, mcData);
      if (!closestItemName) {
        return SkillResults.error(`No smeltable item named '${itemName}' found in Minecraft`);
      }

      const closestFuelName = this.findClosestItemName(fuelName, mcData);
      if (!closestFuelName) {
        return SkillResults.error(`No fuel item named '${fuelName}' found in Minecraft`);
      }

      const item = mcData.itemsByName[closestItemName];
      const fuel = mcData.itemsByName[closestFuelName];

      // Validate this is a smeltable item (has a smelting recipe)
      if (!this.canSmeltItem(closestItemName)) {
        return SkillResults.error(`${item.displayName} cannot be smelted`);
      }

      // Check if we have the items in inventory
      const itemInInventory = this.getItemCount(bot, item.id);
      const fuelInInventory = this.getItemCount(bot, fuel.id);

      if (itemInInventory < 1) {
        return SkillResults.error(`You don't have any ${item.displayName} to smelt`);
      }

      if (fuelInInventory < 1) {
        return SkillResults.error(`You don't have any ${fuel.displayName} to use as fuel`);
      }

      // Calculate actual smelting amounts
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

      this.log('info', `Smelting ${actualCount} ${item.displayName} using ${fuelNeeded} ${fuel.displayName}`);

      // Move to the furnace
      await this.moveToFurnace(bot, furnace);

      if (signal?.aborted) {
        return SkillResults.error('Smelting cancelled');
      }

      // Open and use the furnace
      const result = await this.useFurnace(bot, furnace, item.id, fuel.id, actualCount, fuelNeeded);
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to smelt ${itemName}: ${errorMessage}`);
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
   * Check if an item can be smelted
   */
  private canSmeltItem(itemName: string): boolean {
    // Common smeltable items
    const smeltableItems = [
      'iron_ore', 'gold_ore', 'copper_ore', 'diamond_ore', 'emerald_ore',
      'coal_ore', 'redstone_ore', 'lapis_ore', 'nether_gold_ore',
      'ancient_debris', 'nether_quartz_ore',
      'sand', 'cobblestone', 'stone', 'sandstone',
      'clay_ball', 'netherrack', 'cactus',
      'wet_sponge', 'raw_iron', 'raw_gold', 'raw_copper',
      'iron_ingot', 'gold_ingot', 'chainmail_helmet', 'chainmail_chestplate',
      'chainmail_leggings', 'chainmail_boots', 'iron_helmet', 'iron_chestplate',
      'iron_leggings', 'iron_boots', 'golden_helmet', 'golden_chestplate',
      'golden_leggings', 'golden_boots', 'iron_sword', 'iron_shovel',
      'iron_pickaxe', 'iron_axe', 'iron_hoe', 'golden_sword', 'golden_shovel',
      'golden_pickaxe', 'golden_axe', 'golden_hoe'
    ];

    return smeltableItems.some(smeltable => 
      smeltable === itemName.toLowerCase() ||
      itemName.toLowerCase().includes(smeltable) ||
      smeltable.includes(itemName.toLowerCase())
    );
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
   * Calculate how many items can be smelted per fuel
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

    // Smelting takes 10 seconds per item (200 ticks)
    const smeltTime = 200;
    const fuelKey = fuelName.toLowerCase().replace(/[_\s-]/g, '');
    const closestFuel = Object.keys(fuelBurnTimes).find(fuel => 
      fuel.includes(fuelKey) || fuelKey.includes(fuel)
    );
    
    if (!closestFuel) {
      return 1; // Conservative estimate if fuel not found
    }

    return Math.floor(fuelBurnTimes[closestFuel] / smeltTime);
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
   * Use the furnace to smelt items
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
      
      // Put items to smelt
      await furnace.putInput(itemId, null, itemCount);

      // Close the furnace
      furnace.close();

      const smeltingTime = itemCount * 10; // 10 seconds per item
      const location = `(${Math.floor(furnaceBlock.position.x)}, ${Math.floor(furnaceBlock.position.y)}, ${Math.floor(furnaceBlock.position.z)})`;

      return SkillResults.success(
        {
          itemsSmelting: itemCount,
          fuelUsed: fuelCount,
          smeltingTime,
          location: location
        },
        `Started smelting ${itemCount} items at ${location}. Will be ready in ${smeltingTime} seconds.`
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
    const smeltingTime = (params.count || 1) * 10000; // 10 seconds per item
    return baseTime + smeltingTime;
  }

  /**
   * Smelting can be cancelled during setup
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
      this.log('info', 'Smelting cancelled');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}