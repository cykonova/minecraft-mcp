import minecraftData from 'minecraft-data';
import {Bot} from 'mineflayer';
import {Vec3} from 'vec3';

interface IFindAChestOptions {
  posToAvoid?: {x: number; y: number; z: number};
}
/**
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IFindAChestOptions} options - The options for finding a chest.
 * @param {IFindAChestOptions['posToAvoid']} options.posToAvoid - The position of a chest to avoid opening.
 *
 * @return {Vec3 | null} - Returns the position of a chest to open or null if no chest is found.
 */
export const findAChest = (
  bot: Bot,
  options: IFindAChestOptions,
): null | Vec3 => {
  const {posToAvoid} = options;
  const NEARBY_DISTANCE = bot.nearbyBlockXZRange;
  const chestPositions = findNearbyChests(bot, {
    searchRadius: NEARBY_DISTANCE,
    maxChests: 3,
  });
  if (chestPositions.length === 0) {
    bot.emit(
      'alteraBotEndObservation',
      'You tried to open a nearby chest but there are no chests nearby.',
    );
    return null;
  }

  for (const chestPosition of chestPositions) {
    if (
      posToAvoid &&
      chestPosition.x == posToAvoid.x &&
      chestPosition.y == posToAvoid.y &&
      chestPosition.z == posToAvoid.z
    ) {
      continue;
    } // Don't open an opened chest
    const chestBlock = bot.blockAt(chestPosition);
    if (!chestBlock) continue;

    return chestPosition;
  }

  return null; // no chest found
};

interface IFindNearbyChestsOptions {
  searchRadius: number;
  maxChests: number;
}
/**
 * Finds nearby chests within a certain radius.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IFindNearbyChestsOptions} options - The options for finding nearby chests.
 * @param {IFindNearbyChestsOptions['searchRadius']} options.searchRadius - The radius to search for chests.
 * @param {IFindNearbyChestsOptions['maxChests']} options.maxChests - The maximum number of chests to find.
 *
 * @return {Vec3[]} - Returns an array of chest positions.
 */
export const findNearbyChests = (
  bot: Bot,
  options: IFindNearbyChestsOptions,
): Vec3[] => {
  const {searchRadius, maxChests} = options;
  const mcData = minecraftData(bot.version);

  return bot.findBlocks({
    matching: [
      mcData.blocksByName.chest.id,
      mcData.blocksByName.trapped_chest.id,
    ],
    maxDistance: searchRadius,
    count: maxChests,
  });
};


