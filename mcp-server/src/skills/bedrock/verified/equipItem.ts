import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Equip an item from inventory (armor, tools, etc) for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.itemName - Name or ID of the item to equip
 * @param {string} params.destination - Where to equip the item (hand, head, torso, legs, feet, off-hand)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully equipped the item
 */
export const equipItem = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'equipItem';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  
  // Validate required parameters
  if (!params.itemName) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide the required parameter 'itemName' for the ${skillName} skill.`,
    );
    return false;
  }
  const itemName = params.itemName as string;
  const destination = (params.destination as string) || 'hand';

  try {
    const inventory = (bot as any).getInventory();
    if (!inventory || !inventory.slots) {
      bot.emit(
        'alteraBotEndObservation',
        'Cannot access inventory',
      );
      return false;
    }

    // Find the item in inventory
    let targetItem = null;

    for (const item of inventory.slots) {
      if (item && 
          (item.name?.toLowerCase().includes(itemName.toLowerCase()) ||
           item.network_id?.toString() === itemName)) {
        targetItem = item;
        break;
      }
    }

    if (!targetItem) {
      bot.emit(
        'alteraBotEndObservation',
        `Item "${itemName}" not found in inventory`,
      );
      return false;
    }

    // Validate destination for item type
    const itemNameLower = (targetItem.name || itemName).toLowerCase();
    
    if (destination === 'head' && !itemNameLower.includes('helmet') && !itemNameLower.includes('cap')) {
      bot.emit(
        'alteraBotEndObservation',
        `Cannot equip ${targetItem.name || itemName} to head slot`,
      );
      return false;
    }
    
    if (destination === 'torso' && !itemNameLower.includes('chestplate') && !itemNameLower.includes('tunic')) {
      bot.emit(
        'alteraBotEndObservation',
        `Cannot equip ${targetItem.name || itemName} to torso slot`,
      );
      return false;
    }
    
    if (destination === 'legs' && !itemNameLower.includes('leggings') && !itemNameLower.includes('pants')) {
      bot.emit(
        'alteraBotEndObservation',
        `Cannot equip ${targetItem.name || itemName} to legs slot`,
      );
      return false;
    }
    
    if (destination === 'feet' && !itemNameLower.includes('boots') && !itemNameLower.includes('shoes')) {
      bot.emit(
        'alteraBotEndObservation',
        `Cannot equip ${targetItem.name || itemName} to feet slot`,
      );
      return false;
    }

    // Equip the item
    await (bot as any).equip(targetItem, destination);

    bot.emit(
      'alteraBotEndObservation',
      `Equipped ${targetItem.name || itemName} to ${destination}`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to equip item: ${errorMessage}`,
    );
    return false;
  }
};