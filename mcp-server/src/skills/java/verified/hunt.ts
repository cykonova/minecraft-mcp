import {Bot} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {validateSkillParams} from '../index.js';
import {attack} from '../library/attack.js';

/**
 * Hunt mobs for their items
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params
 * @param {string} params.targetType - The type of the target to hunt. Use 'player' for players, 'mob' for any hostile mobs, 'animal' for animals.
 * @param {string} params.targetName - OPTIONAL: The specific display name of the entity to attack (optional). For players, use the player's username. For mobs, use the mob type (e.g., 'Zombie'). For animals, use the animal name (e.g., 'Chicken'). Make sure the target name starts with a capital letter.
 * @param {number} params.amount - OPTIONAL: The number of entity you should hunt, this defaults to 4. Maximum amount is 5.
 * @param {number} params.duration - OPTIONAL: Duration in seconds to attack for.  Defaults to 30 seconds. Maximum duration is 60 seconds.
 * @param {ISkillServiceParams} serviceParams - additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully went to the person, false otherwise.
 */
export const hunt = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'hunt';
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
    targetType: params.targetType ?? '',
    targetName: params.targetName ?? null,
    amount: params.amount ?? 4,
    duration: params.duration ?? 30,
  };

  unpackedParams.duration = Math.min(unpackedParams.duration, 60);
  unpackedParams.amount = Math.min(unpackedParams.amount, 5);
  // amount and duration order is reversed for attack
  return attack(bot, {
    targetType: unpackedParams.targetType,
    targetName: unpackedParams.targetName,
    duration: unpackedParams.duration,
    killNumber: unpackedParams.amount,
    getStatsData: serviceParams.getStatsData,
    setStatsData: serviceParams.setStatsData,
    signal: serviceParams.signal,
    resetTimeout: serviceParams.resetTimeout,
  });
};


