import {Bot} from 'mineflayer';

export interface ITeleportToLocationOptions {
  x: number | null;
  y: number | null;
  z: number | null;
  verbose?: boolean;
}
/**
 * Teleports the bot to the specified coordinates.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ITeleportToLocationOptions} options - The options object.
 * @param {number} options.x - The x coordinate of the target location.
 * @param {number} options.y - The y coordinate of the target location.
 * @param {number} options.z - The z coordinate of the target location.
 * @param {boolean} options.verbose - Whether to emit observation events. Default is false.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully teleported to the location, false otherwise.
 */
export const teleportToLocation = async (
  bot: Bot,
  options: ITeleportToLocationOptions,
): Promise<boolean> => {
  const defaultOptions = {
    verbose: false,
  };
  const {x, y, z, verbose} = {...defaultOptions, ...options};
  console.log(`Teleporting bot to {${x}, ${y}, ${z}}`);

  if (!bot || !bot.entity) {
    if (verbose) {
      return bot.emit(
        'alteraBotEndObservation',
        `You can't navigate yet as you are still waking up.`,
      );
    } else {
      return;
    }
  }

  bot.chat(`/tp ${x} ${y} ${z}`);
  if (verbose) {
    bot.emit(
      'alteraBotEndObservation',
      `You have reached your destination of location ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}.`,
    );
  }
};


