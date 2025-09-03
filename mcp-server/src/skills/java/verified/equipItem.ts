import {Bot, EquipmentDestination} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import minecraftData from 'minecraft-data';

import {validateSkillParams} from '../index.js';
import {asyncwrap} from '../library/asyncwrap.js';
import {findClosestItemName} from '../library/findClosestItemName.js';

/**
 * Equips an item by name.
 *
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {ISkillServiceParams} serviceParams - The service parameters for the skill.
 * @param {string} params.name - The name of the item to be equipped.
 * @param {ISkillServiceParams['getStatsData']} serviceParams.getStatsData - The function to get the stats data.
 * @param {ISkillServiceParams['setStatsData']} serviceParams.setStatsData - The function to set the stats data.
 *
 * @returns {Promise<boolean>} - A promise that resolves when the item is equipped.
 */
export const equipItem = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'equipItem';
  const requiredParams = ['name'];
  const isParamsValid = validateSkillParams(
    params,
    requiredParams,
    skillName,
  );
  if (!isParamsValid) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide all of the required parameters ${requiredParams.join(', ')} for the ${skillName} skill.`,
    );
    return false;
  }
  const unpackedParams = {
    name: params.name,
    getStatsData: serviceParams.getStatsData,
    setStatsData: serviceParams.setStatsData,
  };
  let {name, getStatsData, setStatsData} = unpackedParams;
  if (typeof name !== 'string') {
    return bot.emit(
      'alteraBotEndObservation',
      `You couldn't equip ${name} because ${name} is not a string.`,
    );
  }
  // Find the closest item name from the input
  const closestItemName = findClosestItemName(bot, {name});
  if (!closestItemName) {
    return bot.emit(
      'alteraBotEndObservation',
      `You couldn't equip ${name} because there's no item named ${name} in minecraft. Did you mean ${closestItemName}?`,
    );
  }
  const mcData = minecraftData(bot.version);
  name = closestItemName;
  // Look up the item in the Minecraft data to ensure it exists
  const itemByName = mcData.itemsByName[name];
  const equipDestination = getEquipDestination(name);

  // Check if the item is already equipped
  const equippedItem =
    bot.inventory.slots[bot.getEquipmentDestSlot(equipDestination)];
  if (equippedItem && equippedItem.name === name) {
    return bot.emit(
      'alteraBotEndObservation',
      `You tried to equip ${name} but you already have ${name} equipped.`,
    );
  }

  // Find the item in the bot's inventory
  const item = bot.inventory.findInventoryItem(itemByName.id, null, false);
  if (!item) {
    return bot.emit(
      'alteraBotEndObservation',
      `You couldn't equip yourself with ${name} because you don't have any ${name} in your inventory.`,
    );
  }

  // Attempt to equip the item
  try {
    const equipFunc = async function () {
      return bot.equip(item, equipDestination);
    };
    await asyncwrap({func: equipFunc, getStatsData, setStatsData});
    // bot.chat(`Equipped ${name}`);
    return bot.emit(
      'alteraBotEndObservation',
      `You equipped yourself with ${name}`,
    );
  } catch (err) {
    // bot.chat(`Error equipping ${name}: ${err.message}`);
    return bot.emit(
      'alteraBotEndObservation',
      `You cannot equip yourself with ${name} right now.`,
    );
  }
};

/**
 * Returns the destination slot for an item based on its name.
 * @param {string} itemName - The name of the item.
 *
 * @returns {string} - The destination slot for the item.
 */
const getEquipDestination = (itemName: string): EquipmentDestination => {
  if (itemName.includes('helmet')) return 'head';
  if (itemName.includes('chestplate') || itemName.includes('elytra'))
    return 'torso';
  if (itemName.includes('leggings')) return 'legs';
  if (itemName.includes('boots')) return 'feet';
  if (itemName.includes('shield')) return 'off-hand';
  return 'hand'; // Default to hand for items that are not armor
};


