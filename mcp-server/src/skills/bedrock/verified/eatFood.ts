import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Eat food from inventory to restore hunger for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.foodName - Name of the food to eat (optional, eats any available food if not specified)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully ate food
 */
export const eatFood = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'eatFood';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  const foodName = params.foodName as string;

  try {
    const inventory = (bot as any).getInventory();
    if (!inventory || !inventory.slots) {
      bot.emit(
        'alteraBotEndObservation',
        'Cannot access inventory',
      );
      return false;
    }

    // List of common food items
    const foodItems = [
      'apple', 'bread', 'cooked', 'steak', 'porkchop', 'chicken', 
      'mutton', 'rabbit', 'potato', 'carrot', 'melon', 'cookie',
      'cake', 'pie', 'stew', 'soup', 'golden_apple', 'fish', 'salmon',
      'beef', 'berries'
    ];

    // Find food in inventory
    let targetFood = null;
    let targetSlot = -1;

    for (let i = 0; i < inventory.slots.length; i++) {
      const item = inventory.slots[i];
      if (!item) continue;

      const itemNameLower = (item.name || '').toLowerCase();
      
      if (foodName) {
        // Look for specific food
        if (itemNameLower.includes(foodName.toLowerCase())) {
          targetFood = item;
          targetSlot = i;
          break;
        }
      } else {
        // Look for any food
        const isFood = foodItems.some(food => itemNameLower.includes(food));
        if (isFood) {
          targetFood = item;
          targetSlot = i;
          break;
        }
      }
    }

    if (!targetFood) {
      bot.emit(
        'alteraBotEndObservation',
        foodName ? 
          `Food "${foodName}" not found in inventory` :
          'No food found in inventory',
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Eating ${targetFood.name || foodName || 'food'}...`,
    );

    // Select the food item in hotbar
    if (targetSlot >= 0 && targetSlot <= 8) {
      // Food is in hotbar, select it
      if ((bot as any)._bot && (bot as any).protocolHelpers) {
        await (bot as any).protocolHelpers.selectHotbarSlot(targetSlot);
      }
    } else {
      // Food is not in hotbar, need to move it first
      // For now, we'll try to equip it to hand
      await (bot as any).equip(targetFood, 'hand');
    }

    // Use the item (eat)
    if ((bot as any).useItem) {
      await (bot as any).useItem();
    } else if ((bot as any).protocolHelpers) {
      await (bot as any).protocolHelpers.useItem();
    }

    // Wait for eating animation (usually takes about 1.6 seconds)
    await new Promise(resolve => setTimeout(resolve, 1600));

    bot.emit(
      'alteraBotEndObservation',
      `Ate ${targetFood.name || foodName || 'food'}`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to eat food: ${errorMessage}`,
    );
    return false;
  }
};