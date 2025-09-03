import { injectable } from 'tsyringe';
import { EquipmentDestination } from 'mineflayer';
import minecraftData from 'minecraft-data';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IEquipItemParams {
  name: string;
}

/**
 * Atomic skill for equipping items from the bot's inventory
 * 
 * This skill handles:
 * - Finding items in inventory by name
 * - Determining correct equipment slot (head, torso, legs, feet, hand, off-hand)
 * - Checking if item is already equipped
 * - Error handling for missing items or invalid equipment
 */
@injectable()
export class EquipItemSkill extends AtomicSkill {
  readonly name = 'equipItem';
  readonly description = 'Equips an item by name from the bot\'s inventory';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'The name of the item to be equipped',
        minLength: 1,
        maxLength: 50
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    let { name } = params as IEquipItemParams;

    if (typeof name !== 'string') {
      return SkillResults.error(`Item name must be a string, got ${typeof name}`);
    }

    name = name.toLowerCase().trim();

    try {
      // Get Minecraft data for this version
      const mcData = minecraftData((bot as any).version);
      
      // Find closest matching item name (handle fuzzy matching)
      const closestItemName = this.findClosestItemName(bot, name, mcData);
      if (!closestItemName) {
        return SkillResults.error(`No item named '${name}' found in Minecraft`);
      }

      name = closestItemName;
      const itemByName = mcData.itemsByName[name];
      if (!itemByName) {
        return SkillResults.error(`Item '${name}' not found in Minecraft data`);
      }

      // Determine where to equip this item
      const equipDestination = this.getEquipDestination(name);

      // Check if the item is already equipped
      const equippedItem = bot.inventory.slots[(bot as any).getEquipmentDestSlot(equipDestination)];
      if (equippedItem && equippedItem.name === name) {
        return SkillResults.success(
          null,
          `You already have ${name} equipped`
        );
      }

      // Find the item in the bot's inventory
      const item = bot.inventory.findInventoryItem(itemByName.id, null, false);
      if (!item) {
        return SkillResults.error(
          `You don't have any ${name} in your inventory to equip`
        );
      }

      // Attempt to equip the item
      this.log('info', `Equipping ${name} to ${equipDestination}`);
      await bot.equip(item, equipDestination);

      return SkillResults.success(
        {
          equippedItem: {
            name: item.name,
            displayName: item.displayName,
            count: item.count,
            slot: equipDestination
          }
        },
        `Successfully equipped ${name}`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Cannot equip ${name}: ${errorMessage}`);
    }
  }

  /**
   * Find the closest item name match (simple implementation)
   */
  private findClosestItemName(bot: any, inputName: string, mcData: any): string | null {
    const normalizedInput = inputName.toLowerCase().replace(/[_\s-]/g, '');
    
    // First try exact match
    if (mcData.itemsByName[inputName]) {
      return inputName;
    }

    // Try normalized match (remove underscores, spaces, dashes)
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
   * Determine the equipment destination based on item name
   */
  private getEquipDestination(itemName: string): EquipmentDestination {
    if (itemName.includes('helmet')) return 'head';
    if (itemName.includes('chestplate') || itemName.includes('elytra')) return 'torso';
    if (itemName.includes('leggings')) return 'legs';
    if (itemName.includes('boots')) return 'feet';
    if (itemName.includes('shield')) return 'off-hand';
    return 'hand'; // Default to hand for tools, weapons, and other items
  }

  /**
   * Resource requirements for equipping items
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      items: [params.name], // Need the item to be in inventory
    };
  }

  /**
   * Estimate execution time - relatively fast operation
   */
  estimateExecutionTime(params: Record<string, any>): number {
    return 1000; // 1 second - equipping is usually quick
  }

  /**
   * Equipping can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }
}