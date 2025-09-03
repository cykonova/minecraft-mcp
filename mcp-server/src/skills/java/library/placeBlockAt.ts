import {Bot} from 'mineflayer';
import {Block} from 'prismarine-block';
import {Vec3} from 'vec3';

import {ISkillServiceParams} from '../../../types/skillType.js';
import {asyncwrap} from './asyncwrap.js';

interface IPlaceBlockAtOptions {
  targetPosition: Vec3;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * Places the current block in the bot's hand at the given position.
 * @param {Bot} bot - The mineflayer bot object.
 * @param {IPlaceBlockAtOptions} options - The options for placing a block at a position.
 * @param {Vec3} options.targetPosition - The position to place the block at.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get the stats data.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set stats data.
 *
 * @return {Promise<void>} - Returns a promise that resolves when the block is placed.
 */
export const placeBlockAt = async (
  bot: Bot,
  options: IPlaceBlockAtOptions,
): Promise<void> => {
  const {targetPosition, getStatsData, setStatsData} = options;
  let referenceBlock: Block = null;
  let faceVector: Vec3 = null;

  const faceVectors = [
    new Vec3(0, 1, 0), // top
    new Vec3(0, -1, 0), // bottom
    new Vec3(1, 0, 0), // right
    new Vec3(-1, 0, 0), // left
    new Vec3(0, 0, 1), // front
    new Vec3(0, 0, -1), // back
  ];

  for (const vector of faceVectors) {
    const testPos = targetPosition.minus(vector);
    const block = bot.blockAt(testPos);
    if (block && block.type !== 0) {
      // Check if block is not air
      referenceBlock = block;
      faceVector = vector;
      break;
    }
  }

  if (!referenceBlock) {
    throw Error(
      `No suitable location found to place block at position ${targetPosition}`,
    );
  }

  try {
    const placeBlockFunc = async function () {
      return bot.placeBlock(referenceBlock, faceVector);
    };
    await asyncwrap({func: placeBlockFunc, setStatsData, getStatsData});
  } catch (error) {
    console.error(
      `[CONSOLE] Failed to place block at position ${targetPosition} with error: ${error}`,
    );
  }
};


