import { closest, distance } from 'fastest-levenshtein';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { ISkillServiceParams } from '../../../types/skillType.js';
import { isSignalAborted } from '../index.js';
import { asyncwrap } from './asyncwrap.js';
import { blockHasNearbyAir } from './blockHasNearbyAir.js';
import { exploreNearby } from './exploreNearby.js';
import { cancelableMove } from './navigateToLocation.js';

const {
  Movements,
  goals: { GoalNear, GoalBlock },
} = mineflayer_pathfinder;

interface iMineBlockOptions {
  name: string;
  count?: number;
  use_dig?: boolean;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
  resetTimeout: ISkillServiceParams['resetTimeout'];
  signal: ISkillServiceParams['signal'];
}
/**
 * Mine resources in Minecraft such as wood or stone.
 *
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {iMineBlockOptions} options - The options for the mineBlock function.
 * @param {string} options.name - The name of the block to be mined. Use 'wood' if you want to mine any type of wood.
 * @param {number} options.count - How many blocks of the item to mine. Default is 1. Mine no more than 16 blocks at a time.
 * @param {boolean} options.use_dig - Whether to use the dig command to mine the block. Default is false.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get the stats data.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set the stats data.
 * @param {ISkillServiceParams['resetTimeout']} options.resetTimeout - The function to reset the timeout.
 * @param {ISkillServiceParams['signal']} options.signal - The signal object to check if the skill execution has been cancelled.
 *
 * @return {Promise<boolean>} - Returns a promise that resolves after the bot has mined the block.
 */
export const mineBlock = async (
  bot: Bot,
  options: iMineBlockOptions,
): Promise<boolean> => {
  let {
    name,
    getStatsData,
    setStatsData,
    resetTimeout,
    signal,
    count = 1,
    use_dig = false,
  } = options;
  const mcData = minecraftData(bot.version);
  // IMOPORTANT: Set this to false if you want the bot to mine the blocks in the world. Set to true if you want the bot to instantly give you the items.
  const INSTANT_MINE = false;
  const originalName = name.slice(); // deep copy
  let itemMode = false;

  // return if name is not string
  if (typeof name !== 'string') {
    // throw new Error(`name for mineBlock must be a string`);
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: ${name} must be a string`,
    );
  }

  // Alias wood to 'oak_log' for now
  // This should be removed, this was a hack that's not necessary anymore
  if (name.includes('wood')) {
    name = 'oak_log';
    // Fix for older versions of minecraft
    if (!mcData.blocksByName[name]) {
      name = 'log';
    }
  }

  // Find the closest item name from the input
  const blockName = closest(
    name.toLowerCase(),
    Object.keys(mcData.blocksByName),
  );
  const itemName = closest(name.toLowerCase(), Object.keys(mcData.itemsByName));
  if (distance(name, blockName) > distance(name, itemName)) {
    itemMode = true;
    // return bot.emit('alteraBotEndObservation', `${itemName} is an item--not a mineable block.`);
  }

  if (itemMode == false && distance(blockName, name) > 1) {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: you cannot mine ${originalName} because it is not a block that exists in minecraft.`,
    );
  } else if (itemMode == true && distance(itemName, name) > 1) {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: you cannot mine ${originalName} because it is not an item that exists in minecraft.`,
    );
  }

  if (typeof count !== 'number') {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: count for mineBlock must be a number`,
    );
  }

  let blockByName;
  let itemByName: minecraftData.Item;
  if (!itemMode) {
    blockByName = mcData.blocksByName[blockName];
    if (!blockByName) {
      return bot.emit(
        'alteraBotEndObservation',
        `Mistake: you couldn't mine ${originalName} because there's no block named ${originalName} in minecraft.`,
      );
    }
    const canMine = await canBotMine(bot, { blockByName });
    if (!canMine) {
      // canMine will handle the error message emission
      // console.log(` cannot mine ${name}`);
      return;
    }

    if (INSTANT_MINE) {
      if (blockByName.drops && blockByName.drops.length > 0) {
        let dropItem = null;
        const dropId = blockByName.drops[0]; // Taking the first drop item
        if (typeof dropId === 'number') {
          dropItem = mcData.items[dropId];
        }
        if (dropItem) {
          const dropName = dropItem.name;
          // Add a 5 second delay to simulate mining
          const delayFunc = async () => {
            return new Promise((resolve) => setTimeout(resolve, 5000));
          };
          await asyncwrap({ func: delayFunc, getStatsData, setStatsData });
          bot.chat(`/give @s ${dropName} ${count}`);
          return bot.emit(
            'alteraBotEndObservation',
            `You successfully mined ${count} ${dropItem.displayName}.`,
          );
        }
      }
      return bot.emit(
        'alteraBotEndObservation',
        `Mistake: you couldn't mine ${originalName} because it doesn't drop any item.`,
      );
    }
  } else if (itemMode) {
    itemByName = mcData.itemsByName[itemName];
    if (!itemByName) {
      return bot.emit(
        'alteraBotEndObservation',
        `Mistake: you couldn't mine ${originalName} because there's no item named ${originalName} in minecraft.`,
      );
    }
    const canMine = await canBotMineItem(bot, { itemByName });
    if (!canMine) {
      // error / end message is handled by canBotMineItem
      return bot.emit(
        'alteraBotEndObservation',
        `You don't have the right tool to mine ${originalName}.`,
      );
    }
  }

  let blocks = [];

  // console.log(`Searching for ${name} blocks.`);

  // array of all wood ids
  const woodBlockIds = mcData.blocksArray
    .filter((block) => block.name.includes('log'))
    .map((block) => block.id);

  // const stoneBlockIds = mcData.blocksArray.filter(block => block.name.includes('stone')).map(block => block.id);
  const stoneBlockIds = [];
  stoneBlockIds.push(mcData.blocksByName.stone.id);
  stoneBlockIds.push(mcData.blocksByName.cobblestone.id);
  // const stoneBlockNames = mcData.blocksArray.filter(block => block.name.includes('stone')).map(block => block.name);

  let matchingblocks: number[];

  // if we are looking for wood, we want to find all types of wood
  if (blockByName && blockByName.name.includes('log')) {
    console.error(`mining wood named: ${name}`);
    matchingblocks = woodBlockIds;
  } else if (
    blockByName &&
    (blockByName.name === 'stone' || blockByName.name === 'cobblestone')
  ) {
    matchingblocks = stoneBlockIds;
    // console.log(`mining stone: ${JSON.stringify(stoneBlockNames)}`);
  } else if (itemMode) {
    matchingblocks = mcData.blocksArray
      .filter((block) => block.drops.includes(itemByName.id))
      .map((block) => block.id);
  } else {
    matchingblocks = [blockByName.id];
  }

  // Find 50% more blocks than requested to account for blocks that are not mineable and to allow better mining of veins and trees
  const findBlocksCount = Math.ceil(count * 3);

  blocks = bot.findBlocks({
    matching: (block) => {
      return block === null
        ? false
        : matchingblocks.indexOf(block.type) >= 0 &&
        (!block.position ||
          blockHasNearbyAir(bot, { position: block.position }));
    },
    maxDistance: bot.nearbyBlockXZRange,
    count: findBlocksCount, // ignore count, find all blocks, filter later
  });

  // console.log(`Found ${blocks.length} blocks`);

  // If no blocks found, return
  if (blocks.length === 0) {
    const currentFailCount = getStatsData('mineBlockFailCount');
    // console.log(`Current fail count: ${currentFailCount}`);
    setStatsData('mineBlockFailCount', getStatsData('mineBlockFailCount') + 1);
    if (getStatsData('mineBlockFailCount') > 5) {
      bot.emit(
        'alteraBotTextObservation',
        'Mine resource failed too many times, so you decided to explore a bit to look for more resources.',
      );
      const result = await exploreNearby(bot);
      if (result) {
        setStatsData('mineBlockFailCount', 0);
        return bot.emit(
          'alteraBotEndObservation',
          `You couldn't mine ${originalName} after several attempts, so you explored a bit to look for more resources.`,
        );
      }
    }
    return bot.emit(
      'alteraBotEndObservation',
      `You couldn't find ${originalName} nearby, you should try to do something besides mining ${originalName}.`,
    );
  }

  setStatsData('mineBlockFailCount', 0); // reset the faily count

  if (isFlower(itemName)) {
    console.error(`mining a flower ${name}`);
    use_dig = true;
  }

  if (bot.pathfinder.isMoving()) {
    bot.pathfinder.stop();
    const movements = new Movements(bot);
    movements.canDig = true; // make sure the bot can dig
    bot.pathfinder.setMovements(movements);
  }

  const batchSize = 1;
  let successCount = 0;
  const maxAmount = blocks.length;

  while (blocks.length > 0 && successCount < count) {
    const entityPos = bot.entity.position.floored().offset(0.5, 0, 0.5); // center of the block we're currently stanging on
    // sort any unmined blocks by distance to the bot

    blocks.sort((a, b) => {
      return a.distanceTo(entityPos) - b.distanceTo(entityPos);
    });

    // reset the time out counter for each batch
    resetTimeout();

    if (isSignalAborted(signal)) {
      return bot.emit(
        'alteraBotEndObservation',
        'You decided to do something else and stopped mining.',
      );
    }

    // Calculate the end of the current batch but do not exceed the length of the blocks array
    const end = Math.min(batchSize, blocks.length); // currently only mining 1 block at a time
    const batchPositions = blocks.slice(0, end);

    // Convert Vec3 positions to block objects
    const batchBlocks = batchPositions.map((pos) => bot.blockAt(pos));
    // use_dig = true;
    try {
      if (use_dig) {
        for (const block of batchBlocks) {
          try {
            // Move the bot to the block
            const reachedBlock = await cancelableMove(bot, {
              goal: new GoalNear(
                block.position.x,
                block.position.y,
                block.position.z,
                4,
              ),
              signal,
            });
            if (reachedBlock.error) {
              console.log(
                `\x1b[31m[ Failed to reach block at ${block.position}: ${reachedBlock.error}]\x1b[0m`,
              );
              continue;
            }

            if (reachedBlock.canceled) {
              return bot.emit(
                'alteraBotEndObservation',
                'You decided to do something else and stopped mining.',
              );
            }

            // Adjust bot's aim to the block
            bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
            bot.waitForTicks(5);
            // Dig the block
            const digFunc = async function () {
              return bot.dig(block);
            };
            await asyncwrap({ func: digFunc, getStatsData, setStatsData });
            // Wait for .5 second
            const waitFunc = async function () {
              return bot.waitForTicks(10);
            };
            await asyncwrap({ func: waitFunc, setStatsData, getStatsData });
            const gotoFunc = async function () {
              return bot.pathfinder.goto(
                new GoalBlock(
                  block.position.x,
                  block.position.y,
                  block.position.z,
                ),
              );
            };
            await asyncwrap({ func: gotoFunc, setStatsData, getStatsData });
          } catch (error) {
            console.log(
              `\x1b[31m[ Failed to mine block at ${block.position}: ${error}]\x1b[0m`,
            );
          }
        }
      } else {
        console.log(
          `Mining ${successCount + 1} / ${count} blocks of ${name}`,
        );

        for (const block of batchBlocks) {
          try {
            bot.pathfinder.setGoal(null);
          } catch (er) { } // force a stop to the pathfinder
          // path to the block
          const reachedBlock = await cancelableMove(bot, {
            goal: new GoalNear(
              block.position.x,
              block.position.y,
              block.position.z,
              4,
            ),
            signal,
          });
          if (reachedBlock.error) {
            console.log(
              `\x1b[31m[ Failed to reach block at ${block.position}: ${reachedBlock.error}]\x1b[0m`,
            );
            continue;
          }

          if (reachedBlock.canceled) {
            return bot.emit(
              'alteraBotEndObservation',
              'You decided to do something else and stopped mining.',
            );
          }

          bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
          bot.waitForTicks(2); // wait just a bit to help looking at the block

          let finished = false;
          const collectBlockPromise = bot.collectBlock.collect(batchBlocks, {
            ignoreNoPath: true,
            signal,
          });

          let abortHandler: (() => void) | null = null;

          try {
            const abortPromise = new Promise((_, reject) => {
              if (signal) {
                abortHandler = () => {
                  signal.removeEventListener('abort', abortHandler);
                  reject(new Error('Cancelled'));
                };
                signal.addEventListener('abort', abortHandler);
              }
            });

            // needed to determine promise is finishing.
            collectBlockPromise.then(() => (finished = true));

            await Promise.race([collectBlockPromise, abortPromise]);
          } catch (err) {
            const results = err as Error;
            console.error(
              `Failed to mine block at ${batchBlocks[0].position} because: ${results.message}`,
            );
            continue;
          } finally {
            if (signal) {
              signal.removeEventListener('abort', abortHandler);
            }
          }

          if (finished) {
            successCount++;
            if (count > successCount) {
              // only emit if successCount is less than total count goal.
              // Otherwise messages like "You are mining and have mined 4 of 4 blocks of wood" will trigger CCM to say yes.
              // note: this will give the actual name of the block, not the original name, i.e. "oak_log" instead of "wood"
              bot.emit(
                'alteraBotTextObservation',
                `You are mining and have mined ${successCount} of ${count} blocks of ${name} so far`,
              );
            }
          } else {
            continue;
          }
        }

        if (successCount === count) {
          break;
        }
      }
      // Remove the blocks that were attempted to be mined
      blocks = blocks.slice(end);
    } catch (err) {
      const error = err as Error;
      return bot.emit(
        'alteraBotEndObservation',
        `ERROR: You tried to mine ${count} ${originalName} but couldn't because: ${error.message}`,
      );
    }
  }
  if (maxAmount < count) {
    return bot.emit(
      'alteraBotEndObservation',
      `You finished mining ${successCount} ${originalName} and there is no more nearby.`,
    );
  }
  return bot.emit(
    'alteraBotEndObservation',
    `You have finished mining ${originalName}.`,
  );
};

interface iTryHarvestOptions {
  toolName: string;
  block: minecraftData.IndexedBlock;
}
/**
 * Check if the bot can harvest a block with a specific tool.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {iTryHarvestOptions} options - The parameters for the skill function.
 * @param {string} options.toolName - The name of the tool to check.
 * @param {minecraftData.IndexedBlock} options.block - The block to check.
 *
 * @return {boolean} - Returns true if the bot can harvest the block with the tool, false otherwise.
 */
const tryHarvest = (bot: Bot, options: iTryHarvestOptions): boolean => {
  const { toolName, block } = options;
  const mcData = minecraftData(bot.version);

  if (!block.harvestTools) {
    return true;
  }
  const tool = mcData.itemsByName[toolName];
  if (tool) {
    return !!block.harvestTools[`${tool.id}`];
  }
  return false;
};

interface iCanBotMineOptions {
  blockByName: minecraftData.IndexedBlock;
  verbose?: boolean;
}
/**
 * Check if the bot can mine a block.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {iCanBotMineOptions} options - The parameters for the skill function.
 * @param {minecraftData.IndexedBlock} options.blockByName - The block to check.
 * @param {boolean} options.verbose - Whether to emit observation events. Default is true.
 *
 * @return {Promise<boolean>} - Returns true if the bot can mine the block, false otherwise.
 */
const canBotMine = async (
  bot: Bot,
  options: iCanBotMineOptions,
): Promise<boolean> => {
  const { blockByName, verbose = true } = options;
  const mcData = minecraftData(bot.version);
  // Enumeration of tools ordered by mining level
  const allMiningTools = [
    'wooden_pickaxe',
    'stone_pickaxe',
    'iron_pickaxe',
    'diamond_pickaxe',
    'netherite_pickaxe',
  ];

  // get all tools the bot currently has
  const botCurrentTools = bot.inventory.items().map((item) => item.name);

  // Check if any of the bot's current tools can harvest the block
  const canHarvest = botCurrentTools.some(
    (tool) =>
      mcData.itemsByName[tool] &&
      tryHarvest(bot, { toolName: tool, block: blockByName }),
  );

  if (canHarvest || !blockByName.harvestTools) {
    // console.log("Can mine the block with its current tools.");
    return true;
  } else {
    // If the bot cannot harvest the block with its current tools, determine the lowest level tool required
    const lowestLevelTool = allMiningTools.find((tool) =>
      tryHarvest(bot, { toolName: tool, block: blockByName }),
    );
    if (lowestLevelTool) {
      const toolName = mcData.itemsByName[lowestLevelTool].displayName;
      if (verbose) {
        bot.emit(
          'alteraBotEndObservation',
          `You tried to mine ${blockByName.displayName} but you need at least a ${toolName}, and you don't have it.`,
        );
      }
      return false;
    } else if (verbose)
      bot.emit(
        'alteraBotEndObservation',
        `It seems you cannot mine ${blockByName.displayName} with any tool in Minecraft.`,
      );

    return false;
  }

  return false;
};

/**
 * Check if a block is a flower.
 * @param {string} name - The name of the block.
 *
 * @return {boolean} - Returns true if the block is a flower, false otherwise.
 */
const isFlower = (name: string): boolean => {
  const minecraftFlowerNames = [
    'dandelion',
    'poppy',
    'blue_orchid',
    'allium',
    'azure_bluet',
    'red_tulip',
    'orange_tulip',
    'white_tulip',
    'pink_tulip',
    'oxeye_daisy',
    'cornflower',
    'lily_of_the_valley',
    'wither_rose',
    'sunflower',
    'lilac',
    'rose_bush',
    'peony',
  ];
  return minecraftFlowerNames.includes(name);
};

interface iCanBotMineItemOptions {
  itemByName: minecraftData.Item;
}
/**
 * Check if the bot can mine an item.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {iCanBotMineItemOptions} options - The parameters for the skill function.
 * @param {minecraftData.Item} options.itemByName - The item to check.
 *
 * @return {Promise<boolean>} - Returns true if the bot can mine the item, false otherwise.
 */
const canBotMineItem = async (
  bot: Bot,
  options: iCanBotMineItemOptions,
): Promise<boolean> => {
  const { itemByName } = options;
  const mcData = minecraftData(bot.version);
  // get all blocks that drop the item
  const blocks = mcData.blocksArray.filter((block) => {
    if (!block.drops) return false;
    return block.drops.includes(itemByName.id);
  });

  for (const block of blocks) {
    const canMine = await canBotMine(bot, { blockByName: block, verbose: false });
    if (canMine) {
      return true;
    }
  }

  return false;
};



