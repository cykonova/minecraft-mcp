import mineflayer_pathfinder from 'mineflayer-pathfinder';
const { goals } = mineflayer_pathfinder;
import { Bot } from 'mineflayer';
import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { isSignalAborted, validateSkillParams } from '../index.js';
import { asyncwrap } from '../library/asyncwrap.js';
import { cancelableMove } from '../library/navigateToLocation.js';
import { findLand, findSurface } from '../library/swimHelper.js';

const { GoalNear } = goals;

/**
 * This skill allows the bot to swim to the nearest land from its current position in water.
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {object} serviceParams - additional parameters for the skill function.
 *
 */
export const swimToLand = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'swimToLand';
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
  const { getStatsData, setStatsData, signal } = serviceParams;

  // Define a set of water-related blocks where the bot might start swimming
  const waterBlocks = new Set(['water', 'seagrass', 'kelp', 'kelp_plant']);

  // Check if the bot is currently in a block suitable for starting to swim
  const wrappedFn = async function () {
    return bot.world.getBlock(bot.entity.position);
  };
  const currentBlock = await asyncwrap({
    func: wrappedFn,
    getStatsData,
    setStatsData,
  });
  if (!waterBlocks.has(currentBlock.name)) {
    console.log(
      'Bot is not in water or related blocks (seagrass, kelp, or kelp_plant).',
    );
    bot.emit('alteraBotEndObservation', "You're probably not in water");
    return; // Early exit if the bot is not in a suitable block to start swimming
  }

  console.log('Searching for surface...');
  const surfacePosition = await findSurface(bot, { getStatsData, setStatsData });
  if (!surfacePosition) {
    console.log('Unable to find surface. The bot might not be in water.');
    return;
  }
  console.log(`Moving to surface...`);

  const landPosition = await findLand(bot, {
    startPosition: surfacePosition,
    getStatsData,
    setStatsData,
  });
  if (!landPosition) {
    console.log('No land found nearby. Bot remains at water surface.');
    return;
  }
  console.log(`Navigating to land...`);

  // Navigate to the land position using pathfinder
  await cancelableMove(bot, {
    goal: new GoalNear(landPosition.x, landPosition.y, landPosition.z, 1),
    signal,
  });

  // check for cancellation signal
  if (isSignalAborted(signal)) {
    return bot.emit(
      'alteraBotEndObservation',
      'You decided to do something else and stopped swimming.',
    );
  }

  // Emit an event or log a final message upon reaching the land
  return bot.emit(
    'alteraBotEndObservation',
    'You have safely reached the land!',
  );
};


