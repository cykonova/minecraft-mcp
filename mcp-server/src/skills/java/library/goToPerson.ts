import { Bot } from 'mineflayer';
import { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';

import { isSignalAborted } from '../index.js';
import { findClosestPlayerByName } from './findClosestPlayerByName.js';

import minecraftData from 'minecraft-data';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

const { GoalFollow } = mineflayer_pathfinder.goals;

interface IGoToPersonParams {
  name: string;
  signal: AbortSignal;
  distance: number;
  keepFollowing: boolean;
}

/**
 *  Goes to someone to get near them or follow them.
 *
 * @param {object} bot - The Mineflayer bot instance. Assume the bot is already spawned in the world.
 * @param {object} params
 * @param {string} params.name - The name of the person to go to or follow.
 * @param {number} params.distance - The desired distance to get within the person. Default is 3 blocks.
 * @param {boolean} params.keepFollowing - Whether to keep following the person after reaching them. Default is false.
 * @param {AbortSignal} params.signal - The signal to abort the skill.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully went to the person, false otherwise.
 */
export const goToPerson = async (
  bot: Bot,
  params: IGoToPersonParams,
): Promise<boolean> => {
  const { distance: distanceParam, name, keepFollowing, signal } = params;
  const distance = Math.max(1, distanceParam); // Ensure distance is at least 1

  const TELEPORT_TOLERANCE_THRESHOLD = 30; // in blocks, if the entity is this far away, try to teleport to them
  const EMIT_UPDATE_RATE = 2000; // in milliseconds - 2 seconds, how often to emit a message while following
  const MAX_FOLLOW_TIME = 300000; // in milliseconds - 5 minutes, how long to follow before stopping, this is an emergency time - out
  const PROCESS_UPDATE_FREQUENCY = 50; // how often to check if the bot is still following the entity in milliseconds, ~20 times per second
  const HASNT_MOVED_THRESHOLD = 10000; // in milliseconds - 3 seconds, how long to wait before assuming the entity has stopped moving

  const entity = findClosestPlayerByName(bot, { name });

  if (!entity) {
    // bot.chat(`Entity ${name} not found.`);
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: You couldn't find anyone with the name ${name} to go to.`,
    );
    // return;
  }

  if (bot.pathfinder.isMoving()) {
    await bot.pathfinder.stop();
  }

  await bot.waitForTicks(2); // give time for pathfinder to stop

  if (isSignalAborted(signal)) {
    return;
  }

  // define a dynamic goal to follow the entity
  const followGoal = new GoalFollow(entity, distance);
  bot.pathfinder.setGoal(followGoal, true); // The second argument true makes the goal dynamic

  await bot.waitForTicks(2);

  let curDistance = -9999;

  let messageCounter = 0;

  let followTargetPosition = new Vec3(
    entity.position.x,
    entity.position.y,
    entity.position.z,
  );

  let hasntMovedCount = 0;
  // bot.emit('alteraBotTextObservation', `You started following ${ entity.username }`);
  for (let n = 0; n < MAX_FOLLOW_TIME; n += PROCESS_UPDATE_FREQUENCY) {
    if (followTargetPosition.equals(entity.position)) {
      hasntMovedCount += PROCESS_UPDATE_FREQUENCY;
      if (hasntMovedCount > HASNT_MOVED_THRESHOLD) {
        bot.emit('alteraBotTextObservation', `${name} has stopped moving.`);
        break;
      }
    } else {
      // reset hasn't moved count
      followTargetPosition = new Vec3(
        entity.position.x,
        entity.position.y,
        entity.position.z,
      );
      // console.log(`new target position: ${ JSON.stringify(bot.followTargetPosition)}`);
      hasntMovedCount = 0;
    }

    if (!isBotFollowing(bot, { entity })) {
      break;
    }

    if (isSignalAborted(signal)) {
      break;
    }

    curDistance = bot.entity.position.distanceTo(entity.position);

    // check to see if we are too far away and cheats are enabled
    if (bot.cheatsAllowed === undefined)
      // if cheats have never been set, set them to true, assume they're enabled
      bot.cheatsAllowed = true;

    if (curDistance > TELEPORT_TOLERANCE_THRESHOLD && bot.cheatsAllowed) {
      console.log(
        ` attempting to telport to ${entity.username} because they are too far away.`,
      );
      bot.chat(`/tp ${entity.username}`); // this assumes cheats are enabled
      // check to see if the we got a failure message when teleporting if cheats are not enabled
      await bot.waitForTicks(2); // give time for teleport to complete
      curDistance = bot.entity.position.distanceTo(entity.position);

      // check to see if we are still too far away (with a small buffer)
      if (curDistance > TELEPORT_TOLERANCE_THRESHOLD - 2) {
        console.log(
          ` failed to teleport to ${entity.username} because cheats are not enabled.  Turning off cheats.`,
        );
        bot.cheatsAllowed = false;
      }
    }

    if (curDistance <= distance && !keepFollowing) {
      return bot.emit(
        'alteraBotEndObservation',
        `You finished going to ${name}.`,
      );
    }

    messageCounter += PROCESS_UPDATE_FREQUENCY;

    if (keepFollowing && messageCounter >= EMIT_UPDATE_RATE) {
      bot.emit('alteraBotTextObservation', `You are still following ${name}.`);
      messageCounter = 0;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, PROCESS_UPDATE_FREQUENCY),
    ); // wait for a little bit
  }

  await bot.pathfinder.stop();
  bot.pathfinder.setGoal(null);

  bot.waitForTicks(2);

  return bot.emit(
    'alteraBotEndObservation',
    `You have stopped following ${name}.`,
  );
};

interface IFindEntityByNameParams {
  name: string;
}
/**
 * Finds a player entity by username.
 *
 * @param {object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {string} params.name - The name of the entity to find.
 *
 * @return {Entity|null} - The entity with the given name, or null if not found.
 */
const findEntityByName = (
  bot: Bot,
  params: IFindEntityByNameParams,
): Entity | null => {
  const { name } = params;
  return Object.values(bot.entities).find((entity) => entity.username === name);
};

interface IIsBotFollowingParams {
  entity: Entity;
}
/**
 * Check to see if pathfinder is still following
 *
 * @param {object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {Entity} params.entity  - The entity to check if the bot is following.
 *
 * @return {boolean} - Returns true if the bot is still following the entity, false otherwise.
 */
const isBotFollowing = (bot: Bot, params: IIsBotFollowingParams): boolean => {
  const { entity } = params;
  const goal = bot.pathfinder.goal;

  // check to see that the goal is still valid and pointing to the same entity
  if (
    goal === null ||
    goal === undefined ||
    !(goal as any).entity ||
    (goal as any).entity.username !== entity.username ||
    findEntityByName(bot, { name: entity.username }) === null
  ) {
    console.log(`Goal is null or entity is not found in following`);
    return false;
  }

  return true;
};



