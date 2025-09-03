import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
import { Recipe } from 'prismarine-recipe';

import { ISkillServiceParams } from '../../../types/skillType.js';
import { isSignalAborted } from '../index.js';
import { asyncwrap } from './asyncwrap.js';
import { findClosestItemName } from './findClosestItemName.js';
import { getInventory } from './inventoryHelpers.js';
import { updateCraftingInterface } from './updateCraftingInterface.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

interface iCraftAnItemOptions {
  name: string;
  count: number;
  signal: ISkillServiceParams['signal'];
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * Craft specified item in Minecraft.
 *
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param options
 * @param {string} options.name - The name of the item to craft.
 * @param {number} options.count - The number of items to craft. Default is 1. Maximum is 4.
 *
 * returns: true if item was crafted successfully, false otherwise
 */
export const craftAnItem = async (
  bot: Bot,
  options: iCraftAnItemOptions,
): Promise<[status: boolean, text: string]> => {
  let { name, count, setStatsData, getStatsData, signal } = options;
  const mcData = minecraftData(bot.version);
  if (count < 1) {
    return [false, `ERROR: You can't craft nothing!`];
  }
  // Capping count without alerting the bot may be confusing it
  // Cap count to 64
  // count = Math.min(count, 64);

  // constants
  const CRAFTING_TABLE_BLOCK_ID = mcData.blocksByName.crafting_table.id;
  const CRAFTING_TABLE_ITEM_ID = mcData.itemsByName.crafting_table.id;
  const NEARBY_DISTANCE = bot.nearbyBlockXZRange;

  if (typeof name !== 'string') {
    return [false, 'ERROR: the name parameter for crafting must be a string'];
  }

  let nameLower = name.toLowerCase();

  // Fix for agents trying to craft generic "bed" instead of specific color bed
  // TODO: Make this more robust to handle other items that vary by color
  if (nameLower.includes('bed')) {
    // beds are named color_bed,
    // if the closestItemName is not a bed, then we need to find the closest bed color based on the wool in the inventory

    // check for the different color wool and types of planks in their inventory
    const inventoryWool = getMostOfInInventory(bot, 'wool');
    const inventoryPlanks = getMostOfInInventory(bot, 'planks');

    // if they don't have enough wool and / or planks in their inventory they can't craft a bed
    if (inventoryWool.amount < 3 && inventoryPlanks.amount < 3) {
      if (inventoryWool.amount < 3) {
        return [
          false,
          `you need ${3 - inventoryWool.amount} more wool and ${3 - inventoryPlanks.amount} more planks to craft a bed.`,
        ];
      }
    }

    if (inventoryWool.amount < 3) {
      return [
        false,
        `you need ${3 - inventoryWool.amount} more wool to craft a bed.`,
      ];
    }

    if (inventoryPlanks.amount < 3) {
      return [
        false,
        `you need ${3 - inventoryPlanks.amount} more planks to craft a bed.`,
      ];
    }

    const craftColor = inventoryWool.itemName.replace('_wool', '');
    nameLower = craftColor + '_bed';
    console.log('Crafting bed: ' + name + ' -> ' + nameLower);
    name = nameLower; // overriding the original name with the new name
  }

  let closestItemName = findClosestItemName(bot, { name: nameLower });

  // Find the closest item name from the input
  if (!closestItemName) {
    if (nameLower.includes('wood') && nameLower.includes('plank')) {
      console.log('Crafting planks from wood - ' + nameLower);
      closestItemName = findWoodInInventory(bot);
      if (closestItemName === null) {
        return [
          false,
          ` you don't have any sort of wood in your inventory to make planks with.  You should mine some.`,
        ];
      } else {
        // get the name of the wood by remove the _log from closestItemName
        closestItemName = closestItemName.replace(/_log/g, '');
        closestItemName += '_planks';
      }
    } else
      return [
        false,
        `mistake: you couldn't find the item ${name} in minecraft.?`,
      ];
  }

  const itemName = closestItemName;
  const itemNameDisplayed = itemName.replace(/_/g, ' ');

  const targetItem = mcData.itemsByName[itemName];
  if (!targetItem) {
    return [
      false,
      `mistake: you couldn't find the item ${itemNameDisplayed} in minecraft.`,
    ];
  }

  const recipesWithoutCraftingTable = bot.recipesFor(
    targetItem.id,
    null,
    0,
    false,
  );
  const recipes = bot.recipesFor(targetItem.id, null, 0, true);

  // Check if item is craftable.
  if (!recipes || recipes.length == 0) {
    return [
      false,
      `mistake: you couldn't figure out a recipe for ${itemNameDisplayed}.`,
    ];
  }

  // find nearby crafting table if exists
  const nearbyCraftingTable = bot.findBlock({
    matching: CRAFTING_TABLE_BLOCK_ID,
    maxDistance: NEARBY_DISTANCE,
  });

  let botInventory = getInventory(bot, { useItemNames: false });
  // console.log(botInventory);

  // if no nearby crafting table and item has no recipes that don't require a crafting table
  if (
    !nearbyCraftingTable &&
    (!recipesWithoutCraftingTable || recipesWithoutCraftingTable.length === 0)
  ) {
    if (botInventory?.[CRAFTING_TABLE_ITEM_ID] > 0) {
      return [
        false,
        `you need to place down a crafting table to craft ${itemNameDisplayed}. You have one in your inventory.`,
      ];
    } else {
      return [false, `you need a crafting table.`];
    }
  }
  const [result, crafts, info] = tryCraftItem(bot, {
    inventory: botInventory,
    itemName,
    count,
    layer: 0,
    craftingTable: Boolean(nearbyCraftingTable),
  });

  botInventory = null;

  if (!result) {
    return [false, info];
  }

  console.log('Doing full craft');
  let output: [status: boolean, text: string] = [false, ''];
  try {
    // Go to crafting table if one exists and is necessary
    // TODO: Check if the bot is already at the crafting table
    if (nearbyCraftingTable) {
      // const botPos = bot.entity.position;
      const tablePos = nearbyCraftingTable.position;

      // check if the bot is already near the crafting table
      if (bot.entity.position.distanceTo(tablePos) > 5) {
        bot.emit(
          'alteraBotTextObservation',
          `You are going to the nearby crafting table at ${tablePos.x}, ${tablePos.y}, ${tablePos.z} to craft ${count} '${itemNameDisplayed}'.`,
        );
      }

      // todo: make this pathing cancelable
      const gotoFunc = async function () {
        return bot.pathfinder.goto(
          // new GoalLookAtBlock(tablePos, bot.world)
          new GoalNear(tablePos.x, tablePos.y, tablePos.z, 3),
        );
      };
      await asyncwrap({ func: gotoFunc, setStatsData, getStatsData });
      await bot.lookAt(tablePos.offset(0.5, 0.5, 0.5)); // Look at the crafting table
    }

    if (isSignalAborted(signal)) {
      return [false, 'You decided to do something else and stop crafting.'];
    }

    // TODO: should test adding this back in but inside crafts loop
    // bot.emit('alteraBotTextObservation', `You are starting to craft ${count} '${itemNameDisplayed}'`);
    let intermediateItemCounter = 1;
    for (const [craft, count] of crafts) {
      if (isSignalAborted(signal)) {
        return [false, 'You decided to do something else and stop crafting.'];
      }

      if (nearbyCraftingTable && nearbyCraftingTable.position) {
        await bot.lookAt(nearbyCraftingTable.position, true);
        // wait for one game tick, to make sure the bot is looking at the crafting table
        await bot.waitForTicks(10);
      }

      for (let n = 0; n < count; n++) {
        console.log(
          `Crafting ${mcData.items[craft.result.id].name} ${n + 1}/${count}`,
        );
        const craftFunc = async function () {
          return await bot.craft(craft, 1, nearbyCraftingTable);
        };
        await asyncwrap({ func: craftFunc, setStatsData, getStatsData });
        await bot.waitForTicks(1);
      }
      await bot.waitForTicks(20);
      const intermediateItem = mcData.items[craft.result.id];
      if (crafts.length != intermediateItemCounter) {
        // console.log(`Intermediate crafted item name: ${intermediateItemName} for the final item ${itemNameDisplayed}`);
        intermediateItemCounter++;
      }

      // Equip crafted item
      const item = bot.inventory.findInventoryItem(
        intermediateItem.id,
        null,
        false,
      );
      if (item) {
        const equipFunc = async function () {
          return bot.equip(item, 'hand');
        };
        await asyncwrap({ func: equipFunc, setStatsData, getStatsData });
      } else {
        console.error(
          `ERROR: Could not find ${intermediateItem.name} in inventory`,
        );
        // throw new Error(`Could not find ${intermediateItemName} in inventory`);
      }
    }

    // At this point, item has to be crafted successfully, else it would have generated an error message through bot.craft

    output = [true, `${count} ${itemNameDisplayed}`];
  } catch (err) {
    const error = err as Error;
    output = [false, `due to an error: ${error.message}`];
  } finally {
    // Update the crafting interface to update the craftable items
    // console.log(`CURRENT INTERFACE INSIDE CRAFT AN ITEM: ${JSON.stringify(bot.currentInterface)}`);

    if (
      bot.currentInterface &&
      bot.currentInterface.title === 'Crafting Interface'
    ) {
      updateCraftingInterface(bot);
      // console.log(`UPDATED INTERFACE INSIDE CRAFT AN ITEM: ${JSON.stringify(bot.currentInterface)}`);
    } else {
      // console.log(`DID NOT UPDATE INTERFACE INSIDE CRAFT AN ITEM: ${JSON.stringify(bot.currentInterface)}`);
    }
    return output;
  }
};

type RecipeTuple = [recipie: Recipe, minCraftsRequired: number, text: string];
type TryCraftItemReturnType = [boolean, RecipeTuple[], string];
interface ITryCraftItemOptions {
  inventory: Record<string, number>;
  itemName: string;
  count: number;
  layer: number;
  craftingTable: boolean;
}
/**
 * Try to craft an item
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {ITryCraftItemOptions} options - The options for the function.
 * @param {Record<string, number>} options.inventory - The bot's inventory.
 * @param {string} options.itemName - The name of the item to craft.
 * @param {number} options.count - The number of items to craft.
 * @param {number} options.layer - The layer of recursion.
 * @param {boolean} options.craftingTable - Whether a crafting table is required.
 *
 * @return {TryCraftItemReturnType} - Returns a tuple with a boolean indicating if the item was crafted successfully, an array of recipes, and a string with a message.
 */
// TODO: make this cancelable
const tryCraftItem = (
  bot: Bot,
  options: ITryCraftItemOptions,
): TryCraftItemReturnType => {
  let { inventory, itemName, count, layer, craftingTable } = { ...options };
  // let startTime = Date.now(); profiling - never showed more thant a few ms
  let crafts: RecipeTuple[] = [];
  const mcData = minecraftData(bot.version);
  const item = mcData.itemsByName[itemName];
  // get recipes for the item
  let recipes = bot.recipesFor(item.id, null, 0, craftingTable);

  if (layer > 5) {
    return [false, [], ''];
  }

  if (!recipes || recipes.length == 0) {
    // console.log("can't craft " + JSON.stringify(item));
    return [
      false,
      [],
      'There are no recipes for ' + itemName + ' that you can access currently',
    ];
  }

  console.log(`Trying to craft ${item.name}`);

  // search for available recipes.
  let retryCraft = true;
  let craftingRetriesLeft = -1;
  let min = Number.MAX_SAFE_INTEGER;
  let minMissingIngredientsStr = '';
  let minRecipe;
  let minRecipes: Recipe[] = [];
  let minCraftsRequired = 1;
  while (retryCraft) {
    retryCraft = false;
    min = Number.MAX_SAFE_INTEGER;
    minMissingIngredientsStr = '';
    minRecipe = null;
    minRecipes = [];
    for (const recipe of recipes) {
      (recipe as any).missingItems = {};
      let missingItems = 0;
      let missingItemsStr = '';
      const craftsRequired = Math.ceil(count / recipe.result.count); // number of times the recipe needs to be crafted to fulfill `count`

      // iterate through outputs
      const inputs = recipe.delta.filter((item) => item.count < 0);

      for (const inputItem of inputs) {
        const item = mcData.items[inputItem.id];
        const requiredCount = inputItem.count * craftsRequired * -1; // inputItem.count is negative if it's an input so we multiply by -1.
        const numInInventory = inventory?.[inputItem.id] || 0;
        if (numInInventory === 0) {
          missingItems += requiredCount;
          missingItemsStr += ` ${requiredCount} more '${item.name}'`;
          (recipe as any).missingItems[`${item.name}`] = requiredCount;
        } else if (numInInventory < requiredCount) {
          const numMissing = requiredCount - numInInventory;
          missingItems += numMissing;
          (recipe as any).missingItems[`${item.name}`] = numMissing;
          missingItemsStr += ` ${numMissing} more '${item.name}'`;
        }
      }

      if (missingItems < min) {
        minRecipe = recipe;
        min = missingItems;
        minMissingIngredientsStr = missingItemsStr;
        minCraftsRequired = craftsRequired;
        minRecipes = [recipe];
      } else if (missingItems === min) {
        minRecipes.push(recipe);
      }
    }

    if (craftingRetriesLeft === -1 && (minRecipe as any).missingItems) {
      craftingRetriesLeft = Object.keys((minRecipe as any).missingItems).length;
    }
    if (craftingRetriesLeft > 0) {
      for (const recipe of minRecipes) {
        let canCraftAll = true;
        let info = '';
        let materialCrafts: RecipeTuple[] = [];
        for (const [item, count] of Object.entries((recipe as any).missingItems)) {
          let currentCrafts = [];
          [canCraftAll, currentCrafts, info] = tryCraftItem(bot, {
            inventory,
            itemName: item,
            count: count as number,
            layer: layer + 1,
            craftingTable,
          });
          materialCrafts = materialCrafts.concat(currentCrafts);
          if (!canCraftAll) {
            break;
          }
        }
        if (!canCraftAll) {
          continue;
        }
        crafts = crafts.concat(materialCrafts);
        retryCraft = true;
        craftingRetriesLeft--;
        break;
      }
    }
  }

  if (min !== 0) {
    // if no fulfilled recipes output all recipes
    // console.log(itemName + " is not craftable");
    let recNumber = 0;
    let allPossibleRecipesMessage;
    const ALL_POSSIBLE_RECIPES_MESSAGE_PREFIX = `you still need`;
    const MAX_NUMBER_OF_RECIPES_TO_DISPLAY = 8;

    // Check if there are too many recipes to display and if itemName is wooden_pickaxe
    if (minRecipes.length === 1) {
      // If there's a single "absolute min" recipe
      const minRecipe = minRecipes[0];
      const itemsNeeded = Object.entries((minRecipe as any).missingItems).map(
        ([itemName, numMissing]) => {
          return ` ${numMissing} more ${itemName.replace(/_/g, ' ')}`;
        },
      );
      // Prepend ALL_POSSIBLE_RECIPES_MESSAGE_PREFIX to the specific message for the "absolute min" recipe
      allPossibleRecipesMessage =
        ALL_POSSIBLE_RECIPES_MESSAGE_PREFIX + itemsNeeded.join(', ');
    } else {
      recipes = recipes.slice(0, MAX_NUMBER_OF_RECIPES_TO_DISPLAY);
      allPossibleRecipesMessage = recipes.reduce(
        (msg, recipe, index, array) => {
          recNumber += 1;
          for (const [itemName, numMissing] of Object.entries(
            (recipe as any).missingItems,
          )) {
            msg += ` ${numMissing} more ${itemName.replace(/_/g, ' ')}`;
          }
          // Add ' or\n' if it's not the last recipe
          if (index < array.length - 1) {
            msg += `, or`;
          }
          return msg;
        },
        ALL_POSSIBLE_RECIPES_MESSAGE_PREFIX,
      );
    }
    return [false, [], allPossibleRecipesMessage];
  }
  // console.log(itemName + " is craftable");
  // Otherwise we have all item prerequisites craftable

  // console.log("'Crafting' " + item.name);

  for (const inputItem of minRecipe.delta.filter((item) => item.count < 0)) {
    const item = mcData.items[inputItem.id];
    const removeCount = inputItem.count * minCraftsRequired * -1; // inputItem.count is negative if it's an input so we multiply by -1.
    // "Craft" the item by removing the required items from the inventory
    inventory = removeItemsFromInventory({
      inventory,
      itemType: inputItem.id,
      countToRemove: removeCount,
    });
  }
  // Add the "crafted" item to the inventory
  inventory = addItemsToInventory({
    inventory,
    itemType: item.id,
    count: minRecipe.result.count * minCraftsRequired,
  });
  crafts.push([minRecipe, minCraftsRequired, '']);
  /* let finishTime = Date.now(); //profiling, never showed more than a few ms
  let timeTaken = finishTime - startTime;
 
  if(timeTaken > 5000) {
    console.warn(`Warning: took more than 5 seconds to find recipes for ${minCraftsRequired} ${item.name}`);
  }
  else
    console.log(`Took ${timeTaken}ms to find recipes for ${minCraftsRequired} ${item.name}`);
  */
  return [true, crafts, ''];
};

interface IRemoveItemsFromInventory {
  inventory: Record<string, number>;
  itemType: number;
  countToRemove: number;
}
/**
 * Remove items from the inventory
 * @param {IRemoveItemsFromInventory} options - The options for the function.
 * @param {Record<string, number>} options.inventory - The bot's inventory.
 * @param {number} options.itemType - The item type to remove.
 * @param {number} options.countToRemove - The number of items to remove.
 *
 * @return {Record<string, number>} - Returns the updated inventory.
 */
const removeItemsFromInventory = (
  options: IRemoveItemsFromInventory,
): Record<string, number> => {
  const { inventory, itemType, countToRemove } = { ...options };
  if (inventory?.[itemType]) {
    if (inventory[itemType] >= countToRemove) {
      inventory[itemType] -= countToRemove;
    }
  }
  return inventory;
};

interface IAddItemsToInventory {
  inventory: Record<string, number>;
  itemType: number;
  count: number;
}
/**
 * Add items to the inventory
 * @param {IAddItemsToInventory} options - The options for the function.
 * @param {Record<string, number>} options.inventory - The bot's inventory.
 * @param {number} options.itemType - The item type to add.
 * @param {number} options.count - The number of items to add.
 *
 * @return {Record<string, number>} - Returns the updated inventory.
 */
const addItemsToInventory = (
  options: IAddItemsToInventory,
): Record<string, number> => {
  const { inventory, itemType, count } = { ...options };
  if (inventory?.[itemType]) {
    inventory[itemType] += count;
  } else {
    inventory[itemType] = count;
  }
  return inventory;
};

/**
 * Find the type of wood in the bot's inventory
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 *
 * @return {string|null} - Returns the name of the wood in the bot's inventory or null if no wood is found.
 */
const findWoodInInventory = (bot: Bot): string | null => {
  const mcData = minecraftData(bot.version);
  const woodLogIds = mcData.itemsArray
    .filter((item) => item.name.includes('log'))
    .map((item) => item.id);

  let woodAmount = 0;
  let foundWood = null;
  const botInventory = getInventory(bot, { useItemNames: false });

  // find the highest quantity of any type of wood in the inventory
  // check for each possible wood type in the inventory
  for (const itemId of woodLogIds) {
    if (botInventory?.[itemId]) {
      if (botInventory[itemId] > woodAmount) {
        woodAmount = botInventory[itemId];
        foundWood = itemId;
      }
    }
  }

  // if we found wood, return the name of the wood
  // otherwise return null
  if (foundWood) {
    return mcData.items[foundWood].name;
  } else return null;
};

/** getMostOfInInventory
 * get the most of an item type, like "wool" or "planks" that the bot has in its inventory
 * @param{Bot} bot - the bot object
 * @param{string} itemType - the type of item to search for such as "wool" or "planks"
 * returns the name of the item and the amount of that item in an object
 */
const getMostOfInInventory = (bot: Bot, itemType: string) => {
  const mcData = minecraftData(bot.version);
  const items = Object.keys(mcData.itemsByName).filter((item) =>
    item.includes(itemType),
  );

  console.log('searching for ' + itemType + ' in items: ' + items);

  let most = 0;
  let item = null;
  const botInventory = getInventory(bot, { useItemNames: false });
  for (const i of items) {
    const itemId = mcData.itemsByName[i].id;
    if (botInventory?.[itemId] && botInventory[itemId] > most) {
      most = botInventory[itemId];
      item = i;
    }
  }
  console.log(
    'found most of ' + itemType + ' in inventory: ' + item + ' x' + most,
  );

  return { itemName: item, amount: most };
};



