import {Bot} from 'mineflayer';
import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {validateSkillParams} from '../index.js';
import {tossItemTowardsPlayer} from '../library/tossItemTowardsPlayer.js';

/**
 * Give an item or items from your inventory to someone.
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {string} params.userName - The target person's name who you are giving something to
 * @param {string} params.itemName - The item to give, you must have it in your inventory
 * @param {number} params.itemCount - The amount to give, this should not be more than you have in your inventory
 * @param {object} serviceParams - additional parameters for the skill function.
 *
 */
// async function giveItemToSomeone(bot, playerName, itemName, itemCount = 1) {
export const giveItemToSomeone = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'giveItemToSomeone';
  const requiredParams = ['userName', 'itemName'];
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
    playerName: params.userName,
    itemName: params.itemName,
    itemCount: params.itemCount ?? 1,
  };

  console.log(
    `Giving ${unpackedParams.itemCount} of ${unpackedParams.itemName} to ${unpackedParams.playerName}`,
  );
  return tossItemTowardsPlayer(bot, {
    playerName: unpackedParams.playerName,
    itemName: unpackedParams.itemName,
    itemCount: unpackedParams.itemCount,
    signal: serviceParams.signal,
  });
};


