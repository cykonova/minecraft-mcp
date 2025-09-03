import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
const { Movements } = mineflayer_pathfinder;
import { Block } from 'prismarine-block';
import { iterators } from 'prismarine-world';
import { Vec3 } from 'vec3';

import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { validateSkillParams } from '../index.js';
import { asyncwrap } from '../library/asyncwrap.js';
import { findClosestItemName } from '../library/findClosestItemName.js';
import { placeBlock } from '../library/placeBlock.js';
import { tossItemTowardsPlayer } from '../library/tossItemTowardsPlayer.js';

const OctahedronIterator = iterators.OctahedronIterator;

interface ICanPlaceItemHereOptions {
  block: Block;
  movements: any;
}

interface IIsEntityAtPositionOptions {
  position: Vec3;
}

/**
 * Attempts to place a specified item from your inventory on a nearby surface.
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {Object} params
 * @param {string} params.itemName - The name of the item to place.
 * @param {string} params.userName - OPTIONAL: The name of the player you are trying to give the item to, this should be null if you're not trying to give the item to a player
 * @param {Object} serviceParams - additional parameters for the skill function.
 *
 */
export const placeItemNearYou = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'placeItemNearYou';
  const requiredParams = ['itemName'];
  const isParamsValid = validateSkillParams(
    params,
    requiredParams,
    skillName,
  );
  if (!isParamsValid) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide all of the required parameters ${requiredParams.join(', ')} for the ${skillName} skill.`,
    );
    return false;
  }
  const { signal, getStatsData, setStatsData } = serviceParams;

  const unpackedParams = {
    itemName: params.itemName,
    playerName: params.userName ?? null,
  };

  if (
    unpackedParams.playerName != null &&
    unpackedParams.playerName != bot.username
  ) {
    return tossItemTowardsPlayer(bot, {
      playerName: unpackedParams.playerName,
      itemName: unpackedParams.itemName,
      itemCount: 1,
      signal,
    });
  }

  const closestItemName = findClosestItemName(bot, {
    name: unpackedParams.itemName,
  });
  if (!closestItemName) {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: there's no item named ${unpackedParams.itemName} in minecraft. Do you mean ${closestItemName}?`,
    );
  }

  unpackedParams.itemName = closestItemName;
  const mcData = minecraftData(bot.version);

  // Check if itemName is part of block names Object.keys(mcData.blocksByName)
  if (!mcData.blocksByName[unpackedParams.itemName]) {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: you tried to place ${unpackedParams.itemName}, but it can't be placed in Minecraft.`,
    );
  }

  // Check if bot has the block in its inventory.
  const blockItem = bot.inventory
    .items()
    .find((item) => item.name === unpackedParams.itemName);
  if (!blockItem) {
    // console.log(` inventory is ${JSON.stringify(bot.inventory)}`);
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: you do not have ${unpackedParams.itemName} in your inventory to place.`,
    );
  }

  // Get block placement position
  let placementPosition: Vec3 = null;

  const movements = new Movements(bot);

  // Use OctahedronIterator to search for a suitable block position
  const startPosition = bot.entity.position.floored();
  // DFS search for a suitable block position with a radius of 5 blocks
  const iterator = new OctahedronIterator(startPosition, 5);

  let next = startPosition;
  let placementBlock = null;

  while (next) {
    const block = bot.blockAt(next);
    const canPlace = canPlaceItemHere(bot, { block, movements });
    if (canPlace) {
      placementBlock = block;
      break;
    }
    next = iterator.next();
  }

  if (!placementBlock) {
    return bot.emit(
      'alteraBotEndObservation',
      `You tried to place ${unpackedParams.itemName} near you, but couldn't find a valid nearby surface to place it.`,
    );
  }

  await bot.lookAt(placementBlock.position); // small update to make the bot look more activate and reasonable during placement

  placementPosition = placementBlock.position;

  if (bot.pathfinder.isMoving()) bot.pathfinder.stop(); // Clear any prior pathfinder goals

  // Move to the block and place the block
  try {
    // get the currently equipped item

    let heldItem = bot.heldItem;
    if (heldItem && heldItem.name === unpackedParams.itemName) {
      heldItem = null; // if the bot is already holding the item, no need to equip it again
    }

    await asyncwrap({
      func: async () => {
        return bot.equip(blockItem, 'hand');
      },
      getStatsData,
      setStatsData,
    });

    console.log(
      `Placing ${unpackedParams.itemName} at {${placementPosition.x},${placementPosition.y},${placementPosition.z}}`,
    );

    // placeblock will internally handle string emissions at this point
    await asyncwrap({
      func: async () => {
        return placeBlock(bot, {
          name: unpackedParams.itemName,
          x: placementPosition.x,
          y: placementPosition.y,
          z: placementPosition.z,
          getStatsData,
          setStatsData,
          alwaysHaveItem: false,
        });
      },
      getStatsData,
      setStatsData,
    });

    if (heldItem)
      // requip the original item if it was unequipped
      await asyncwrap({
        func: async () => {
          return bot.equip(heldItem, 'hand');
        },
        getStatsData,
        setStatsData,
      });
  } catch (error) {
    return bot.emit(
      'alteraBotEndObservation',
      `You weren't successful in placing ${unpackedParams.itemName} because of ${error}.`,
    );
  }
};

/**
 * Checks if an item can be placed at the given block position.
 *
 * The function checks the following criteria:
 * 1. The block is air or grass.
 * 2. The block below is not air and not interactable.
 *
 * If the block is grass, the function will clear it and return true.
 *
 * !! Note that we are only checking the block below as the support block, this is not the most general, but perhaps good heuristic
 *
 * @param {Object} bot - The Minecraft bot instance.
 * @param {Object} options - An object containing the block and movement options.
 * @param {Object} options.block - The block to check.
 * @param {Object} options.movements - The movement options.
 * @returns {boolean} -  True if the item can be placed, false otherwise.
 */
const canPlaceItemHere = (
  bot: Bot,
  options: ICanPlaceItemHereOptions,
): boolean => {
  const { block, movements } = options;
  if (!block) {
    return false;
  }

  // If there is an entity at the block position, return false
  if (isEntityAtPosition(bot, { position: block.position })) {
    return false;
  }

  // If the block is grass, clear it and return true
  if (block.name === 'grass' || block.name === 'short_grass') {
    void bot.dig(block, true);
    return true;
  }

  if (block.name !== 'air') {
    return false;
  }

  // Get the block below
  const blockBelow = bot.blockAt(block.position.offset(0, -1, 0));

  // Check if the block below is not air and not interactable
  if (
    !blockBelow ||
    blockBelow.type == 0 || // there is not a block or it is air
    blockBelow.boundingBox == 'empty' || // or it doesn't have a valid bouinding box
    movements.interactableBlocks.has(blockBelow.name)
  ) {
    // or its interactable
    return false;
  }

  // If all checks pass, return true
  return true;
};

/**
 * Checks if there is an entity at the given position.
 * @param {Object} bot - The Minecraft bot instance.
 * @param {Object} options
 * @param {Vec3} options.position - The position to check for an entity.
 * @returns {boolean} - True if there is an entity at the given position, false otherwise.
 */
function isEntityAtPosition(
  bot: Bot,
  options: IIsEntityAtPositionOptions,
): boolean {
  const { position } = options;
  // Get entities within the bot's view distance
  const entities = Object.values(bot.entities);

  // Check if any entity's coordinates match the given position
  return entities.some((entity) => {
    const entityPos = entity.position.floored(); // Using floored to match block positions
    return entityPos.equals(position);
  });
}


