import minecraftData from 'minecraft-data';
import {Bot} from 'mineflayer';
import {Vec3} from 'vec3';

interface IBlockHasNearbyAirOptions {
  position: Vec3;
  veins?: boolean;
}
/**
 * Check if a block has nearby air.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IBlockHasNearbyAirOptions} options - The parameters for the skill function.
 * @param {Vec3} options.position - The position of the block to check.
 * @param {boolean} options.veins - OPTIONAL: If true, check for air in the 8 blocks surrounding the block. If false, check for air in the 6 blocks surrounding the block. Defaults to false.
 *
 * @return {boolean} - Returns true if the block has nearby air, false otherwise.
 */
export const blockHasNearbyAir = (
  bot: Bot,
  options: IBlockHasNearbyAirOptions,
): boolean => {
  const {position, veins = false} = options;
  const mcData = minecraftData(bot.version);
  let offsets = [];

  // If mining veins, allow for diagonals to be seen
  if (veins) {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          offsets.push({x, y, z});
        }
      }
    }
  } else {
    offsets = [
      {x: 1, y: 0, z: 0},
      {x: -1, y: 0, z: 0},
      {x: 0, y: 0, z: 1},
      {x: 0, y: 0, z: -1},
      {x: 0, y: 1, z: 0},
      {x: 0, y: -1, z: 0},
    ];
  }

  return offsets.some((offset) => {
    const newPos = position.plus(new Vec3(offset.x, offset.y, offset.z));
    const block = bot.blockAt(newPos);
    return block && block.type === mcData.blocksByName.air.id;
  });
};


