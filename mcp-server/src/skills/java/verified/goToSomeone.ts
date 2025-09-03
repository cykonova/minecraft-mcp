import { Bot } from 'mineflayer';
import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { validateSkillParams } from '../index.js';
import { goToPerson } from '../library/goToPerson.js';

/**
 *  Goes to someone to get near them or follow them.
 *
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {object} params
 * @param {string} params.userName - The name of the person to go to or follow.
 * @param {number} params.distance - The desired distance to get within the person. Default is 3 blocks.
 * @param {boolean} params.keepFollowing - Whether to keep following the person after reaching them. Default is false.
 * @param {object} serviceParams - additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully went to the person, false otherwise.
 */
export const goToSomeone = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'goToSomeone';
  const requiredParams = ['userName'];
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

  const defaultParams = {
    keepFollowing: true,
    distance: 3,
  };

  return goToPerson(bot, {
    name: params.userName,
    distance: params.distance ?? defaultParams.distance,
    keepFollowing:
      params.keepFollowing ?? defaultParams.keepFollowing,
    signal: serviceParams.signal,
  });
};


