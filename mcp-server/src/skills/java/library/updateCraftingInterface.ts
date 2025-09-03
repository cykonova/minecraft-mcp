import {Bot} from 'mineflayer';

import {generateCraftableItems} from './generateCraftableItems.js';

/**
 * Update the crafting interface
 * @param {Bot} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 *
 * @return {void}
 */
export const updateCraftingInterface = (bot: Bot): void => {
  const skills = ['craft a new item', 'stop crafting'];
  const [description, craftables] = generateCraftableItems(bot);
  const interfaceObject = {
    title: 'Crafting Interface',
    description: description,
    additionalCraftableItems: craftables,
    skillNames: skills,
  };
  bot.setInterface(interfaceObject);
};


