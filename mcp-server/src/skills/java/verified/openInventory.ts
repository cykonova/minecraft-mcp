import {Bot} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {validateSkillParams} from '../index.js';

/**
 * Opens your inventory
 *
 * @param {Object} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {object} params
 * @param {object} serviceParams - additional parameters for the skill function.
 *
 */
export const openInventory = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'openInventory';
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

  const inventory = bot.inventory.items();

  let inventoryStr = inventory
    .map((item) => `${item.count} ${item.displayName.toLowerCase()}`)
    .join(', ');

  if (inventoryStr.length === 0) inventoryStr = 'nothing.';

  const logMessage = `You just finished examining your inventory and it contains: ${inventoryStr}.`;
  console.log(logMessage);
  bot.emit('alteraBotEndObservation', logMessage);
  return true;
};


