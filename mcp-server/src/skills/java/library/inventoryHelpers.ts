import {Bot} from 'mineflayer';
import {Item} from 'prismarine-item';

interface GetInventoryOptions {
  useItemNames?: boolean;
}
/**
 * Gets the inventory of a bot and returns a dictionary with 'item name': count pairs.
 * @param {object} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {object} params
 * @returns {Object<string, number>}
 */
export const getInventory = (
  bot: Bot,
  {useItemNames = true}: GetInventoryOptions,
): Record<string, number> => {
  const inventory = bot.currentWindow || bot.inventory;
  const items = inventory.items();

  // Use item ids to interface with mineflayer api and item libraries
  if (!useItemNames) {
    return items.reduce(itemIdDict, {});
  }

  // else use item names that are human readable.
  return items.reduce(itemNameDict, {});
};

type ItemNameDict = {
  [key: string]: number;
};
const itemNameDict = (acc: ItemNameDict, cur: Item) => {
  if (cur.name && cur.count) {
    if (acc[cur.name]) {
      acc[cur.name] += cur.count;
    } else {
      acc[cur.name] = cur.count;
    }
  }
  return acc;
};

const itemIdDict = (acc: ItemNameDict, cur: Item) => {
  if (cur.type && cur.count) {
    // if both name and count property are defined
    if (acc[cur.type]) {
      // if the item is already in the dict
      acc[cur.type] += cur.count;
    } else {
      // if the item is not in the dict
      acc[cur.type] = cur.count;
    }
  }
  return acc;
};

interface FindMissingItemsOptions {
  useItemNames?: boolean;
}

/**
 * Finds the missing items in the bot's inventory to fulfill a recipe.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {Record<string, number>} requiredItems - Dictionary of required items. itemName and count pairs.
 * @param {FindMissingItemsOptions} options - Options for item name usage.
 * @returns {Record<string, number>} Dictionary of missing items. item and count pairs.
 */
export const findMissingItems = (
  bot: Bot,
  requiredItems: Record<string, number>,
  options: FindMissingItemsOptions = {},
  /**
   * Finds the missing items in the bot's inventory to fulfill a recipe.
   * @param {Bot} bot - The Mineflayer bot instance.
   * @param {Record<string, number>} requiredItems - Dictionary of required items. itemName and count pairs.
   * @param {FindMissingItemsOptions} options - Options for item name usage.
   * @returns {Record<string, number>} Dictionary of missing items. item and count pairs.
   */
): Record<string, number> => {
  const inventory = getInventory(bot, {useItemNames: options.useItemNames});
  const missingItems: Record<string, number> = {};

  for (const [item, count] of Object.entries(requiredItems)) {
    if (!inventory[item] || inventory[item] < count) {
      missingItems[item] = count - (inventory[item] ?? 0);
    }
  }

  const customToString = (missingItems: Record<string, number>): string => {
    return Object.entries(missingItems)
      .map(([itemName, count]) => `${count} more ${itemName}`)
      .join(', ');
  };

  Object.defineProperty(missingItems, 'toString', {
    value: customToString(missingItems),
    enumerable: false,
    configurable: true,
    writable: true,
  });

  return missingItems;
};

/**
 * Checks if the bot's inventory is full.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @returns {boolean} `true` if the bot's inventory is full, `false` otherwise.
 */
export const isInventoryFull = (bot: Bot): boolean => {
  return bot.inventory.items().length == 36;
};


