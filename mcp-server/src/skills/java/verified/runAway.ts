import { Bot } from 'mineflayer';
import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
const { goals } = mineflayer_pathfinder;
import { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';

import { isSignalAborted, validateSkillParams } from '../index.js';
import { findClosestPlayerByName } from '../library/findClosestPlayerByName.js';
import { cancelableMove } from '../library/navigateToLocation.js';

const { GoalXZ } = goals;

/**
 *  Runs away from hostile mobs or players
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IFunctionCall} params - The parameters for the skill function.
 * @param {string?} params.stringValue.targetType - OPTIONAL: The type of the target to run away from. Use 'mob' for any hostile mobs.  Use 'player' for players. Defaults to 'mob'.
 * @param {string?} params.stringValue.targetName - OPTIONAL: The specific display name of the entity to attack (optional). For players, use the player's username. For mobs, use the mob type (e.g., 'Zombie').  Make sure the target name starts with a capital letter.
 * @param {number?} params.numberValue.runDistance - OPTIONAL: The distance to run away from hostile mobs. Defaults to 10 blocks.
 * @param {ISkillServiceParams} serviceParams - additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully ran away from the target, false otherwise.
 */
export const runAway = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'runAway';
  const requiredParams: string[] = [];
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

  const unpackedParams = {
    targetType: params.targetType ?? 'mob',
    targetName: params.targetName ?? '',
    runDistance: params.runDistance ?? 10,
    signal: serviceParams.signal,
  };
  let { targetType, targetName, runDistance, signal } = unpackedParams;
  // Define the radius within which you want to detect mobs
  const NEARBY_ENTITY_RADIUS = bot.nearbyEntityRadius;
  const MIN_DISTANCE = 0.01; // Minimum distance to avoid extremely small values

  targetName = targetName ?? '';

  const targetStr = targetName ? targetName : targetType;
  targetName = targetName.replace(/\s/g, '_'); // Replace spaces in name with _

  if (targetType == 'mob') {
    targetType = 'hostile';
  }

  // Check if entities are available
  if (!bot.entities) return;

  const allEntities = Object.values(bot.entities);

  // Filter function to identify mobs within the specified radius
  const isNearbyEntity = (entity: Entity) => {
    return (
      entity.position.distanceTo(bot.entity.position) < NEARBY_ENTITY_RADIUS
    );
  };

  // Filter for nearby hostile mobs
  const hostileMobs = allEntities.filter((entity) => {
    const version = parseInt(bot.version.split('.')[1]);
    const NBT_HEALTH =
      version < 10 ? 6 : version < 14 ? 7 : version < 17 ? 8 : 9;
    if (targetName) {
      if (targetType === 'player') {
        const closestPlayer = findClosestPlayerByName(bot, { name: targetName });
        return (
          isNearbyEntity(entity) &&
          entity.username !== bot.entity.username &&
          entity.username == closestPlayer.username
        );
      } else {
        return (
          isNearbyEntity(entity) &&
          entity.name.toLowerCase() === targetName.toLowerCase()
        );
      }
    }
    return (
      isNearbyEntity(entity) &&
      entity.type === targetType &&
      entity.metadata[NBT_HEALTH] &&
      entity.username !== bot.entity.username
    );
  });

  // Check if there are no hostile mobs
  if (hostileMobs.length === 0) {
    return bot.emit(
      'alteraBotEndObservation',
      `There are no ${targetType}s to run away from.`,
    );
  }

  // Calculate the weighted vector direction to run away
  const runVector = { x: 0, y: 0, z: 0 };
  hostileMobs.forEach((mob) => {
    const vector = {
      x: bot.entity.position.x - mob.position.x,
      y: bot.entity.position.y - mob.position.y,
      z: bot.entity.position.z - mob.position.z,
    };

    const distance = Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
    const weight = 1 / Math.max(distance, MIN_DISTANCE); // Avoid division by extremely small values

    runVector.x += vector.x * weight;
    runVector.y += vector.y * weight;
    runVector.z += vector.z * weight;
  });

  // Normalize the resulting vector
  const vectorLength = Math.sqrt(
    runVector.x ** 2 + runVector.y ** 2 + runVector.z ** 2,
  );
  if (vectorLength > 0) {
    runVector.x /= vectorLength;
    runVector.y /= vectorLength;
    runVector.z /= vectorLength;
  }

  // Determine the destination position
  const runDestination = new Vec3(
    bot.entity.position.x + runVector.x * runDistance,
    bot.entity.position.y + runVector.y * runDistance,
    bot.entity.position.z + runVector.z * runDistance,
  );

  if (bot.pathfinder.isMoving()) await bot.pathfinder.stop();

  await bot.waitForTicks(1); // give the pathfinder some time to stop

  // Make the bot move to the destination position
  const goal = new GoalXZ(runDestination.x, runDestination.z);

  // execute a cancelable move to the destination
  const result = await cancelableMove(bot, { goal, signal });

  // check signal 1st
  if (isSignalAborted(signal)) {
    return bot.emit(
      'alteraBotEndObservation',
      `You decided to do something else and stop running away.`,
    );
  }

  if (result.error) {
    return bot.emit(
      'alteraBotEndObservation',
      `You couldn't finish running away, but did your best.`,
    );
  }

  // Print out the list of all nearby hostile mobs
  // const hostileMobNames = hostileMobs.map(entity => entity.name);
  // const uniqueHostileMobTypes = [...new Set(hostileMobNames)];
  // console.log(`Nearby hostile mobs: ${hostileMobNames.join(', ')}`);
  return bot.emit('alteraBotEndObservation', `You have finished running away!`);
};


