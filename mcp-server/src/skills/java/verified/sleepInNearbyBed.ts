import { Bot } from 'mineflayer';

import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import { isSignalAborted, validateSkillParams } from '../index.js';
import { navigateToLocation } from '../library/navigateToLocation.js';

/**
 * Makes the bot sleep in a nearby bed.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {number} params.maxDistance - The maximum distance to search for a bed. Default is 10 blocks.
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully slept in a nearby bed, false otherwise.
 */
export const sleepInNearbyBed = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'sleepInNearbyBed';
  const requiredParams: string[] = [];
  const isParamsValid = validateSkillParams(
    { ...serviceParams },
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

  const defaultParams = {
    maxDistance: 10,
  };
  const unpackedParams = {
    maxDistance: params.maxDistance ?? defaultParams.maxDistance,
    signal: serviceParams.signal,
  };
  const { maxDistance, signal } = unpackedParams;
  const TIME_TO_FALL_ASLEEP_S = 10;
  const SLEEP_IN_TICKS = TIME_TO_FALL_ASLEEP_S * 20;

  // Find the nearest bed within the specified range
  const bed = bot.findBlock({
    matching: (block) => bot.isABed(block),
    maxDistance: maxDistance,
  });

  // No bed is found
  if (!bed) {
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: you tried to sleep in a bed nearby but found no bed around.`,
    );
    return false;
  }
  console.log(
    `Found a bed at {${bed.position.x},${bed.position.y},${bed.position.z}}.`,
  );

  // Get to bed
  try {
    navigateToLocation(bot, {
      x: bed.position.x,
      y: bed.position.y,
      z: bed.position.z,
      signal,
      range: 1,
    });
  } catch (error) {
    bot.emit(
      'alteraBotEndObservation',
      `You tried to navigate to bed at {${bed.position.x},${bed.position.y},${bed.position.z}} but could not.`,
    );
  }

  console.log(
    `Searching for a bed within ${maxDistance} blocks to sleep in.`,
  );
  // It's day time, can't sleep
  if (!(bot.time.timeOfDay >= 13000 && bot.time.timeOfDay <= 23000)) {
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: you tried to sleep but it is daytime.`,
    );
    return false;
  }

  // Attempt to go to the bed and sleep
  try {
    await bot.sleep(bed);
    bot.emit('alteraBotTextObservation', `You have started sleeping.`);
    let cur_sleep_ticks = 0;
    let woke_up_naturally = false;

    const checkForWake = () => {
      console.log(`Woke up naturally.`);
      woke_up_naturally = true;
    };

    // Set up a promise that resolves when the bot wakes up
    new Promise((resolve) => {
      bot.once('wake', checkForWake);
      resolve(true);
    });

    while (cur_sleep_ticks < SLEEP_IN_TICKS && !woke_up_naturally) {
      if (isSignalAborted(signal)) {
        // You interrupted your own sleep
        bot.removeListener('wake', checkForWake);
        return bot.emit(
          'alteraBotEndObservation',
          `You decided to do something else instead of sleeping.`,
        );
      }
      await bot.waitForTicks(1);
      cur_sleep_ticks++;
    }
    bot.removeListener('wake', checkForWake);

    // Have to wait >20 ticks for game time to update
    await bot.waitForTicks(40);
    console.log(
      `BOT DONE SLEEPING, TIME: ${bot.time.timeOfDay} SLEEP TICKS: ${cur_sleep_ticks}, WOKE UP NATURALLY: ${woke_up_naturally}`,
    );
    // At this point, you finished sleeping without getting interrupted, but you don't know if you've slept through the whole night
    if (bot.time.timeOfDay < 13000 || bot.time.timeOfDay > 23000) {
      bot.emit(
        'alteraBotEndObservation',
        `You have slept through the entire night and have woken up naturally.`,
      );
      return true;
    } else {
      const msg = checkOtherPlayersSleeping(bot);
      bot.emit(
        'alteraBotEndObservation',
        `You woke up before the night was skipped. ${msg}`,
      );
      bot.wake();
      return false;
    }
  } catch (error) {
    const err_str = `ERROR: You tried to sleep in the nearby bed but failed because ${error}`;
    console.error(err_str);
    bot.emit('alteraBotEndObservation', err_str);
    return false;
  }
};

/**
 * Check if other players are sleeping.
 * @param {Bot} bot - The Mineflayer bot instance.
 *
 * @return {string} - A message indicating if other players are sleeping or not.
 */
const checkOtherPlayersSleeping = (bot: Bot): string => {
  // If the bot woke up and it is still nighttime, it suggests other players didn't sleep
  const playerNames = Object.keys(bot.players);
  const sleepingPlayers = [];
  const awakePlayers: string[] = [];

  playerNames.forEach((name) => {
    const playerEntity = bot.players[name].entity;
    if (!(name == bot.username)) {
      if (playerEntity && (playerEntity as any).isSleeping) {
        sleepingPlayers.push(name);
      } else {
        awakePlayers.push(name);
      }
    }
  });

  if (awakePlayers.length > 0) {
    return `Players that were not sleeping: ${awakePlayers.join(', ')}.`;
  } else {
    return `ERROR: You don't know why you did not sleep, because it is neither you interrupting your own sleep or other players.`;
  }
};


