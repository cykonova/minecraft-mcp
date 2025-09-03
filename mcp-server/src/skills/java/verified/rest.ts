import {Bot} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {isSignalAborted, validateSkillParams} from '../index.js';

/**
 * Makes the bot sleep in a nearby bed.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {number} params.restTime - The duration of time to rest for, in seconds. Maximum time is 12 seconds.
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully rested, false otherwise.
 */
export const rest = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'rest';
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
    restTime: params.restTime ?? 4,
    signal: serviceParams.signal,
  };
  let {restTime, signal} = unpackedParams;
  const SECONDS_TO_TICKS = 20; // twenty ticks per second
  restTime = Math.min(restTime, 12); // Set max rest time to 12 seconds.
  const ticks_to_rest = restTime * SECONDS_TO_TICKS; // convert seconds to ticks
  const tick_interval = SECONDS_TO_TICKS * 2; // allow interrupting every 2 seconds
  let cur_sleep_ticks = 0;

  while (cur_sleep_ticks < ticks_to_rest) {
    if (isSignalAborted(signal)) {
      // You interrupted your own rest
      return bot.emit(
        'alteraBotEndObservation',
        `You decided to do something else instead of resting.`,
      );
    }
    await bot.waitForTicks(tick_interval);
    cur_sleep_ticks += tick_interval;
  }
  return bot.emit('alteraBotEndObservation', `You finished resting.`);
};


