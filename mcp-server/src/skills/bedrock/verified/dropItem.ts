import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Drop an item from inventory for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.itemName - Name or ID of the item to drop
 * @param {number} params.count - Number of items to drop (default: all)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully dropped the item
 */
export const dropItem = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'dropItem';
  
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
  const count = (params.count as number) || -1;

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
    let targetSlot = -1;

    for (let i = 0; i < inventory.slots.length; i++) {
      const item = inventory.slots[i];
      if (item && 
          (item.name?.toLowerCase().includes(itemName.toLowerCase()) ||
           item.network_id?.toString() === itemName)) {
        targetItem = item;
        targetSlot = i;
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

    // Determine how many to drop
    const dropCount = count === -1 ? 
      (targetItem.count || 1) : 
      Math.min(count, targetItem.count || 1);

    // Drop the item
    await (bot as any).tossStack(targetItem, dropCount);

    bot.emit(
      'alteraBotEndObservation',
      `Dropped ${dropCount} ${targetItem.name || itemName}`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to drop item: ${errorMessage}`,
    );
    return false;
  }
};