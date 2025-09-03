import minecraftData from 'minecraft-data';
import {Bot} from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {navigateToLocation} from '../library/navigateToLocation.js';
import {Block} from 'prismarine-block';
import {Vec3} from 'vec3';

import {isSignalAborted, validateSkillParams} from '../index.js';
import {placeBlock} from '../library/placeBlock.js';
import {plantSeedsOnFarmland} from '../library/plantSeedsOnFarmland.js';
import {tillLandToFarmland} from '../library/tillLandToFarmland.js';

const {Movements} = mineflayer_pathfinder;
/**
 * Prepares the land for crops, and plants crops.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IFunctionCall} params - The parameters for the skill function.
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * @param serviceParams
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully prepared the land for farming, false otherwise.
 */
export const prepareLandForFarming = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'prepareLandForFarming';
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
  const {signal, getStatsData, setStatsData} = serviceParams;
  const mcData = minecraftData(bot.version);
  // Avoid breaking blocks while building
  const movements = new Movements(bot);
  movements.canDig = false; // Prevent the bot from breaking blocks
  bot.pathfinder.setMovements(movements);

  // Remove expanding the farms for now
  // const placedCount = expandFarm(bot, 8);
  const waterBlocks = bot
    .findBlocks({
      matching: mcData.blocksByName.water.id,
      maxDistance: 6,
      count: 100,
    })
    .map((position) => bot.blockAt(position));
  // console.log("Found water blocks: ", waterBlocks.length);

  const airId = mcData.blocksByName.air.id;
  // grassId is 1.19, shortGrassId is 1.20
  const grassId = mcData.blocksByName.grass?.id;
  const shortGrassId = mcData.blocksByName.short_grass?.id;
  const tallGrassId = mcData.blocksByName.tall_grass?.id;

  const adjacentWaterBlocks = waterBlocks.filter((waterBlock) =>
    hasAdjacentLand(bot, {position: waterBlock.position}),
  );
  // console.log("Found adjacent water blocks: ", adjacentWaterBlocks.length);
  const queue = adjacentWaterBlocks.map((waterBlock) => ({
    block: waterBlock,
    distance: 0,
  }));
  // const queue = waterBlocks.map(waterBlock => ({ block: waterBlock, distance: 0 }));
  // console.log("Found water blocks: ", queue.length)
  const visited = new Set();
  const tillableBlocks = [];

  while (queue.length > 0) {
    const {block, distance} = queue.shift(); // Get the first element from the queue
    // console.log("Processing block: ", block.position.toString());
    const blockKey = block.position.toString();

    if (visited.has(blockKey)) continue; // Skip if already visited
    visited.add(blockKey);

    // If it's a dirt or grass block and within 4 blocks of water, mark it for tilling
    if (
      distance > 0 &&
      distance <= 4 &&
      (block.type === mcData.blocksByName.dirt.id ||
        block.type === mcData.blocksByName.grass_block.id)
    ) {
      const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
      if (
        blockAbove &&
        (blockAbove.type === airId ||
          blockAbove.type === grassId ||
          blockAbove.type === shortGrassId ||
          blockAbove.type === tallGrassId)
      ) {
        tillableBlocks.push(block);
      }
    }

    if (distance < 4) {
      const neighbors = getNeighborBlocks(bot, {
        position: block.position,
        yLevel: block.position.y,
      });
      for (const neighbor of neighbors) {
        const neighborKey = neighbor.position.toString();
        if (!visited.has(neighborKey)) {
          queue.push({block: neighbor, distance: distance + 1});
        }
      }
    }
  }

  // Till the identified blocks
  for (const block of tillableBlocks) {
    // Navigate to the block
    await navigateToLocation(bot, {
      x: block.position.x,
      y: block.position.y,
      z: block.position.z,
      range: 1,
    });
    // check for signal to cancel
    if (isSignalAborted(signal)) {
      return bot.emit(
        'alteraBotEndObservation',
        `You decided to do something else and stop preparing land for farming.`,
      );
    }

    await tillLandToFarmland(bot, {
      targetBlock: block,
      setStatsData,
      getStatsData,
    });
  }

  await plantSeedsOnFarmland(bot, {getStatsData, setStatsData, radius: 8});

  const defaultMovements = new Movements(bot);
  bot.pathfinder.setMovements(defaultMovements);

  bot.emit(
    'alteraBotEndObservation',
    `You ` /* + `placed ${placedCount} new dirt blocks in the farm, `*/ +
      `tilled ${tillableBlocks.length} pieces of land, and have finished preparing land for farming.`,
  );
  return true;
};

interface IGetNeighborBlocksOptions {
  position: Vec3;
  yLevel: number;
}
/**
 * Get the neighboring blocks of the specified block.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IGetNeighborBlocksOptions} options - The options for getting the neighboring blocks.
 * @param {Vec3} options.position - The position of the block.
 * @param {number} options.yLevel - The y-level of the block.
 *
 * @return {Block[]} - Returns the neighboring blocks.
 */
const getNeighborBlocks = (
  bot: Bot,
  options: IGetNeighborBlocksOptions,
): Block[] => {
  const {position, yLevel} = options;
  const offsets = [
    {x: 1, y: 0, z: 0},
    {x: -1, y: 0, z: 0},
    {x: 0, y: 0, z: 1},
    {x: 0, y: 0, z: -1},
    // { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, // Check above and below too
  ];

  return offsets
    .map((offset) => {
      const newPos = position.plus(new Vec3(offset.x, offset.y, offset.z));
      return bot.blockAt(newPos);
    })
    .filter((block) => block && block.position.y === yLevel); // Remove undefined blocks (e.g., out of the world bounds)
};

interface IHasAdjacentLandOptions {
  position: Vec3;
}
/**
 * Check if the specified block has adjacent land.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IHasAdjacentLandOptions} options - The options for checking if the block has adjacent land.
 *
 * @return {boolean} - Returns true if the block has adjacent land, false otherwise.
 */
const hasAdjacentLand = (
  bot: Bot,
  options: IHasAdjacentLandOptions,
): boolean => {
  const {position} = options;
  const mcData = minecraftData(bot.version);
  const offsets = [
    {x: 1, y: 0, z: 0},
    {x: -1, y: 0, z: 0},
    {x: 0, y: 0, z: 1},
    {x: 0, y: 0, z: -1},
  ];

  return offsets.some((offset) => {
    const newPos = position.plus(new Vec3(offset.x, offset.y, offset.z));
    const block = bot.blockAt(newPos);
    return (
      block &&
      (block.type === mcData.blocksByName.dirt.id ||
        block.type === mcData.blocksByName.grass_block.id)
    );
  });
};

interface IExpandFarmOptions {
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
  count?: number;
}
/**
 * Expands the farm by placing dirt blocks.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IExpandFarmOptions} options - The options for expanding the farm.
 * @param {number} options.count - The number of dirt blocks to place. Default is 8.
 *
 * @return {Promise<number>} - Returns the number of dirt blocks placed.
 */
const expandFarm = async (
  bot: Bot,
  options: IExpandFarmOptions,
): Promise<number> => {
  const defaultOptions = {
    count: 8,
  };
  const {count, getStatsData, setStatsData} = {...defaultOptions, ...options};
  let placedCount = 0;
  for (let i = 0; i < count; i++) {
    if (bot.inventory.items().find((item) => item.name === 'dirt')) {
      const expandableArea = await findExpandableWater(bot, {
        number: 100,
        radius: 8,
      });

      if (expandableArea.length === 0) {
        break;
      }

      const expansionLocation =
        expandableArea[Math.floor(Math.random() * expandableArea.length)];
      await placeBlock(bot, {
        name: 'dirt',
        x: expansionLocation.x,
        y: expansionLocation.y,
        z: expansionLocation.z,
        getStatsData,
        setStatsData,
      });
      placedCount++;
    }
  }
  return placedCount;
};

interface IFindExpandableWaterOptions {
  number: number;
  radius: number;
}
/**
 * Find expandable water blocks.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IFindExpandableWaterOptions} options - The options for finding expandable water blocks.
 * @param {number} options.number - The number of expandable water blocks to find.
 * @param {number} options.radius - The radius to search for expandable water blocks.
 *
 * @return {Promise<Vec3[]>} - Returns the expandable water blocks.
 */
async function findExpandableWater(
  bot: Bot,
  options: IFindExpandableWaterOptions,
): Promise<Vec3[]> {
  const {number, radius} = options;
  const mcData = minecraftData(bot.version);
  const water: Vec3[] = [];
  const positions = bot.findBlocks({
    point: bot.entity.position,
    matching: (block) => block.type === mcData.blocksByName.water.id,
    maxDistance: radius,
    count: number,
  });

  for (const pos of positions) {
    const above = bot.blockAt(pos.plus(new Vec3(0, 1, 0)));
    if (!above || above.type != mcData.blocksByName.air.id) {
      continue;
    }
    let adjacentCount = 0;
    const plusX = bot.blockAt(pos.plus(new Vec3(1, 0, 0)));
    const minusX = bot.blockAt(pos.plus(new Vec3(-1, 0, 0)));
    const plusZ = bot.blockAt(pos.plus(new Vec3(0, 0, 1)));
    const minusZ = bot.blockAt(pos.plus(new Vec3(0, 0, -1)));
    if (
      plusX &&
      plusX.type == mcData.blocksByName.water.id &&
      !plusX.getProperties().level
    ) {
      adjacentCount++;
    }
    if (
      minusX &&
      minusX.type == mcData.blocksByName.water.id &&
      !minusX.getProperties().level
    ) {
      adjacentCount++;
    }
    if (
      plusZ &&
      plusZ.type == mcData.blocksByName.water.id &&
      !plusZ.getProperties().level
    ) {
      adjacentCount++;
    }
    if (
      minusZ &&
      minusZ.type == mcData.blocksByName.water.id &&
      !minusZ.getProperties().level
    ) {
      adjacentCount++;
    }
    if (adjacentCount > 2 && adjacentCount < 4) {
      water.push(pos);
    }
  }

  return water;
}


