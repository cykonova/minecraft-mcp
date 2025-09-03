import {Bot} from 'mineflayer';
import {Item} from 'prismarine-item';

/**
 * Automatically equip the best sword in the bot's inventory.
 * @param {Bot} bot - The Mineflayer bot instance.
 *
 * @returns {void}
 */
export const autoEquipSword = (bot: Bot): void => {
  const items = bot.inventory.items();

  // Define the strength of swords based on material
  const swordStrength: {[key: string]: number} = {
    diamond_sword: 5,
    netherite_sword: 6,
    iron_sword: 3,
    stone_sword: 2,
    wooden_sword: 1,
  };

  // Find the best sword
  const bestSword = items?.reduce((best: Item | null, item: Item) => {
    return (swordStrength[item?.name] || 0) > (swordStrength[best?.name] || 0)
      ? item
      : best;
  }, null); // Initial best is an empty sword with strength 0

  if (bestSword && bestSword.name) {
    bot.equip(bestSword, 'hand').catch((err) => {
      if (err) {
        console.log(`Error equipping sword: ${err}`);
      } else {
        console.log(`Equipped ${bestSword.name}.`);
      }
    });
  } else {
    console.log('No sword found in inventory.');
  }
};


