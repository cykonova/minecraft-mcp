import { injectable } from 'tsyringe';
import { closest, distance } from 'fastest-levenshtein';
import minecraftData from 'minecraft-data';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IEquipItemParams {
  itemName: string;
  destination?: 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand' | 'auto';
}

/**
 * Atomic skill for equipping an item from the bot's inventory
 * 
 * This skill handles:
 * - Finding the item in inventory
 * - Determining the correct equipment slot
 * - Equipping the item
 * - Validation of equipment success
 */
@injectable()
export class EquipItem extends AtomicSkill {
  readonly name = 'EquipItem';
  readonly description = 'Equip an item from inventory to the appropriate slot';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['itemName'],
    properties: {
      itemName: {
        type: 'string',
        description: 'Name of the item to equip (e.g., "iron_sword", "diamond_helmet", "shield")'
      },
      destination: {
        type: 'string',
        enum: ['hand', 'head', 'torso', 'legs', 'feet', 'off-hand', 'auto'],
        description: 'Equipment slot to use (default: auto-detect based on item type)',
        default: 'auto'
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { itemName, destination = 'auto' } = params as IEquipItemParams;

    // Find closest matching item name
    const closestItemName = this.findClosestItemName(bot, itemName);
    if (!closestItemName) {
      return SkillResults.error(`Unknown item: ${itemName}`);
    }

    const mcData = minecraftData((bot as any).version);
    const itemData = mcData.itemsByName[closestItemName];
    
    if (!itemData) {
      return SkillResults.error(`Item data not found for: ${closestItemName}`);
    }

    // Find the item in inventory
    const inventoryItem = bot.inventory.findInventoryItem(itemData.id, null, false);
    if (!inventoryItem) {
      return SkillResults.error(`${closestItemName} not found in inventory`);
    }

    // Determine equipment destination
    const equipDestination = destination === 'auto' 
      ? this.getAutoEquipDestination(closestItemName)
      : destination;

    this.log('info', `Equipping ${closestItemName} to ${equipDestination}`);

    try {
      // Check if item is already equipped
      const currentlyEquipped = this.getCurrentlyEquipped(bot, equipDestination);
      if (currentlyEquipped && currentlyEquipped.name === closestItemName) {
        return SkillResults.success(null, `${closestItemName} is already equipped in ${equipDestination}`);
      }

      // Attempt to equip the item
      await (bot as any).equip(inventoryItem, equipDestination as any);

      // Verify equipment was successful
      const nowEquipped = this.getCurrentlyEquipped(bot, equipDestination);
      if (nowEquipped && nowEquipped.name === closestItemName) {
        const previousItem = currentlyEquipped ? ` (replaced ${currentlyEquipped.name})` : '';
        return SkillResults.success(null, `Successfully equipped ${closestItemName} to ${equipDestination}${previousItem}`);
      } else {
        return SkillResults.error(`Failed to equip ${closestItemName} - item not found in ${equipDestination} slot`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('cannot equip')) {
        return SkillResults.error(`Cannot equip ${closestItemName} to ${equipDestination} - incompatible item type`);
      } else if (errorMessage.includes('not found')) {
        return SkillResults.error(`${closestItemName} disappeared from inventory during equipping`);
      } else {
        return SkillResults.error(`Failed to equip ${closestItemName}: ${errorMessage}`);
      }
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
   * Automatically determine the best equipment destination for an item
   */
  private getAutoEquipDestination(itemName: string): string {
    const name = itemName.toLowerCase();
    
    // Helmets
    if (name.includes('helmet') || name.includes('cap')) {
      return 'head';
    }
    
    // Chestplates and elytra
    if (name.includes('chestplate') || name.includes('elytra') || name.includes('tunic')) {
      return 'torso';
    }
    
    // Leggings
    if (name.includes('leggings') || name.includes('pants')) {
      return 'legs';
    }
    
    // Boots
    if (name.includes('boots') || name.includes('shoes')) {
      return 'feet';
    }
    
    // Shields and off-hand items
    if (name.includes('shield') || name.includes('totem')) {
      return 'off-hand';
    }
    
    // Default to hand for tools, weapons, and other items
    return 'hand';
  }

  /**
   * Get the currently equipped item in a specific slot
   */
  private getCurrentlyEquipped(bot: any, destination: string): any | null {
    if (!bot.inventory) {
      return null;
    }

    let slotIndex: number;
    
    switch (destination) {
      case 'hand':
        slotIndex = bot.getEquipmentDestSlot('hand');
        break;
      case 'head':
        slotIndex = bot.getEquipmentDestSlot('head');
        break;
      case 'torso':
        slotIndex = bot.getEquipmentDestSlot('torso');
        break;
      case 'legs':
        slotIndex = bot.getEquipmentDestSlot('legs');
        break;
      case 'feet':
        slotIndex = bot.getEquipmentDestSlot('feet');
        break;
      case 'off-hand':
        slotIndex = bot.getEquipmentDestSlot('off-hand');
        break;
      default:
        return null;
    }

    return bot.inventory.slots[slotIndex] || null;
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      items: [params.itemName]
    };
  }

  /**
   * Estimate execution time - equipment is usually fast
   */
  estimateExecutionTime(params: Record<string, any>): number {
    return 1000; // 1 second - equipment is typically very fast
  }
}