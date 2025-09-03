import {Bot} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {validateSkillParams} from '../index.js';
import {craftAnItem} from '../library/craftAnItem.js';
import {updateCraftingInterface} from '../library/updateCraftingInterface.js';

/**
 * Craft a single item immediately or look at all the items you can craft before crafting.
 * If you desire to craft multiple items, you should look at all the items you can craft and decide what to craft then.
 *
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {string} params.item - The name of the item to craft.
 * @param {number} params.count - The number of items to craft. Defaults to 1.
 * @param {string} params.signal - The signal to emit when the skill is done.
 * @param {Function} serviceParams.getStatsData - A function to get the stats data.
 * @param {Function} serviceParams.setStatsData - A function to set the stats data.
 * @param {ISkillServiceParams} serviceParams - additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns a promise that resolves to void.
 */
export const craftItems = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'craftItems';
  const requiredParams: string[] = [];
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
    item: params.item || null,
    count: params.count || 1,
    signal: serviceParams.signal,
    getStatsData: serviceParams.getStatsData,
    setStatsData: serviceParams.setStatsData,
  };
  const {item, count, setStatsData, getStatsData, signal} = unpackedParams;
  if (!item) {
    try {
      updateCraftingInterface(bot); // open the crafting interface
      // force choosing a new action after opening the crafting interface
      bot.emit(
        'alteraBotEndObservation',
        `You have opened the crafting interface and should choose a new action.`,
      );
    } catch (err) {
      return bot.emit(
        'alteraBotEndObservation',
        `Error: something went wrong when trying to see the items you can craft.`,
      );
    }
  } else {
    const [success, message] = await craftAnItem(bot, {
      name: item,
      count,
      setStatsData,
      getStatsData,
      signal,
    });
    if (success) {
      return bot.emit(
        'alteraBotEndObservation',
        `You have successfully finished crafting ${message}.`,
      );
    } else {
      return bot.emit(
        'alteraBotEndObservation',
        `You have failed to craft ${count} ${item} because ${message}`,
      );
    }
  }
};


