import {Bot} from 'mineflayer';
import {Entity} from 'prismarine-entity';

import {ISkillServiceParams} from '../../../types/skillType.js';
import {isSignalAborted} from '../index.js';
import {asyncwrap} from './asyncwrap.js';
import {findClosestPlayerByName} from './findClosestPlayerByName.js';
import {navigateToLocation} from './navigateToLocation.js';
import {autoEquipSword} from './pvpHelper.js';

interface IAttackOptions {
  signal: AbortSignal;
  resetTimeout: ISkillServiceParams['resetTimeout'];
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
  targetType?: string;
  targetName?: string;
  duration?: number;
  killNumber?: number;
}
/**
 * Attack, kill, defend against, or initiate combat with someone.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IAttackOptions} options - The options for the attack skill.
 * @param {string} options.targetType - The type of the target to attack. Use 'player' for players, 'mob' for any hostile mobs
 * @param {string} options.targetName - The specific display name of the entity to attack. For players, use the player's username. For mobs, use the mob type (e.g., 'Zombie'). Make sure the target name starts with a capital letter.
 * @param {number} options.duration - Duration in seconds to attack for.  Defaults to 20 seconds. Maximum duration is 60 seconds.
 * @param {number} options.killNumber - The number of entity you should kill, this defaults to 1. Maximum amount is 5.
 *
 * @return {Promise<boolean>} - Returns a promise that resolves when the bot finishes attacking the target.
 */
export const attack = async (
  bot: Bot,
  options: IAttackOptions,
): Promise<boolean> => {
  const defaultOptions = {
    targetType: '',
    targetName: '',
    duration: 20,
    killNumber: 1,
  };
  let {
    targetType,
    targetName,
    duration,
    killNumber,
    signal,
    setStatsData,
    getStatsData,
    resetTimeout,
  } = {...defaultOptions, ...options};
  const ENTITY_RADIUS = bot.nearbyEntityRadius;
  const WAIT_TIME = 10; // 10 milliseconds
  const MAX_DURATION = 60; // 60 seconds
  const MAX_KILL_NUMBER = 5; // Maximum number of entities to kill

  // Stop attacking anyone before attacking someone else
  bot.pvp.forceStop();

  let kills = 0;
  targetName = targetName ?? '';

  const targetStr = targetName ? targetName : targetType;
  targetName = targetName.replace(/\s/g, '_'); // Replace spaces in name with _

  duration = Math.min(duration, MAX_DURATION); // Set max duration to 60 seconds.
  killNumber = Math.min(killNumber, MAX_KILL_NUMBER); // Set max duration to 60 seconds.

  // filter for the target using the entity type
  let target = findTarget(bot, {targetType, targetName});

  if (!target) {
    return bot.emit(
      'alteraBotEndObservation',
      `Mistake: You chose to attack ${targetName} but you couldn't find anyone with that name.`,
    );
  }

  if (
    target.position.distanceTo(bot.entity.position) > ENTITY_RADIUS &&
    (targetType === 'mob' || targetType === 'animal')
  ) {
    return bot.emit(
      'alteraBotEndObservation',
      `There's no ${targetStr} close enough for you to attack.`,
    );
  }

  autoEquipSword(bot);

  const startTime = Date.now();

  let endMessage = null;

  try {
    // Event handler to collect loot after killing the target
    const handleDeath = async (entity: Entity) => {
      // console.log(entity === target)
      if (entity === target) {
        bot.pvp.forceStop();

        kills++;
        resetTimeout(); // reset the skill timeout on the bot to make sure the bot doesn't stop the skill while it's still attacking
        if (kills < killNumber)
          bot.emit(
            'alteraBotTextObservation',
            `You have killed ${kills} of ${killNumber} ${targetStr}.`,
          );

        // move to the target's last known position to (hopefully) collect loot
        const navigateFunc = async function () {
          return navigateToLocation(bot, {
            x: target.position.x,
            y: target.position.y,
            z: target.position.z,
            range: 0.5,
          });
        };
        await asyncwrap({func: navigateFunc, setStatsData, getStatsData});

        // Check if we're done killing
        await bot.waitForTicks(2);

        if (isSignalAborted(signal)) {
          stopAttack();
          endMessage = `You decided to do something else after you killed ${kills} ${targetStr}.`;
          return;
        }

        // check signal for cancellation
        if (kills >= killNumber) {
          stopAttack();
          endMessage = `You finished killing ${kills} ${targetStr}.`;
          return;
        }

        // Select a new target, since there are more to kill
        let newTarget = findTarget(bot, {targetType, targetName});

        // make sure the target is the entity we just killed and that we have a new target
        // find target may still find the same target for a brief window
        let findTargetLimit = 40; // emergency limit to prevent infinite loop // this is in ticks
        while (newTarget == target && findTargetLimit >= 0) {
          newTarget = findTarget(bot, {targetType, targetName});
          await bot.waitForTicks(1);
          findTargetLimit--;
        }

        if (findTargetLimit <= 0) {
          stopAttack();
          endMessage = `ERROR: couldn't find a new ${targetStr} to kill.`;
          return;
        }

        target = newTarget;

        if (
          !target ||
          (target.position.distanceTo(bot.entity.position) > ENTITY_RADIUS &&
            (targetType === 'mob' || targetType === 'animal'))
        ) {
          stopAttack();
          endMessage = `You killed ${kills} ${targetStr} and there are no more ${targetStr} nearby.`;
          return;
        }

        console.log(` attacking the next ${targetStr}.`);

        // re-equip a sword (in case old one broke)
        autoEquipSword(bot);
        bot.pathfinder.stop(); // Stop pathfinding

        // Reset the loot trigger and start attacking the new target
        bot.waitForTicks(2);

        bot.pvp.attack(target);
      }
      return;
    };

    bot.on('entityDead', handleDeath);

    // await asyncwrap(async function(){return bot.pvp.attack(target)});
    bot.pvp.attack(target);

    let cleanUpTimeout;
    let stoppedAttacking = false;

    const stopAttack = () => {
      if (!stoppedAttacking) {
        bot.removeListener('entityDead', handleDeath);
        bot.pvp.forceStop();
        stoppedAttacking = true;
        attacking = false;
      }
    };

    let attackTime = 0;
    let attacking = true;
    const totalDuration = duration * 1000;
    while (attacking && attackTime < totalDuration) {
      // check signal for cancellation
      // this check may be redundant, but it's here just in case
      if (isSignalAborted(signal)) {
        stopAttack();
        if (!endMessage)
          endMessage = `You decided to do something else instead of attacking ${targetStr}.`;
        return bot.emit('alteraBotEndObservation', endMessage);
      }

      // wait for 10 milliseconds
      await new Promise((resolve) => setTimeout(resolve, WAIT_TIME));

      attackTime += WAIT_TIME;
    }

    console.log(` stopped attacking after ${duration} seconds.`);

    stopAttack();

    if (!endMessage)
      endMessage = `You stopped attacking ${targetStr} after ${duration} seconds.`;

    return bot.emit('alteraBotEndObservation', endMessage);
  } catch (err) {
    const error = err as Error;
    return bot.emit(
      'alteraBotEndObservation',
      `You couldn't attack ${targetStr} because: ${error.message}`,
    );
  }
};

interface IFindTargetOptions {
  targetType: string;
  targetName: string;
}
/**
 * findTarget - Finds the nearest entity of the target type.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IFindTargetOptions} options - The options for finding the target.
 * @param {string} options.targetType - The type of the target to find. Use 'player' for players, 'mob' for any hostile mobs
 * @param {string} options.targetName - The specific display name of the entity to find. For players, use the player's username. For mobs, use the mob type (e.g., 'Zombie'). Make sure the target name starts with a capital letter.
 *
 * @return {Entity|null} - The entity that has the closest matching name, or null if no close match is found.
 */
const findTarget = (bot: Bot, options: IFindTargetOptions): Entity | null => {
  const {targetType, targetName} = options;
  const version = parseInt(bot.version.split('.')[1]);
  const NBT_HEALTH = version < 10 ? 6 : version < 14 ? 7 : version < 17 ? 8 : 9;

  const playerEntityTypes = ['player'];
  const mobEntityTypes = ['hostile'];
  const animalEntityTypes = ['animal'];

  let target: Entity | null = null;
  // Use target name if provided, otherwise find the nearest entity of the target type
  if (targetName) {
    if (targetType === 'player') {
      target = findClosestPlayerByName(bot, {name: targetName});
    } else {
      target = bot.nearestEntity(
        (entity) => entity?.name?.toLowerCase() === targetName.toLowerCase(),
      );
    }
  } else if (targetType === 'player') {
    target = bot.nearestEntity(
      (entity) =>
        playerEntityTypes.includes(entity.type) &&
        entity.metadata[NBT_HEALTH] &&
        Object.keys(entity.metadata[NBT_HEALTH]).length > 0,
    );
  } else if (targetType === 'mob') {
    target = bot.nearestEntity(
      (entity) =>
        mobEntityTypes.includes(entity.type) &&
        entity.metadata[NBT_HEALTH] &&
        (!targetName || entity.displayName === targetName),
    );
  } else if (targetType === 'animal') {
    target = bot.nearestEntity(
      (entity) =>
        animalEntityTypes.includes(entity.type) &&
        entity.metadata[NBT_HEALTH] &&
        (!targetName || entity.displayName === targetName),
    );
  }

  return target;
};



