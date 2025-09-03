import { Bot, Chest } from 'mineflayer';

import { ISkillServiceParams } from '../../../types/skillType.js';
import { asyncwrap } from './asyncwrap.js';
import { exitInterface } from './exitInterface.js';
import { findClosestItemName } from './findClosestItemName.js';
import { isInventoryFull } from './inventoryHelpers.js';

type ItemToRetrieve = [string, number | null];

interface ITakeItemsOptions {
  itemsToRetrieve: any; // Can be string or array
  serviceParams: ISkillServiceParams;
}

/**
 * Retrieves specified amounts of items from an opened chest.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ITakeItemsOptions} options - Options for item retrieval.
 * @param {any} options.itemsToRetrieve - An array of tuples with item names and counts to retrieve,
 * or a single item name as a string.
 * @param {ISkillServiceParams} options.serviceParams - Parameters related to the skill service.
 *
 * @returns {Promise<boolean>} A promise that resolves to true if items have been successfully retrieved, false otherwise.
 */

export const takeItems = async (
  bot: Bot,
  options: ITakeItemsOptions,
): Promise<boolean> => {
  const { itemsToRetrieve, serviceParams } = options;

  // Convert itemsToRetrieve to the required format
  let formattedItemsToRetrieve: ItemToRetrieve[];

  if (typeof itemsToRetrieve === 'string') {
    // If it's a string, convert it to an array
    formattedItemsToRetrieve = [[itemsToRetrieve, null]];
  } else if (Array.isArray(itemsToRetrieve)) {
    // If it's an array of values
    formattedItemsToRetrieve = itemsToRetrieve.map((item) => {
      if (typeof item === 'string') {
        return [item, null] as ItemToRetrieve;
      } else if (Array.isArray(item)) {
        const name = item[0];
        const closestItemName = findClosestItemName(bot, {
          name,
        });

        if (!closestItemName) {
          bot.emit(
            'alteraBotEndObservation',
            `You tried to retrieve ${name} from a nearby chest but there's no item named ${name} in Minecraft.`,
          );
          return null;
        }
        const amount = item[1] ?? null;
        return [closestItemName, amount] as ItemToRetrieve;
      }
      return null;
    }).filter(item => item !== null) as ItemToRetrieve[];
  } else {
    bot.emit('alteraBotEndObservation', `Invalid itemsToRetrieve format.`);
    return false;
  }

  if (
    !bot.openedInterface ||
    !bot.currentInterface ||
    bot.currentInterface.title !== 'Chest'
  ) {
    await exitInterface(bot);
    const failedItems = formattedItemsToRetrieve
      .map(([name, amount]) => (amount ? `${amount} ${name}` : name))
      .join(', ');
    return bot.emit(
      'alteraBotEndObservation',
      `You need to open a chest first before retrieving items, meaning you did not retrieve ${failedItems}.`,
    );
  }

  const [retrievedItems, unretrievedItems] = await retrieveItemsFromChest(bot, {
    chest: bot.openedInterface,
    itemsToRetrieve: formattedItemsToRetrieve,
    serviceParams,
  });

  await exitInterface(bot);

  let message = 'You have ';
  if (retrievedItems.length) {
    message += 'retrieved ' + retrievedItems.join(', ');
  }
  if (unretrievedItems.length) {
    if (retrievedItems.length) {
      message += ' and ';
    }
    message += 'failed to retrieve ' + unretrievedItems.join(', ');
  }

  if (isInventoryFull(bot)) {
    message +=
      ' but your inventory is full now, so you cannot retrieve any more items.';
  }

  bot.emit('alteraBotEndObservation', message);

  return true; // Successful completion
};

interface IRetrieveItemsFromChestOptions {
  chest: Chest;
  itemsToRetrieve: Array<[string, number | null]>;
  serviceParams: ISkillServiceParams;
}
/**
 * /**
 * Retrieves specified items from a chest using the Mineflayer bot instance.
 *
 * This function attempts to retrieve items listed in the `itemsToRetrieve` array from the given `chest`.
 * It checks if the bot's inventory is full before proceeding and emits a message if an item is not found.
 *
 * @param {Bot} bot - The Mineflayer bot instance used for retrieving items.
 * @param {IRetrieveItemsFromChestOptions} options - Options for item retrieval.
 * @param {Chest} options.chest - The chest object from which to retrieve items.
 * @param {Array<[string, number | null]>} options.itemsToRetrieve - An array of items to retrieve, where each item is represented as a tuple of its name and the desired amount.
 * @param {ISkillServiceParams} options.serviceParams - Additional parameters for the skill function.
 * @returns {Promise<[string[], string[]]>} - A promise that resolves to an array containing:
 *   - An array of retrieved item names.
 *   - An array of unretrieved item names, indicating which items could not be retrieved.
 *
 */
export const retrieveItemsFromChest = async (
  bot: Bot,
  options: IRetrieveItemsFromChestOptions,
): Promise<[string[], string[]]> => {
  const { chest, itemsToRetrieve, serviceParams } = options;
  const retrievedItems: any[] = [];
  const unretrievedItems: any[] = [];
  for (const [name, amount] of itemsToRetrieve) {
    if (isInventoryFull(bot)) {
      return [retrievedItems, unretrievedItems];
    }

    const closestItemName = findClosestItemName(bot, { name });
    if (!closestItemName) {
      bot.emit(
        'alteraBotTextObservation',
        `You tried to retrieve ${name} from a nearby chest but there's no item named ${name} in Minecraft.`,
      );
      continue;
    }
    const [retrieved, item] = await retrieveSpecificItemFromChest(bot, {
      chest,
      itemName: closestItemName,
      amount,
      serviceParams,
    });
    if (retrieved) {
      retrievedItems.push(item); // Ensure item is a string
    } else {
      unretrievedItems.push(item); // Ensure item is a string
    }
  }
  return [retrievedItems, unretrievedItems];
};

interface IRetrieveSpecificItemFromChestOptions {
  chest: Chest;
  itemName: string;
  amount: number | null;
  serviceParams: ISkillServiceParams;
}
/**
 * Retrieves a specific item from the specified chest.
 *
 * This function attempts to withdraw a specified amount of an item from the chest.
 * If the item is not found or the bot's inventory is full, appropriate messages are emitted,
 * and the function returns a failure status.
 *
 * @param {Bot} bot - The Mineflayer bot instance used for item retrieval.
 * @param {IRetrieveSpecificItemFromChestOptions} options - Options for item retrieval.
 * @param {Chest} options.chest - The opened chest interface from which to retrieve the item.
 * @param {string} options.itemName - The name of the item to retrieve from the chest.
 * @param {number | null} options.amount - The amount of the item to retrieve, or null to retrieve all available.
 * @param {ISkillServiceParams} options.serviceParams - Additional parameters for the skill function.
 * @returns {Promise<[boolean, string]>} - A promise that resolves to a tuple:
 *   - A boolean indicating whether the retrieval was successful.
 *   - A string describing the item that was attempted to be retrieved, including the amount if applicable.
 *
 */
export const retrieveSpecificItemFromChest = async (
  bot: Bot,
  options: IRetrieveSpecificItemFromChestOptions,
): Promise<[boolean, string]> => {
  const { chest, itemName, amount = null, serviceParams } = options;
  const { getStatsData, setStatsData } = serviceParams;
  const itemsToRetrieve = chest
    .containerItems()
    .filter((chestItem: any) => chestItem.name === itemName);
  const totalCountItemsToRetrieve = itemsToRetrieve.reduce(
    (acc: number, item: any) => acc + item.count,
    0,
  );
  let item = itemName;
  if (amount) {
    item += ' x' + amount;
  }

  if (totalCountItemsToRetrieve === 0 || !itemsToRetrieve.length) {
    bot.emit(
      'alteraBotEndObservation',
      `You tried to retrieve ${itemName} from a nearby chest but there is no ${itemName} found in this chest.`,
    );
    return [false, item];
  }

  if (isInventoryFull(bot)) {
    bot.emit('alteraBotTextObservation', '---------');
    return [false, item];
  }

  try {
    const withdrawAmount =
      !amount || amount > totalCountItemsToRetrieve
        ? totalCountItemsToRetrieve
        : amount;
    await asyncwrap({
      func: async () => {
        return chest.withdraw(itemsToRetrieve[0].type, null, withdrawAmount);
      },
      getStatsData,
      setStatsData,
    });
    if (totalCountItemsToRetrieve >= amount) {
      item = itemName;
      if (withdrawAmount) {
        item += ' x' + withdrawAmount;
      }
    }
    return [true, item];
  } catch (error) {
    console.error(
      ` tried to retrieve ${itemName} from a nearby chest but failed because: ${error}`,
    );
    return [false, item];
  }
};


