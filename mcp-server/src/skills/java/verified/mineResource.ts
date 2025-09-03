import {Bot} from 'mineflayer';
import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {isSignalAborted, validateSkillParams} from '../index.js';
import {mineBlock} from '../library/mineBlock.js';

/**
 * Mine resources in Minecraft such as wood or stone.
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {string} params.name - The name of the resource to mine.
 * @param {number} params.count - The amount of resources to mine.
 * @param {object} serviceParams - additional parameters for the skill function.
 */

// async function mineResource(bot:Bot, name, count = 1) {
export const mineResource = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'mineResource';
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
  const {signal, getStatsData, setStatsData, resetTimeout} = serviceParams;

  if (isSignalAborted(signal)) {
    return;
  }

  const unpackedParams = {
    name: params.name,
    count: params.count ?? 1,
  };

  unpackedParams.count = Math.min(unpackedParams.count, 4);

  try {
    await mineBlock(bot, {
      name: unpackedParams.name,
      count: unpackedParams.count,
      use_dig: false,
      getStatsData,
      setStatsData,
      resetTimeout,
      signal,
    });
  } catch (err) {
    const error = err as Error;
    return bot.emit(
      'alteraBotEndObservation',
      `Error during mining: ${error.message}`,
    );
  }
};


