import { Bot } from 'mineflayer';

import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { validateSkillParams } from '../index.js';
import { attack } from '../library/attack.js';

/**
 * Attack, kill, defend against, or initiate combat with someone.
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * @param {string} params.targetType - The type of the target to attack or kill. Use 'player' for players, 'mob' for any hostile mobs, 'animal' for animals.
 * @param {string} params.targetName - OPTIONAL: The specific display name of the entity to attack (optional). For players, use the player's username. For mobs, use the mob type (e.g., 'Zombie').  Make sure the target name starts with a capital letter.
 * @param {number} params.duration - OPTIONAL: Duration in seconds to attack a player for.  Defaults to 20 seconds. Maximum duration is 120 seconds.
 * @param {number} params.count - OPTIONAL: number of kills to achieve. Defaults to 1.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully attacked the target, false otherwise.
 */
export const attackSomeone = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'attackSomeone';
  const requiredParams = ['targetType'];
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

  return attack(bot, {
    targetType: params.targetType ?? null,
    targetName: params.targetName ?? '',
    duration: params.duration ?? 20,
    killNumber: params.count ?? 1,
    signal: serviceParams.signal,
    getStatsData: serviceParams.getStatsData,
    setStatsData: serviceParams.setStatsData,
    resetTimeout: serviceParams.resetTimeout,
  });
};


