import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
const { goals } = mineflayer_pathfinder;
import { Vec3 } from 'vec3';

import { ISkillServiceParams } from '../../../types/skillType.js';
import { asyncwrap } from './asyncwrap.js';
import { findClosestItemName } from './findClosestItemName.js';
import { placeBlockAt } from './placeBlockAt.js';

const { GoalPlaceBlock } = goals;

interface IPlaceBlockAtCoordinatesOptions {
  itemName: string;
  x: number;
  y: number;
  z: number;
  alwaysHaveItem?: boolean;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * Places a specified block item at the specified coordinates. This is library code so it's named differently form the verified code.
 * @param {Bot} bot - The mineflayer bot object.
 * @param {IPlaceBlockAtCoordinatesOptions} options - The options for placing a block at coordinates.
 * @param {string} options.itemName - The name of the block type to place.
 * @param {number} options.x - The x coordinate to place the block at.
 * @param {number} options.y - The y coordinate to place the block at.
 * @param {number} options.z - The z coordinate to place the block at.
 * @param {boolean} options.alwaysHaveItem - Whether the bot should always have the item in its inventory before placing it.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully placed the block at the coordinates, false otherwise.
 */
export const placeBlockAtCoordinates = async (
  bot: Bot,
  options: IPlaceBlockAtCoordinatesOptions,
): Promise<boolean> => {
  let {
    itemName,
    x,
    y,
    z,
    getStatsData,
    setStatsData,
    alwaysHaveItem = false,
  } = options;
  const mcData = minecraftData(bot.version);
  // Search for the closest item name in the mcData items list
  console.log(`Placing block ${itemName} at {${x},${y},${z}}`);
  const closestItemName = findClosestItemName(bot, { name: itemName });
  if (!closestItemName) {
    bot.emit(
      'alteraBotEndObservation',
      `You failed to place block at location because there's no placeable block named ${itemName} in Minecraft.`,
    );
    return false;
  }

  itemName = closestItemName;

  // Define the placement position.
  const placementPosition = new Vec3(x, y, z);

  // Check if the placement position is valid (not air and not solid).
  const blockAtPlacement = bot.blockAt(placementPosition);
  // if (!blockAtPlacement || blockAtPlacement.type !== 0) {
  //     bot.emit('alteraBotTextObservation', `You failed to place block at location because the placement position is not valid.`);
  //     return false;
  // }

  // If block is not the target and not air (id 0), break it first
  if (
    blockAtPlacement &&
    blockAtPlacement.type !== 0 &&
    blockAtPlacement.type !== mcData.blocksByName[itemName].id
  ) {
    // console.log(`${blockAtPlacement.type}`)
    // console.log(`${mcData.blocksByName[itemName].id}`)
    try {
      const collectFunc = async function () {
        return bot.collectBlock.collect([blockAtPlacement], {
          ignoreNoPath: true,
        });
      };
      await asyncwrap({ func: collectFunc, getStatsData, setStatsData });
    } catch (error) {
      bot.emit(
        'alteraBotEndObservation',
        `Failed to break existing block at {${x},${y},${z}}: ${error}`,
      );
      return false;
    }
  }

  // If the block at the position is already the correct type, skip placement
  // console.log(`Block at placement: ${blockAtPlacement.type}`)
  // console.log(`Trying to place block: ${itemName} ${mcData.blocksByName[itemName].id}`)
  if (
    blockAtPlacement &&
    blockAtPlacement.type === mcData.blocksByName[itemName].id
  ) {
    console.log(`Block ${itemName} is already placed at {${x},${y},${z}}.`);
    return true;
  }

  // Check if the bot has the block in its inventory.
  if (itemName === 'spruce_slab') {
    console.log(`Checking if bot has ${itemName}`);
    const temp = bot.inventory.items().find((item) => item.name === itemName);
    console.log(`Temp: ${temp}`);
  }

  let blockItem = bot.inventory.items().find((item) => item.name === itemName);
  if (!blockItem) {
    if (alwaysHaveItem) {
      console.log(
        `bot doesn't have ${itemName}, let's give the bot a bunch of these`,
      );
      // Construct the command to give the item
      const command = `/give ${bot.username} ${itemName} 10`;
      bot.chat(command);
      // Wait several seconds for inventory to be updated
      setTimeout(() => {
        // Update or check inventory again or proceed with next steps
        blockItem = bot.inventory
          .items()
          .find((item) => item.name === itemName);
        // Check if blockItem is true now
        if (!blockItem) {
          console.log(
            `We just gave the bot ${itemName}, why dont they have this item after 2s delay?`,
          );
        } else {
          console.log(
            'It looks like waiting 2 seconds is enough to update their inventory',
          );
        }
      }, 2000); // Wait for 2000 milliseconds (2 seconds)
    } else {
      bot.emit(
        'alteraBotEndObservation',
        `You failed to place block at location because you do not have ${itemName} in your inventory to place.`,
      );
      return false;
    }
  }

  // Move to the block and place the block.
  try {
    console.log(
      `Moving to placement position ${placementPosition.x}, ${placementPosition.y}, ${placementPosition.z} and trying to place the block`,
    );
    // await bot.pathfinder.goto(new GoalPlaceBlock(placementPosition, bot.world, {range: 3}));
    const goal = new GoalPlaceBlock(placementPosition, bot.world, {
      range: 3,
      LOS: false,
      facing: 'down',
      faces: [],
    });
    bot.pathfinder.setGoal(null);
    const gotoFunc = async function () {
      return bot.pathfinder
        .goto(goal)
        .then(() => {
          console.log('Arrived at the goal!');
        })
        .catch((err) => {
          console.error(`Error going to the goal: ${err}`);
        });
    };
    await asyncwrap({ func: gotoFunc, getStatsData, setStatsData });
    blockItem = bot.inventory.items().find((item) => item.name === itemName);
    // Check if blockItem is true now
    if (!blockItem && alwaysHaveItem) {
      console.log(
        'We just gave the bot something, why dont they have this item?',
      );
    }
    console.log(`Equipping ${itemName} in hand`);
    const equipFunc = async function () {
      return bot.equip(blockItem, 'hand');
    };
    await asyncwrap({ func: equipFunc, getStatsData, setStatsData });
    console.log(`Placing ${itemName} at {${x},${y},${z}}`);
    await placeBlockAt(bot, {
      targetPosition: placementPosition,
      getStatsData,
      setStatsData,
    });
    bot.emit(
      'alteraBotEndObservation',
      `You successfully placed ${itemName} at {${x},${y},${z}}!`,
    );
    return true;
  } catch (error) {
    console.log(`Error encountered during placing: ${error}`);
    bot.emit(
      'alteraBotEndObservation',
      `You weren't successful in placing ${itemName} at {${x},${y},${z}}.`,
    );
    return false;
  }
};


