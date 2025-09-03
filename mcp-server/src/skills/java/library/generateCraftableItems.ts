import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';

/**
 * Generate a list of craftable items based on the bot's inventory and nearby crafting stations.
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 *
 * @return {[string, string[]]} - Returns a tuple with the first element being a string of nearby crafting stations and the second element being a list of craftable items.
 */
export const generateCraftableItems = (bot: Bot): [string, string[]] => {
  const mcData = minecraftData(bot.version);
  const CRAFTING_TABLE_BLOCK_ID = mcData.blocksByName.crafting_table.id;
  const FURNACE_BLOCK_ID = mcData.blocksByName.furnace.id;
  const NEARBY_DISTANCE = bot.nearbyBlockXZRange;

  // Check if the bot has a recipe book
  if (!bot.recipesFor) {
    console.log('Bot does not have a recipe book yet.');
    return ['', []];
  }

  const nearbyCraftingStations = [];

  if (
    bot.findBlock({
      matching: CRAFTING_TABLE_BLOCK_ID,
      maxDistance: NEARBY_DISTANCE,
    })
  ) {
    nearbyCraftingStations.push('crafting table');
  }

  // Currently furnace recipes will not surface in the crafting interface because it's tied to the crafting table

  // if (Boolean(bot.findBlock({
  //   matching: FURNACE_BLOCK_ID,
  //   distance: NEARBY_DISTANCE
  // }))) {
  //   nearbyCraftingStations.push("Furnace");
  // }

  const allRecipes = Object.values(mcData.recipes);

  // Filter items with crafting recipes
  const craftableItems = [];

  for (const recipe of allRecipes) {
    const { id: resultId } = recipe[0].result as { id: number };
    if (
      recipe.length &&
      mcData.items[resultId] &&
      requirementsMetForRecipe(bot, { recipe: recipe[0] })
    ) {
      // like computeRequiresTable says, requiresTable SHOULD EXIST and I don't know why it doesn't
      if (!(recipe[0] as any).requiresTable) {
        (recipe[0] as any).requiresTable = computeRequiresTable(recipe[0]);
      }
      if (
        !(
          (recipe[0] as any).requiresTable &&
          !nearbyCraftingStations.includes('crafting table')
        )
      ) {
        craftableItems.push(mcData.items[resultId]);
      }
    }
  }

  // if (nearbyCraftingStations.includes("Furnace")) {
  //   const furnaceRecipes = getFurnaceRecipes();
  //   for (const recipe of furnaceRecipes) {
  //     if (mcData.itemsByName[recipe.result] && mcData.itemsByName[recipe.ingredient] && bot.inventory.count(mcData.itemsByName[recipe.ingredient].id) > 0){
  //       craftableItems.push({name: recipe.result + " (by smelting)"});
  //     }
  //   }
  // }

  let activeCraftingStations = '';
  if (nearbyCraftingStations.length) {
    activeCraftingStations = nearbyCraftingStations.join(', ');
  }

  return [activeCraftingStations, craftableItems.map((item) => item?.name)];
};

interface IRequirementsMetForRecipeOptions {
  recipe: minecraftData.Recipe;
}
/**
 * Check if the bot has the required items to craft a recipe.
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {IRequirementsMetForRecipeOptions} options - The options for the function.
 * @param {minecraftData.Recipe} options.recipe - The recipe to check.
 *
 * @return {boolean} - Returns true if the bot has the required items to craft the recipe.
 */
const requirementsMetForRecipe = (
  bot: Bot,
  options: IRequirementsMetForRecipeOptions,
): boolean => {
  const { recipe } = options;
  const mcData = minecraftData(bot.version);
  let cost: minecraftData.Ingredients =
    [] as unknown as minecraftData.Ingredients;

  if ('ingredients' in recipe && recipe.ingredients) {
    cost = recipe.ingredients;
  }
  if ('inShape' in recipe && recipe.inShape) {
    cost = recipe.inShape.flat(2) as minecraftData.Ingredients;
  }

  // Make it an object of values
  const sortedCost = cost.reduce(function (acc: any, curr: any) {
    if (typeof curr === 'object' && curr !== null && 'id' in curr) {
      curr = curr.id;
    }

    return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc;
  }, {});

  // false if not enough inventory to make all the ones that we want
  for (const i of Object.keys(sortedCost)) {
    const d: minecraftData.Item = mcData.items[parseInt(i)];
    if (d && bot.inventory.count(d.id, d.metadata as any) - sortedCost[i] < 0)
      return false;
  }

  // TODO: use this to filter out what does and doesn't need a table
  // if (recipe.requiresTable) return true

  // otherwise true
  return true;
};

// Theoretically this function should not be needed, it is taken from https://github.com/PrismarineJS/prismarine-recipe/blob/master/lib/recipe.js#L37
// recipes SHOULD have requiresTable inherently but for some reason they don't??
/**
 * Check if a recipe requires a crafting table.
 * @param {minecraftData.Recipe[]} recipe - The recipe to check.
 *
 * @return {boolean} - Returns true if the recipe requires a crafting table.
 */
const computeRequiresTable = (recipe: minecraftData.Recipe): boolean => {
  let spaceLeft = 4;

  let x;
  let y;
  let row;
  if ('inShape' in recipe && recipe.inShape) {
    const shapes = recipe.inShape as minecraftData.Shape;
    if (shapes.length > 2) {
      return true;
    }
    for (y = 0; y < shapes.length; ++y) {
      row = shapes[y];
      if (row.length > 2) {
        return true;
      }
      for (x = 0; x < row.length; ++x) {
        if (row[x]) spaceLeft -= 1;
      }
    }
  }
  if ('ingredients' in recipe && recipe.ingredients) {
    const ingredients = recipe.ingredients as minecraftData.Ingredients;
    spaceLeft -= ingredients.length;
  }

  return spaceLeft < 0;
};


