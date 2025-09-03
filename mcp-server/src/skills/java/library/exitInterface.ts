import {Bot} from 'mineflayer';

/**
 * Closes the interface that the bot is currently inside
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 *
 * @return {Promise<void>}
 */
export const exitInterface = async (bot: Bot): Promise<void> => {
  if (
    bot.openedInterface &&
    bot.currentInterface &&
    bot.currentInterface.title === 'Chest'
  ) {
    bot.openedInterface.close();
  }
  bot.setInterface(null, null, null);
};


