import {Bot} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {asyncwrap} from '../library/asyncwrap.js';
import {validateSkillParams} from '../index.js';

/**
 * Eat any food available in the bot's inventory.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params
 * @param {ISkillServiceParams} serviceParams - additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot is hungry, false otherwise.
 */
export const eatFood = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const minecraftFoodNames = [
    'apple',
    'baked_potato',
    'beetroot',
    'beetroot_soup',
    'bread',
    'cake',
    'carrot',
    'chorus_fruit',
    'cooked_chicken',
    'cooked_cod',
    'cooked_mutton',
    'cooked_porkchop',
    'cooked_rabbit',
    'cooked_salmon',
    'cookie',
    'dried_kelp',
    'enchanted_golden_apple',
    'glow_berries',
    'golden_apple',
    'golden_carrot',
    'honey_bottle',
    'melon_slice',
    'mushroom_stew',
    'poisonous_potato',
    'potato',
    'pufferfish',
    'pumpkin_pie',
    'rabbit_stew',
    'beef',
    'chicken',
    'cod',
    'mutton',
    'porkchop',
    'rabbit',
    'salmon',
    'rotten_flesh',
    'spider_eye',
    'cooked_beef',
    'suspicious_stew',
    'sweet_berries',
    'tropical_fish',
  ];
  const {getStatsData, setStatsData} = serviceParams;

  // check to see if the bot is hungry
  if (bot.food < 20) {
    console.log(`Bot is hungry and has ${bot.food} food points.`);
  } else {
    return bot.emit(
      'alteraBotEndObservation',
      `You decided not to eat since you are not hungry.`,
    );
  }

  for (const foodName of minecraftFoodNames) {
    const food = bot.inventory.findInventoryItem(foodName as any, null, false);

    if (food !== null) {
      console.log(`Found item: ${foodName}`);
      bot.equip(food, 'hand');
      console.log(`Eating: ${foodName}`);
      try {
        await asyncwrap({
          func: async () => {
            console.log(`${foodName} consumed!`);
            return bot.consume();
          },
          getStatsData,
          setStatsData,
        });
      } catch (error) {
        console.log(`Error consuming ${foodName}: ${error}`);
      }

      return bot.emit(
        'alteraBotEndObservation',
        `You finished eating one ${foodName}`,
      );
    }
  }

  return bot.emit(
    'alteraBotEndObservation',
    `You tried to eat but you have no food to eat!`,
  );
};


