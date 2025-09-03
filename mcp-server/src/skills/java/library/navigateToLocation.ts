import { Bot } from 'mineflayer';
import { Entity } from 'prismarine-entity';
import { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { isSignalAborted } from '../index.js';
import { teleportToLocation } from './teleportToLocation.js';
import { asyncwrap } from './asyncwrap.js';

const {
  Movements,
  goals: { GoalNear },
} = mineflayer_pathfinder;

interface INavigateToLocationOptions {
  x: number | null;
  y: number | null;
  z: number | null;
  signal?: AbortSignal;
  range?: number;
  verbose?: boolean;
  allowTeleport?: boolean;
  movements?: mineflayer_pathfinder.Movements;
}
/**
 * Navigates the bot to the specified coordinates.
 *
 * @param {INavigateToLocationOptions}options - The options object.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} options.x - The x coordinate of the target location.
 * @param {number} options.y - The y coordinate of the target location.
 * @param {number} options.z - The z coordinate of the target location.
 * @param {number} options.range - The range to stop at from the target location. Default is 1.
 * @param {boolean} options.verbose - Whether to emit observation events. Default is false.
 * @param {boolean} options.allowTeleport - Whether to allow teleporting to the location. Default is false.
 * @param {Movements} options.movements - The movements object to use for pathfinding. Default is null.
 *
 * Examples:
 * navigateToLocation({bot, x:150, y:64, z:150}) // navigates bot to coordinates (150, 64, 150).
 */
export const navigateToLocation = async (
  bot: Bot,
  options: INavigateToLocationOptions,
): Promise<boolean> => {
  const defaultOptions = {
    range: 1,
    verbose: false,
    allowTeleport: false,
  };
  const { x, y, z, range, verbose, allowTeleport, movements, signal } = {
    ...defaultOptions,
    ...options,
  };

  // console.log(`Allow teleport: ${allowTeleport}`)
  if (allowTeleport) {
    teleportToLocation(bot, { x, y, z, verbose });
    return;
  }

  console.log(
    `Navigating to {${x}, ${y}, ${z}}, at range ${range} from ${bot.entity?.position || 'unknown position'}`,
  );

  if (!bot || !bot.pathfinder) {
    if (verbose) {
      return bot.emit(
        'alteraBotEndObservation',
        `You can't navigate yet as you are still waking up.`,
      );
    } else {
      return;
    }
  }

  if (verbose)
    bot.emit(
      'alteraBotStartObservation',
      `You're moving towards the location ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}.`,
    );

  // calculate the distance to the target location
  const distance = bot.entity.position.distanceTo(new Vec3(x, y, z));

  // if the distance is greater than 150 blocks, go to a closer location instead
  if (distance > 150) {
    const closerLocation = getIntermediateDestination(bot, { x, y, z, range });

    if (verbose)
      bot.emit(
        'alteraBotTextObservation',
        `The destination is too far, you are navigating to a closer location along the way.`,
      );

    return navigateToLocation(bot, {
      x: closerLocation.x,
      y: closerLocation.y,
      z: closerLocation.z,
      range,
      verbose,
      movements,
    });
  }

  await bot.waitForTicks(1);

  // Set up the movement goal as a precise position goal
  const goal = new GoalNear(x, y, z, range);

  if (movements) {
    bot.pathfinder.setMovements(movements);
  }

  // execute a cancelable move to the destination in order to allow for signal cancellation
  const navigateResult = await cancelableMove(bot, { goal, signal });

  if (navigateResult.reachedEndTarget) {
    if (verbose) {
      bot.emit(
        'alteraBotEndObservation',
        `You have arrived near your destination of location ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}.`,
      );
    }
  } else if (navigateResult.canceled) {
    if (verbose) {
      bot.emit(
        'alteraBotEndObservation',
        `You decided to do something else and stop moving towards ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}.`,
      );
    }
  } else if (navigateResult.error) {
    console.log(`${navigateResult.error}`);
    if (verbose) {
      bot.emit(
        'alteraBotEndObservation',
        `You had trouble navigating to the location ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}.`,
      );
    }
  }

  if (movements) {
    bot.pathfinder.setMovements(new Movements(bot));
  }
};

interface IGetNearestSurfaceBlockOptions {
  x: number | null;
  y: number | null;
  z: number | null;
}
/**
 * Gets the nearest surface block at the specified coordinates.
 * @param {IGetNearestSurfaceBlockOptions} options - The options object.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} options.x - The x coordinate of the target location.
 * @param {number} options.y - The y coordinate of the target location.
 * @param {number} options.z - The z coordinate of the target location.
 *
 * @return {number} - The y coordinate of the nearest surface block.
 */
export const getNearestSurfaceBlock = (
  bot: Bot,
  options: IGetNearestSurfaceBlockOptions,
): number => {
  const { x, y, z } = options;
  let block = bot.blockAt(new Vec3(x, y, z));
  let newY = Math.ceil(y);
  const mcData = minecraftData(bot.version);

  // if we're in the ground, search up
  if (block && block.type != mcData.blocksByName.air.id) {
    // console.log("searching up")
    // search up
    while (block && block.type != mcData.blocksByName.air.id) {
      newY++;
      block = bot.blockAt(new Vec3(x, newY, z));
    }
    return newY;
  } else {
    // search down
    while (block && block.type === mcData.blocksByName.air.id) {
      newY--;
      block = bot.blockAt(new Vec3(x, newY, z));
    }
    return Math.ceil(newY + 1);
  }
};

interface ICalculateNormalizedDirectionOptions {
  targetX: number | null;
  targetY: number | null;
  targetZ: number | null;
}
/**
 * Calculates the normalized direction vector to the target coordinates.
 * @param {ICalculateNormalizedDirectionOptions} options - The options object.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} options.targetX - The x coordinate of the target location.
 * @param {number} options.targetY - The y coordinate of the target location.
 * @param {number} options.targetZ - The z coordinate of the target location.
 *
 * @return {Vec3} - The normalized direction vector.
 */
export const calculateNormalizedDirection = (
  bot: Bot,
  options: ICalculateNormalizedDirectionOptions,
): Vec3 => {
  const { targetX, targetY, targetZ } = options;
  // Get the bot's current position
  const botPosition = bot.entity.position;

  // Calculate the direction vector
  const directionVector = new Vec3(
    targetX - botPosition.x,
    targetY - botPosition.y,
    targetZ - botPosition.z,
  );

  // Normalize the direction vector
  const length = Math.sqrt(
    directionVector.x * directionVector.x +
    directionVector.y * directionVector.y +
    directionVector.z * directionVector.z,
  );

  return new Vec3(
    directionVector.x / length,
    directionVector.y / length,
    directionVector.z / length,
  );
};

interface ICancelableMove {
  goal: mineflayer_pathfinder.goals.Goal;
  signal: AbortSignal;
}
/**
 *
 * @param {ICancelableMove} options - The options object.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {mineflayer_pathfinder.goals.Goal} options.goal - The goal object to navigate to.
 * @param {AbortSignal} options.signal - The signal object to cancel the move.
 *
 * @return {Promise<{reachedEndTarget: boolean, canceled: boolean, error: any}>} - Returns an object with the result of the move.
 */
export const cancelableMove = async (bot: Bot, options: ICancelableMove) => {
  const { goal, signal } = options;
  const result = {
    reachedEndTarget: false,
    canceled: false,
    error: null as Error,
  };

  try {
    bot.pathfinder.setGoal(null);
  } catch (er) { } // force a stop to the pathfinder

  let abortHandler: (() => void) | null = null;

  try {
    const abortPromise = new Promise((_, reject) => {
      if (signal) {
        abortHandler = () => reject(new Error('Cancelled'));
        signal.addEventListener('abort', abortHandler);
      }
    });

    await Promise.race([bot.pathfinder.goto(goal), abortPromise]);

    result.reachedEndTarget = true;
  } catch (err) {
    const error = err as Error;
    try {
      bot.pathfinder.setGoal(null);
    } catch (err) { }

    if (error.message === 'Cancelled') {
      result.canceled = true;
    } else {
      result.error = error as Error;
    }
  } finally {
    if (signal && abortHandler) {
      signal.removeEventListener('abort', abortHandler);
    }
  }

  return result;
};

interface IGetIntermediateDestinationOptions {
  x: number | null;
  y: number | null;
  z: number | null;
  range: number;
}
/**
 * Gets an intermediate destination closer to the target location.
 * @param {IGetIntermediateDestinationOptions} options - The options object.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} options.x - The x coordinate of the target location.
 * @param {number} options.y - The y coordinate of the target location.
 * @param {number} options.z - The z coordinate of the target location.
 * @param {number} options.range - The range to stop at from the target location.
 *
 * @return {Vec3} - The intermediate destination coordinates.
 */
const getIntermediateDestination = (
  bot: Bot,
  options: IGetIntermediateDestinationOptions,
): Vec3 => {
  const defaultOptions = {
    verbose: false,
  };
  const { x, y, z } = { ...defaultOptions, ...options };
  // choose a closer location to navigate to by casting a ray to the target location and travilling 128 units in that direction
  const direction = calculateNormalizedDirection(bot, {
    targetX: x,
    targetY: y,
    targetZ: z,
  });

  // console.log(" the direction is " + direction);
  direction.x = direction.x * 128;
  direction.y = direction.y * 128;
  direction.z = direction.z * 128;

  // console.log(" the direction is " + direction);
  const closerLocation = new Vec3(
    bot.entity.position.x,
    bot.entity.position.y,
    bot.entity.position.z,
  );

  // console.log(" the bot's position is " + closerLocation);
  // should be able to use Vec3.add
  closerLocation.x = Math.round(closerLocation.x + direction.x);
  closerLocation.y = Math.round(closerLocation.y + direction.y);
  closerLocation.z = Math.round(closerLocation.z + direction.z);

  // console.log(" the bot's target is " + closerLocation);
  // console.log("getting surface height at target location");
  // set the height of the closer location to the height of the surface at the closer location
  closerLocation.y = getNearestSurfaceBlock(bot, {
    x: closerLocation.x,
    y: closerLocation.y,
    z: closerLocation.z,
  });

  // console.log(`updated location is: ${closerLocation.x}, ${closerLocation.y}, ${closerLocation.z}  `)
  return closerLocation;
};


