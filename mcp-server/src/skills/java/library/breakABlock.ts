import {Bot} from 'mineflayer';
import {Vec3} from 'vec3';

import {ISkillServiceParams} from '../../../types/skillType.js';
import {asyncwrap} from './asyncwrap.js';

interface IBreakABlockOptions {
  x: number;
  y: number;
  z: number;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * break a block at coordinates
 *
 * @param {Bot} bot - The bot instance.
 * @param {IBreakABlockOptions} options - The options object.
 * @param {number} options.x - The x coordinate.
 * @param {number} options.y - The y coordinate.
 * @param {number} options.z - The z coordinate.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get stats data.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set stats data.
 *
 * @return {Promise<boolean>} - Returns a promise that resolves to true if the block was broken successfully.
 */
export const breakABlock = async (
  bot: Bot,
  options: IBreakABlockOptions,
): Promise<boolean> => {
  const {x, y, z, getStatsData, setStatsData} = options;
  const position = new Vec3(x, y, z);
  const block = bot.blockAt(position);
  if (!block) {
    return bot.emit(
      'alteraBotEndObservation',
      `You tried to break a block at ${position}, but the block was invalid`,
    );
  }
  const collectFunc = async function () {
    return bot.collectBlock.collect(block, {ignoreNoPath: true});
  };
  const results = await asyncwrap({
    func: collectFunc,
    setStatsData,
    getStatsData,
  });
  bot.emit('alteraBotTextObservation', `${results}`);
};


