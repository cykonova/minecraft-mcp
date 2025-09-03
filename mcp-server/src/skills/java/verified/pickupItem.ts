import { Bot } from 'mineflayer';

import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { closest, distance } from 'fastest-levenshtein';
import minecraftData from 'minecraft-data';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

import { isSignalAborted, validateSkillParams } from '../index.js';
import { asyncwrap } from '../library/asyncwrap.js';
import { findClosestItemName } from '../library/findClosestItemName.js';
import { mineBlock } from '../library/mineBlock.js';

const {
  goals: { GoalBlock, GoalFollow, GoalNear },
} = mineflayer_pathfinder;

/**
 * Go to the nearest item of a specified name and collect it
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 * @param {string} params.itemName - The name of the item to go to and collect.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully collected the item, false otherwise.
 */
export const pickupItem = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'pickupItem';
  const requiredParams = ['itemName'];
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
    signal: serviceParams?.signal,
    itemName: params.itemName,
    getStatsData: serviceParams.getStatsData,
    setStatsData: serviceParams.setStatsData,
    resetTimeout: serviceParams.resetTimeout,
  };
  const { signal, itemName, getStatsData, setStatsData, resetTimeout } =
    unpackedParams;
  const mcData = minecraftData(bot.version);
  const SEARCH_DISTANCE = bot.nearbyEntityRadius;

  if (typeof itemName !== 'string') {
    return bot.emit('alteraBotEndObservation', 'itemName must be a string');
  }

  const closestItemName = findClosestItemName(bot, { name: itemName });
  if (!closestItemName) {
    return bot.emit(
      'alteraBotEndObservation',
      `There is no item named ${itemName} in Minecraft.`,
    );
  }

  const version = parseInt(bot.version.split('.')[1]);
  let target = null;
  if (version < 10) {
    // 1.8
    target = bot.nearestEntity(
      (entity) =>
        entity?.name?.toLowerCase() === 'item' &&
        (entity.metadata[10] as any)?.blockId == mcData.itemsByName[closestItemName].id,
    );
  } else {
    target = bot.nearestEntity(
      (entity) =>
        entity?.name?.toLowerCase() === 'item' &&
        (entity.metadata[8] as any)?.itemId == mcData.itemsByName[closestItemName].id,
    );
  }

  if (target == null || !target.isValid) {
    // If the bot can't find the item on the ground, check to see if its a block
    const closestBlockName = closest(
      (itemName || '').toLowerCase(),
      Object.keys(mcData.blocksByName),
    );
    const blockName = mcData.itemsByName[closestBlockName]?.name;
    if (blockName && distance(closestBlockName, itemName.toLowerCase()) < 3) {
      console.log(
        `No ${itemName} found on the ground nearby. Trying to mine it...`,
      );
      return await mineBlock(bot, {
        name: itemName,
        count: 1,
        signal: signal,
        getStatsData,
        setStatsData,
        resetTimeout,
      });
    } else {
      return bot.emit(
        'alteraBotEndObservation',
        `You were trying to pick up ${itemName}, but there aren't any ${itemName} on the ground nearby for you to pick up!`,
      );
    }
  }

  if (target.position.distanceTo(bot.entity.position) > SEARCH_DISTANCE) {
    return bot.emit(
      'alteraBotEndObservation',
      `You were trying to pick up ${itemName}, but there aren't any ${itemName} on the ground nearby for you to pick up!`,
    );
  }

  try {
    // var pickedUpTarget = false;
    // Collect the item, assuming the bot is close enough to collect it
    const inventory = getInventorySnapshot(bot);

    bot.pathfinder.goto(new GoalFollow(target, 0));

    while (
      target.isValid &&
      target.position.distanceTo(bot.entity.position) < 1.5
    ) {
      // Make sure the item gets registered in the inventory
      const waitFn = async function () {
        return new Promise((r) => setTimeout(r, 50));
      };
      await asyncwrap({ func: waitFn, setStatsData, getStatsData });

      // check signal for cancellation
      if (isSignalAborted(signal)) {
        return bot.emit(
          'alteraBotEndObservation',
          `You decided to do something else and stopped picking up ${itemName}.`,
        );
      }
    }

    // Wait for 10 ticks to make sure the item is registered in the inventory
    await bot.waitForTicks(10);

    const differences = compareInventories(
      inventory,
      getInventorySnapshot(bot),
    );

    return bot.emit(
      'alteraBotEndObservation',
      `You picked up ${getCollapsedItemCounts(differences)}`,
    );
  } catch (error) {
    console.log(
      `An error occurred while trying to go and collect ${itemName}: ${error}`,
    );
    return bot.emit(
      'alteraBotEndObservation',
      `You weren't able to collect any ${itemName} because ${error}`,
    );
  }
};

interface IInventoryItem {
  name: string;
  count: number;
}

/**
 * Get a simplified representation of the bot's inventory
 * @param {Bot} bot - The Mineflayer bot instance.
 *
 * @return {Array<{name:string, count:number}>} - Returns an array of objects representing the bot's inventory.
 */
const getInventorySnapshot = (bot: Bot): IInventoryItem[] => {
  return bot.inventory.items().map((item) => ({
    name: item.name,
    count: item.count,
  }));
};

/**
 * Compare two inventories and return the differences
 * @param {IInventoryItem[]} oldInv - The old inventory.
 * @param {IInventoryItem[]} newInv - The new inventory.
 *
 * @return {IInventoryItem[]} - Returns an array of objects representing the differences between the two inventories.
 */
const compareInventories = (
  oldInv: IInventoryItem[],
  newInv: IInventoryItem[],
): IInventoryItem[] => {
  const oldMap = new Map(oldInv.map((item) => [item.name, item.count]));
  const newMap = new Map(newInv.map((item) => [item.name, item.count]));

  const differences: IInventoryItem[] = [];

  newMap.forEach((newCount, name) => {
    const oldCount = oldMap.get(name) || 0;
    if (newCount > oldCount) {
      differences.push({ name, count: newCount - oldCount });
    }
  });

  return differences;
};

/**
 * Get a collapsed string representation of the item counts
 * @param {IInventoryItem[]} items - The items to collapse.
 *
 * @return {string} - Returns a collapsed string representation of the item counts.
 */
const getCollapsedItemCounts = (items: IInventoryItem[]): string => {
  const itemsMap = items.reduce(
    (acc: { [key: string]: number }, item: IInventoryItem) => {
      const itemName = item.name.replace(/_/g, ' ');
      if (!acc[itemName]) {
        acc[itemName] = 0;
      }
      acc[itemName] += item.count;
      return acc;
    },
    {},
  );

  const collapsedItemCounts = Object.entries(itemsMap)
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');

  if (collapsedItemCounts === '') {
    return 'nothing';
  }

  return collapsedItemCounts;
};

interface IPickupItemAsBlockParams {
  itemName: string;
  searchDistance?: number;
  setStatsData: ISkillServiceParams['setStatsData'];
  getStatsData: ISkillServiceParams['getStatsData'];
}
/**
 * Go to the nearest block of a specified name and collect it
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IPickupItemAsBlockParams} options - The parameters for the skill function.
 * @param {string} options.itemName - The name of the block to go to and collect.
 * @param {number} options.searchDistance - OPTIONAL: The distance to search for the block. Default is 25.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set stats data.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get stats data.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully collected the block, false otherwise.
 */
const pickupItemAsBlock = async (
  bot: Bot,
  options: IPickupItemAsBlockParams,
): Promise<boolean> => {
  const { itemName, setStatsData, getStatsData, searchDistance = 25 } = options;
  const mcData = minecraftData(bot.version);
  const closestItemName = closest(
    itemName.toLowerCase(),
    Object.keys(mcData.itemsByName),
  );
  const targetBlock = bot.findBlock({
    matching: mcData.blocksByName[closestItemName].id,
    maxDistance: bot.nearbyEntityRadius,
  });

  if (targetBlock) {
    if (bot.pathfinder.isMoving()) bot.pathfinder.stop();
    const goToFunc = async function () {
      return bot.pathfinder.goto(
        new GoalNear(
          targetBlock.position.x,
          targetBlock.position.y,
          targetBlock.position.z,
          2,
        ),
      );
    };
    await asyncwrap({ func: goToFunc, setStatsData, getStatsData });
    // Adjust bot's aim to the block
    bot.lookAt(targetBlock.position.plus(new Vec3(0.5, 0.5, 0.5)), true);
    // Dig the block
    const digFunc = async function () {
      return bot.dig(targetBlock);
    };
    await asyncwrap({ func: digFunc, setStatsData, getStatsData });
    // Wait for 1 second
    const waitFunc = async function () {
      return new Promise((resolve) => setTimeout(resolve, 1000));
    };
    await asyncwrap({ func: waitFunc, getStatsData, setStatsData });
    if (bot.pathfinder.isMoving()) {
      bot.pathfinder.stop();
    }
    const goToFunc2 = async function () {
      return bot.pathfinder.goto(
        new GoalBlock(
          targetBlock.position.x,
          targetBlock.position.y,
          targetBlock.position.z,
        ),
      );
    };
    await asyncwrap({ func: goToFunc2, setStatsData, getStatsData });

    return true;
  }

  return false;
};


