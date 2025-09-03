import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

import { ISkillServiceParams } from '../../../types/skillType.js';
import { asyncwrap } from './asyncwrap.js';

// Simple coordinate interface
interface ICoordinate {
  x: number;
  y: number;
  z: number;
}

interface IFindSurfaceOptions {
  position?: Vec3;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}

interface IFindSurfaceDefaultOptions {
  position: Vec3 | null;
}

interface IFindLandOptions {
  startPosition: Vec3;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}

/**
 * Finds the first air block above the specified position or the bot's current position.
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {object} options
 * @param {Vec3} [options.position = null]: The starting position to search from. If not provided, the bot's current position plus one block up is used.
 * @param {Function} options.getStatsData - The function to get the stats data from evaluateCode.
 * @param {Function} options.setStatsData - The function to set the stats data from evaluateCode.
 *
 * @returns {Promise<Vec3>} The position of the first air block found, or `null` if no air block is found within the maximum search height.
 */
export async function findSurface(
  bot: Bot,
  options: IFindSurfaceOptions,
): Promise<Vec3 | null> {
  const defaultOptions: IFindSurfaceDefaultOptions = {
    position: null,
  };

  const { position, getStatsData, setStatsData } = {
    ...defaultOptions,
    ...options,
  };

  let currentPosition = bot.entity.position.offset(0, 1, 0); // Start checking from one block above the bot
  if (position) {
    currentPosition = position;
  }
  const maxIterations = 400; // Maximum number of blocks to check upward

  // Linear search to find the first air block, with a limit on the number of iterations
  for (let i = 0; i < maxIterations; i++) {
    const block = await asyncwrap({
      func: async () => {
        return bot.world.getBlock(currentPosition);
      },
      getStatsData,
      setStatsData,
    });
    if (block.name === 'air') {
      console.log(
        `Surface found at ${currentPosition.x}, ${currentPosition.y}, ${currentPosition.z}`,
      );
      return currentPosition; // Return the position as soon as the first air block is found
    }
    currentPosition = currentPosition.offset(0, 1, 0); // Move up one block to check the next
  }

  console.log('Reached the maximum search height without finding surface.');
  return null; // Return null if the surface is not found within the limit
}

export async function findLand(
  bot: Bot,
  options: IFindLandOptions,
): Promise<ICoordinate | null> {
  const { startPosition, getStatsData, setStatsData } = options;

  const visited = new Set();
  const queue = [[Math.floor(startPosition.x), Math.floor(startPosition.z)]];
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const landBlocks = new Set([
    'stone',
    'grass_block',
    'dirt',
    'podzol',
    'sand',
    'gravel',
    'clay',
    'bedrock',
    'coal_ore',
    'iron_ore',
    'sandstone',
    'mossy_cobblestone',
    'obsidian',
    'snow',
    'ice',
    'packed_ice',
    'blue_ice',
    'red_sand',
    'terracotta',
    'coarse_dirt',
  ]); // Defines land blocks considered as solid land

  while (queue.length > 0) {
    const [currentX, currentZ] = queue.shift();
    for (const [dx, dz] of directions) {
      const nx = currentX + dx;
      const nz = currentZ + dz;
      const hash = `${nx},${nz}`;

      if (!visited.has(hash)) {
        visited.add(hash);
        const position = new Vec3(nx, startPosition.y, nz);
        const block = await asyncwrap({
          func: async () => {
            return bot.world.getBlock(position);
          },
          getStatsData,
          setStatsData,
        });

        const blockBelow = await asyncwrap({
          func: async () => {
            return bot.world.getBlock(position.offset(0, -1, 0));
          },
          getStatsData,
          setStatsData,
        });

        if (block.name === 'air' && landBlocks.has(blockBelow.name)) {
          console.log(`Land found at ${nx}, ${startPosition.y}, ${nz}`);
          return { x: nx, y: startPosition.y, z: nz }; // Coordinates of the land block
        }
        queue.push([nx, nz]); // Adds new position to the queue for further exploration
      }
    }
  }

  console.log('No land found within search range.');
  return null; // Returns null if no land is found
}


