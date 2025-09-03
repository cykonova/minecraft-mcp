import { Bot } from 'mineflayer';

import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { validateSkillParams } from '../index.js';
import { asyncwrap } from '../library/asyncwrap.js';
import { findClosestItemName } from '../library/findClosestItemName.js';
import { tossItemTowardsPlayer } from '../library/tossItemTowardsPlayer.js';
/**
 * Drops a specified item from the inventory on the ground.
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {string} params.name - The name of the item to drop.
 * @param {number} params.count - The number of items to drop. Defaults to 1 if not specified.
 * @param {string} params.userName - OPTIONAL: The name of the player you are trying to give the item to, this should be null if you're not trying to give the item to a player
 * @param {object} serviceParams - additional parameters for the skill function.
 *
 */

export const dropItem = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'dropItem';
  const requiredParams = ['name'];
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
  const { getStatsData, setStatsData } = serviceParams;

  const unpackedParams = {
    name: params.name,
    count: params.count ?? 1,
    playerName: params.userName ?? null,
    signal: serviceParams.signal,
  };

  if (
    unpackedParams.playerName != null &&
    unpackedParams.playerName != bot.username
  ) {
    return tossItemTowardsPlayer(bot, {
      playerName: unpackedParams.playerName,
      itemName: unpackedParams.name,
      itemCount: unpackedParams.count,
      signal: serviceParams.signal,
    });
  }

  // Find the closest item name from the input
  const closestItemName = findClosestItemName(bot, { name: unpackedParams.name });
  if (!closestItemName) {
    return bot.emit(
      'alteraBotEndObservation',
      `Error: There's no item named ${unpackedParams.name} in minecraft.`,
    );
  }
  unpackedParams.name = closestItemName;

  // Find the item in the bot's inventory
  const itemToDrop = bot.inventory
    .items()
    .find((item) => item.name === unpackedParams.name);

  if (!itemToDrop) {
    return bot.emit(
      'alteraBotEndObservation',
      `mistake: You don't have '${unpackedParams.name}'.`,
    );
  }

  try {
    // Drop the item
    const dropItemCount = Math.min(
      unpackedParams.count,
      countItems(bot, unpackedParams.name),
    );
    const tossFn = async function () {
      return bot.toss(itemToDrop.type, null, dropItemCount);
    };
    await asyncwrap({ func: tossFn, getStatsData, setStatsData });
    return bot.emit(
      'alteraBotEndObservation',
      `You dropped ${dropItemCount} ${unpackedParams.name}.`,
    );
  } catch (err) {
    const error = err as Error;
    console.log(`dropItem Error: ${error.message}`);
    return bot.emit(
      'alteraBotEndObservation',
      `You failed to drop ${unpackedParams.name}.`,
    );
  }
};

const countItems = (bot: Bot, itemName: string) => {
  return bot.inventory.items().reduce((total, item) => {
    return item.name === itemName ? total + item.count : total;
  }, 0);
};


