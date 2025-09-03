
import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {useFurnace} from '../library/useFurnace.js';
import {Bot} from 'mineflayer';

import {validateSkillParams} from '../index.js';

/**
 * Smelt specified item(s) in Minecraft.
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {Object} params
 * @param {string} params.itemName - The name of the item to smelt.
 * @param {string} params.fuelName - The name of the fuel used for smelting. Must be a resource from your inventory.
 * @param {number} [params.count=1] - The minimum number of items to craft. Defaults to 1. 2 is a good baseline.  Maximum is 4.
 * @param {object} serviceParams - additional parameters for the skill function.
 * @param {AbortSignal} serviceParams.signal - The signal to abort the skill.
 * @param {ISkillServiceParams['getStatsData']} serviceParams.getStatsData - The function to get the stats data.
 * @param {ISkillServiceParams['setStatsData']} serviceParams.setStatsData - The function to set the stats data.
 *
 */
export const smeltItem = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'smeltItem';
  const requiredParams = ['itemName', 'fuelName'];
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
  const {signal, getStatsData, setStatsData} = serviceParams;

  const unpackedParams = {
    itemName: params.itemName,
    fuelName: params.fuelName,
    count: params.count ?? 1,
  };

  unpackedParams.count = Math.min(unpackedParams.count, 4);

  return await useFurnace(bot, {
    itemName: unpackedParams.itemName,
    fuelName: unpackedParams.fuelName,
    count: unpackedParams.count,
    action: 'smelt',
    signal,
    getStatsData,
    setStatsData,
  });
};


