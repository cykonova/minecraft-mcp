import {closest, distance} from 'fastest-levenshtein';
import mcData from 'minecraft-data';
import {Bot} from 'mineflayer';

interface IFindClosestItemNameParams {
  name: string;
}
/**
 * Finds and returns the item closest to the given name string.
 *
 * requires mcData
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {string} params.name - The name string to search for.
 * @return {string|null} The name of the item that has the closest matching name, or null if no close match is found.
 *
 */
export const findClosestItemName = (
  bot: Bot,
  params: IFindClosestItemNameParams,
): null | string => {
  const usedMcData = mcData(bot.version);
  const {name} = params;
  // simplify the name by lowercasing it and replacing spaces with underscores
  const itemNameSimplified = name.toLowerCase().replace(/ /g, '_');
  const closestItemName = closest(
    itemNameSimplified,
    Object.keys(usedMcData.itemsByName),
  );
  if (distance(itemNameSimplified, closestItemName) > 2) {
    return null;
  }

  return closestItemName;
};


