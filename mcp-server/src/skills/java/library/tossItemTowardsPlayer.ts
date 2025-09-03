import { Bot } from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

import { isSignalAborted } from '../index.js';
import { findClosestItemName } from './findClosestItemName.js';
import { findClosestPlayerByName } from './findClosestPlayerByName.js';

interface ITossItemTowardsPlayerOptions {
  playerName: string;
  itemName: string;
  itemCount?: number;
  signal: AbortSignal;
}
/**
 * Give an item or items from a bot's inventory to someone.
 * this attempts to approach the player and toss the item to them
 *
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ITossItemTowardsPlayerOptions} options - The options for the skill function.
 * @param {string} options.playerName - The target person's name who you are giving something to
 * @param {string} options.itemName - The item to give, you must have it in your inventory
 * @param {number} options.itemCount - The amount to give, this should not be more than you have in your inventory
 * @param {AbortSignal} options.signal - The signal to abort the skill.
 *
 * Example usage:
 * tossItemTowardsPlayer(bot, {playerName: 'Notch', itemName: 'sitck', itemCount: 1}); // gives one stick to 'Notch'
 * tossItemTowardsPlayer(bot, {playerName: 'Herobrine', itemName: 'oak_log', itemCount: 5}); // gives 5 oak logs to 'Herobrine
 *
 */

export const tossItemTowardsPlayer = async (
  bot: Bot,
  options: ITossItemTowardsPlayerOptions,
): Promise<boolean> => {
  const defaultOptions = {
    itemCount: 1,
  };
  const { playerName, itemName, itemCount, signal } = {
    ...defaultOptions,
    ...options,
  };

  // max reasonable distance to trade is currently set to same as nearbyPlayerRadius
  const maxGiveDistance = bot.nearbyPlayerRadius;

  // Ensure target is a string
  if (typeof playerName !== 'string') {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: Invalid playerName: playerName must be a string.`,
    );
  }

  const closestItemName = findClosestItemName(bot, { name: itemName });

  if (!closestItemName) {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: You couldn't give ${itemName} because there's no item named ${itemName} in minecraft.`,
    );
  }

  const player = findClosestPlayerByName(bot, { name: playerName });

  if (!player) {
    console.log('Player not found!');
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: The player ${playerName} could not be found.`,
    );
  }

  const playerPos = player.position;
  const botPos = bot.entity.position;
  const distanceToPlayer = calculateDistance(botPos, playerPos);

  if (distanceToPlayer > maxGiveDistance) {
    bot.emit(
      'alteraBotEndObservation',
      `The player ${playerName} is too far away, you may want to go to their position at ${Math.floor(playerPos.x)}, ${Math.floor(playerPos.y)}, ${Math.floor(playerPos.z)}.`,
    );
    return;
  }

  const hasEnough = checkInventoryForItem(bot, closestItemName, itemCount);
  if (!hasEnough) {
    return bot.emit(
      'alteraBotEndObservation',
      `You do not have ${itemCount} of ${closestItemName} to give to ${playerName}.`,
    );
  }

  // Stop any existing movement / pathing
  if (bot.pathfinder.isMoving()) {
    await bot.pathfinder.stop();
  }

  await bot.waitForTicks(1);

  // Create a goal to move near the player
  const maxDistance = 3; // Maximum distance to toss item
  const {
    goals: { GoalNear },
  } = mineflayer_pathfinder;
  const goal = new GoalNear(playerPos.x, playerPos.y, playerPos.z, maxDistance);
  // Move close to the player
  try {
    let reachedGiveTarget = false;
    // start pathfinder to move to the player
    bot.pathfinder.goto(goal).then(() => {
      reachedGiveTarget = true;
    });

    // check for a cancel signal during pathing
    // in absolute worst case scenario, the skill will fully time out after 30 seconds
    while (!reachedGiveTarget) {
      if (isSignalAborted(signal)) {
        return bot.emit(
          'alteraBotEndObservation',
          `You decided to do something else instead of giving ${closestItemName}to ${playerName}.`,
        );
      }

      await bot.waitForTicks(1);
    }
  } catch (err) {
    const error = err as Error;
    console.log(
      `Failed to reach player in tossItemTowardsPlayer: ${error.message}`,
    );
    return bot.emit(
      'alteraBotEndObservation',
      `You couldn't reach to ${playerName} to give them ${closestItemName}.`,
    );
  }

  const itemForToss = bot.inventory
    .items()
    .find((item) => item.name === closestItemName);
  return tossItem(bot, { player, item: itemForToss, itemCount });
};

interface ITossItemOptions {
  player: any;
  item: {
    name: string;
    type: number;
  };
  itemCount: number;
}

/**
 *
 *   tossItem
 *   This function tosses an item towards a player by looking at them and tossing the item
 *   @param {Object} bot - The Mineflayer bot instance.
 *   @param {ITossItemOptions} options - The options for the skill function.
 *   @param {Object} options.player - The player entity to toss the item to.
 *   @param {Object} options.item - The item to toss.
 *   @param {number} options.itemCount - The amount of the item to toss.
 *
 **/
const tossItem = async (bot: Bot, options: ITossItemOptions) => {
  const { player, item, itemCount } = options;
  // console.log(`Tossing  ${item.name} towards ${player.username}`);

  // look slightly abot the player to help the toss happen
  await bot.lookAt(
    new Vec3(player.position.x, player.position.y + 1.6, player.position.z),
    true,
  );

  // wait for the look to finish, this should ensure that the bot is looking at the player before tossing the item
  await bot.waitForTicks(15);

  // console.log(`Tossing ${itemCount} of ${item.name} towards ${player.username}.`);

  try {
    await bot.toss(item.type, null, itemCount);
  } catch (err) {
    const error = err as Error;
    console.log(`Failed to toss item: ${error.message}`);
    return bot.emit(
      'alteraBotEndObservation',
      `You failed to drop ${itemCount} of ${item.name} for ${player.username}.`,
    );
  }

  return bot.emit(
    'alteraBotEndObservation',
    `You have given ${itemCount} of ${item.name} to ${player.username}.`,
  );
};

// This function calculates the Euclidean distance between two points in 3D space
const calculateDistance = (pos1: Vec3, pos2: Vec3): number => {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// This function checks if the bot has the specified item in its inventory
const checkInventoryForItem = (
  bot: Bot,
  itemName: string,
  neededQuantity: number,
): boolean => {
  const item = bot.inventory.items().find((item) => item.name === itemName);
  return item && item.count >= neededQuantity;
};


