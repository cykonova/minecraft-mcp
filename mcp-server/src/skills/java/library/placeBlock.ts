import { closest, distance } from 'fastest-levenshtein';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
const { goals, Movements } = mineflayer_pathfinder;
import { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';

import { ISkillServiceParams } from '../../../types/skillType.js';
import { asyncwrap } from './asyncwrap.js';

const { GoalLookAtBlock, GoalNear } = goals;

interface IPlaceBlockOptions {
  name: string;
  x: number;
  y: number;
  z: number;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
  alwaysHaveItem?: boolean;
  verbose?: boolean;
}
/**
 * Place a block from your inventory. Don't build on top of yourself!
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IPlaceBlockOptions} options - The options for the skill function.
 * @param {string} options.name - The name of the block to place.
 * @param {number} options.x - The x-coordinate of the block to place.
 * @param {number} options.y - The y-coordinate of the block to place.
 * @param {number} options.z - The z-coordinate of the block to place.
 * @param {boolean} options.alwaysHaveItem - Whether to give the bot the block if it doesn't have it. Default is false.
 * @param {boolean} options.verbose - Whether to emit observation events. Default is false.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully placed the block, false otherwise.
 */
export const placeBlock = async (
  bot: Bot,
  options: IPlaceBlockOptions,
): Promise<boolean> => {
  const defaultOptions = {
    alwaysHaveItem: false,
    verbose: false,
  };
  const { name, x, y, z, verbose, alwaysHaveItem, getStatsData, setStatsData } = {
    ...defaultOptions,
    ...options,
  };
  const mcData = minecraftData(bot.version);
  const closestBlockName = closest(name, Object.keys(mcData.blocksByName));

  if (distance(name, closestBlockName) > 1) {
    bot.emit(
      'alteraBotTextObservation',
      `You tried to place block ${name}, but it can't be placed in Minecraft.`,
    );
    return false;
  }
  const blockName = closestBlockName;

  // Movements do not accept mcData as a parameter. Old code =>  const movements = new Movements(bot, mcData);
  // Avoid breaking blocks while building
  const movements = new Movements(bot);
  movements.canDig = false; // Prevent the bot from breaking blocks
  bot.pathfinder.setMovements(movements);

  let placedCount = 0;

  const pos = new Vec3(x, y, z);

  const block = bot.blockAt(pos);
  if (block && block.boundingBox != 'block') {
    // Ensure the bot has the block to place
    let item = bot.inventory.items().find((item) => item.name === blockName);
    if (item == null) {
      if (alwaysHaveItem) {
        const command = `/give ${bot.username} ${blockName} 1`;
        bot.chat(command);
        await asyncwrap({
          func: async function () {
            return new Promise((resolve) => setTimeout(resolve, 200));
          },
          getStatsData,
          setStatsData,
        });
      } else {
        bot.emit(
          'alteraBotTextObservation',
          `You tried to place a ${blockName} but you don't have any to place.`,
        );
        return false;
      }
    }
    item = bot.inventory.items().find((item) => item.name === blockName);

    // Find an adjacent air block to the target position
    const directions = [
      new Vec3(0, -1, 0),
      new Vec3(0, 1, 0),
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ];

    let referenceBlock: Block | null = null;
    let referenceDirection: Vec3 = null;
    for (const direction of directions) {
      referenceBlock = bot.blockAt(pos.plus(direction));
      referenceDirection = new Vec3(0, 0, 0).minus(direction);
      if (referenceBlock && referenceBlock.boundingBox === 'block') {
        break;
      } else {
        referenceBlock = null;
      }
    }

    if (referenceBlock == null) {
      bot.emit(
        'alteraBotTextObservation',
        `You attempted to place a ${blockName}, but there is no block to place it off of.`,
      );
      return false;
    }

    try {
      // Stop any existing navigation behavior
      if (bot.pathfinder && bot.pathfinder.isMoving()) bot.pathfinder.stop();

      // Set up the movement goal as a look goal
      const goal = new GoalLookAtBlock(referenceBlock.position, bot.world);

      // Navigate to the target location
      const navigateToTarget = async () => {
        return bot.pathfinder
          .goto(goal)
          .then(() => { })
          .catch((err) => {
            if (err.message && err.message.includes('goal was changed')) {
              console.log(`${err}`);
            } else {
              console.error(`Error going to location: ${err}`);
              if (verbose) {
                bot.emit(
                  'alteraBotTextObservation',
                  `Error going to location: ${err}`,
                );
              }
            }
          });
      };
      await asyncwrap({
        func: navigateToTarget,
        getStatsData,
        setStatsData,
      });
    } catch (err) {
      const error = err as Error;
      bot.emit(
        'alteraBotEndObservation',
        `Error navigating to the place to place block: ${error.message}`,
      );
      return false;
    }

    try {
      const entityInWay = Object.values(bot.entities).find((entity) => {
        const entityPos = entity.position.floored();
        return (
          entityPos.equals(pos) || entityPos.equals(referenceBlock.position)
        );
      });

      if (entityInWay) {
        console.log(
          ` ${bot.username} has an entity in the way during placement: ${entityInWay}`,
        );
        if (entityInWay.username) {
          if (
            entityInWay == bot.entity ||
            entityInWay.username == bot.username
          ) {
            if (
              !(await moveOutOfPosition(bot, {
                blockPosition: pos,
                setStatsData,
                getStatsData,
              }))
            ) {
              bot.emit(
                'alteraBotEndObservation',
                `You attempted to place a ${blockName}, but you are in the way.`,
              );
              return false;
            }
          } else {
            bot.emit(
              'alteraBotEndObservation',
              `You attempted to place a ${blockName}, but ${entityInWay.username} is in the way.`,
            );
            return false;
          }
        } else {
          bot.emit(
            'alteraBotEndObservation',
            `You attempted to place a ${blockName}, but there is a ${entityInWay.type} entity in the way.`,
          );
          return false;
        }
      }

      await asyncwrap({
        func: async () => bot.equip(item, 'hand'),
        getStatsData,
        setStatsData,
      });
      const block = bot.blockAt(pos);
      // Define the block types that allow placement
      const replaceableBlocks = [
        mcData.blocksByName.air.id,
        mcData.blocksByName.water.id,
        mcData.blocksByName.lava.id,
      ];
      if (replaceableBlocks.includes(block.type)) {
        await asyncwrap({
          func: async () => bot.placeBlock(referenceBlock, referenceDirection),
          getStatsData,
          setStatsData,
        });
      } else {
        bot.emit(
          'alteraBotEndObservation',
          `You attempted to place a ${blockName}, but there was already a block there.`,
        );
        return false;
      }
      placedCount++;
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('blockUpdate')) {
        bot.emit(
          'alteraBotEndObservation',
          `You couldn't place ${blockName} at ${pos}, there's not enough room. Move somewhere else and try again.`,
        );
        return false;
      }

      bot.emit(
        'alteraBotEndObservation',
        `ERROR placing ${blockName} at ${pos}: ${error.message}`,
      );
      return false;
    }
  }

  // Movements do not accept mcData as a parameter. Old code =>  const defaultMovements = new Movements(bot, mcData);
  const defaultMovements = new Movements(bot);
  bot.pathfinder.setMovements(defaultMovements);

  if (placedCount > 0) {
    bot.emit(
      'alteraBotEndObservation',
      `You successfully finished placing the ${blockName} nearby at {${x},${y},${z}}!`,
    );
    return true;
  } else {
    bot.emit(
      'alteraBotEndObservation',
      `ERROR: You weren't successful in placing ${blockName} nearby for an unknown reason.`,
    );
    return false;
  }
};

interface IMoveOutOfPositionOptions {
  blockPosition: Vec3;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * Move out of the way of a block position.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IMoveOutOfPositionOptions} options - The options for the skill function.
 * @param {Vec3} options.blockPosition - The block position to move out of the way of.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get the stats data from evaluateCode.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set the stats data from evaluateCode.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully moved out of the way, false otherwise.
 */
const moveOutOfPosition = async (
  bot: Bot,
  options: IMoveOutOfPositionOptions,
): Promise<boolean> => {
  const { blockPosition, getStatsData, setStatsData } = options;
  // Find a safe position near the target block position
  const safePositions = [
    new Vec3(blockPosition.x - 2, blockPosition.y, blockPosition.z),
    new Vec3(blockPosition.x + 2, blockPosition.y, blockPosition.z),
    new Vec3(blockPosition.x, blockPosition.y, blockPosition.z - 2),
    new Vec3(blockPosition.x, blockPosition.y, blockPosition.z + 2),
    new Vec3(blockPosition.x - 1, blockPosition.y + 1, blockPosition.z),
    new Vec3(blockPosition.x + 1, blockPosition.y + 1, blockPosition.z),
    new Vec3(blockPosition.x, blockPosition.y + 1, blockPosition.z - 1),
    new Vec3(blockPosition.x, blockPosition.y + 1, blockPosition.z + 1),
  ];

  let targetPosition: Vec3 = null;
  for (const pos of safePositions) {
    if (bot.blockAt(pos).boundingBox === 'empty') {
      targetPosition = pos;
      break;
    }
  }

  if (!targetPosition) {
    // No safe position found
    return false;
  }

  // Move to the safe position
  await asyncwrap({
    func: async () =>
      bot.pathfinder.goto(
        new GoalNear(targetPosition.x, targetPosition.y, targetPosition.z, 1),
      ),
    getStatsData,
    setStatsData,
  });
  return true;
};


