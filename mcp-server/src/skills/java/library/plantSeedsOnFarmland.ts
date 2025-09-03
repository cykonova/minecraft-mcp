import minecraftData from 'minecraft-data';
import {Bot} from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
import {Vec3} from 'vec3';

import {ISkillServiceParams} from '../../../types/skillType.js';
import {asyncwrap} from './asyncwrap.js';
import {navigateToLocation} from './navigateToLocation.js';

const {Movements} = mineflayer_pathfinder;

interface IPlantSeedsOnFarmlandOptions {
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
  radius?: number;
}
/**
 * Plant seeds on farmland blocks within a specified radius.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IPlantSeedsOnFarmlandOptions} options - The options for the skill function.
 * @param {number} options.radius - The radius in blocks to search for farmland blocks. Default is 8 blocks.
 *
 * @return {Promise<void>} - Returns a promise that resolves when the bot has attempted to plant seeds on farmland blocks.
 */
export const plantSeedsOnFarmland = async (
  bot: Bot,
  options: IPlantSeedsOnFarmlandOptions,
): Promise<void> => {
  const defaultOptions = {
    radius: 8,
  };
  const {radius, getStatsData, setStatsData} = {...defaultOptions, ...options};
  const mcData = minecraftData(bot.version);
  // Avoid breaking blocks while building
  const movements = new Movements(bot);
  movements.canDig = false; // Prevent the bot from breaking blocks
  bot.pathfinder.setMovements(movements);

  const farmlandId = mcData.blocksByName.farmland.id;
  const airId = mcData.blocksByName.air.id;
  const seedsItemName = 'wheat_seeds'; // Use 'beetroot_seeds', 'melon_seeds', etc., for other crops

  // Find farmland blocks within the specified radius
  const farmlandPositions = bot
    .findBlocks({
      point: bot.entity.position,
      matching: farmlandId,
      // these values don't exist in mineflayer
      // radius: radius,
      // maxMatches: 100, // Adjust based on how many blocks you want to attempt to plant on
      useExtraInfo: true,
      count: 100,
    })
    // Don't plant on farmland with seeds already there
    .filter((block) => {
      const blockAbove = bot.blockAt(block.offset(0, 1, 0));
      return blockAbove && blockAbove.type == airId;
    });

  if (farmlandPositions.length === 0) {
    bot.emit(
      'alteraBotEndObservation',
      `You tried to plant seeds around here, but no empty farmland found around.`,
    );
    return;
  }

  let attemptedPlanting = 0;
  let plantedCount = 0;

  for (const pos of farmlandPositions) {
    let blockAbove = bot.blockAt(pos.offset(0, 1, 0));
    let block = bot.blockAt(pos);
    if (
      blockAbove &&
      blockAbove.type === airId &&
      block &&
      block.type === farmlandId
    ) {
      // Ensure the bot has the seeds to plant
      const seeds = bot.inventory
        .items()
        .find((item) => item.name === seedsItemName);
      if (!seeds) {
        bot.emit(
          'alteraBotEndObservation',
          `You tried to plant seeds but you don't have any ${seedsItemName} to plant.`,
        );
        return; // Stop if no seeds are left
      }

      try {
        const equipFunc = async function () {
          return bot.equip(seeds, 'hand');
        };
        await asyncwrap({func: equipFunc, getStatsData, setStatsData}); // Equip the seeds

        const navigateFunc = async function () {
          return navigateToLocation(bot, {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            range: 1,
          });
        };
        await asyncwrap({func: navigateFunc, getStatsData, setStatsData}); // Navigate to the farmland block
      } catch (err) {
        const error = err as Error;
        bot.emit(
          'alteraBotTextObservation',
          `Error navigating to the farmland block: ${error.message}`,
        );
      }

      blockAbove = bot.blockAt(pos.offset(0, 1, 0));
      block = bot.blockAt(pos);
      if (
        blockAbove &&
        blockAbove.type === airId &&
        block &&
        block.type === farmlandId
      ) {
        try {
          const placeBlockFunc = async function () {
            return bot.placeBlock(bot.blockAt(pos), new Vec3(0, 1, 0));
          };
          await asyncwrap({func: placeBlockFunc, getStatsData, setStatsData}); // Attempt to plant the seed
          // bot.emit('alteraBotTextObservation', `Planted ${seedsItemName} at ${pos}`);
          plantedCount++;
        } catch (err) {
          const error = err as Error;
          bot.emit(
            'alteraBotTextObservation',
            `Error planting ${seedsItemName} at ${pos}: ${error.message}`,
          );
        }

        attemptedPlanting++;
      }
    }
  }

  if (attemptedPlanting === 0) {
    bot.emit(
      'alteraBotTextObservation',
      `You tried to plant seeds on farmland, but all farmland around is already occupied by crops.`,
    );
  }

  const defaultMovements = new Movements(bot);
  bot.pathfinder.setMovements(defaultMovements);

  // Emit a final observation with the count of successfully planted seeds
  if (plantedCount > 0) {
    bot.emit(
      'alteraBotEndObservation',
      `You successfully planted ${plantedCount} ${seedsItemName}.`,
    );
  } else if (attemptedPlanting > 0) {
    bot.emit(
      'alteraBotEndObservation',
      `You attempted to plant seeds but failed due to errors.`,
    );
  }
};


