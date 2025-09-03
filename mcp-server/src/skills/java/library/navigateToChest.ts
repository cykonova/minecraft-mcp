import mineflayer_pathfinder from 'mineflayer-pathfinder';
const { goals } = mineflayer_pathfinder;
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

import { ISkillServiceParams } from '../../../types/skillType.js';
import { asyncwrap } from './asyncwrap.js';
const { GoalLookAtBlock } = goals;

interface INavigateToChestOptions {
  chestPosition: Vec3;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * Navigate to a chest in Minecraft.
 *
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {INavigateToChestOptions} options - The options for navigating to a chest.
 * @param {Vec3} options.chestPosition - The position of the chest to navigate to.
 * @param {Function} options.getStatsData - A function to get the stats data.
 * @param {Function} options.setStatsData - A function to set the stats data.
 *
 * @return {Promise<void>} - Returns a promise that resolves to void.
 */
export const navigateToChest = async (
  bot: Bot,
  options: INavigateToChestOptions,
): Promise<void> => {
  const { chestPosition, getStatsData, setStatsData } = options;
  if (bot.pathfinder.isMoving()) bot.pathfinder.stop(); // Clear any prior pathfinder goals
  const goal = new GoalLookAtBlock(chestPosition, bot.world);
  const gotoFunc = async function () {
    return bot.pathfinder
      .goto(goal)
      .then(() => {
        console.log('Arrived at the chest!');
      })
      .catch((err) => {
        console.error(`Error going to the chest:${err}`);
      });
  };
  await asyncwrap({
    func: gotoFunc,
    setStatsData,
    getStatsData,
  });
};


