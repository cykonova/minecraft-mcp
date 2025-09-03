import minecraftData from 'minecraft-data';
import {Bot, Furnace} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {isInventoryFull} from '../library/inventoryHelpers.js';
import {ticksToSeconds} from '../library/useFurnace.js';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
import {Block} from 'prismarine-block';

import {isSignalAborted, validateSkillParams} from '../index.js';
import {asyncwrap} from '../library/asyncwrap.js';
import {cancelableMove} from '../library/navigateToLocation.js';
const {
  goals: {GoalNear},
} = mineflayer_pathfinder;

interface ILRetrieveItemFromSingleFurnaceOptions {
  furnaceBlock: Block;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}

interface IFindNearbyFurnacesOptions {
  searchRadius: number;
  maxFurnaces: number;
}

/**
 * Calculates the remaining fuel seconds for a furnace.
 *
 * @param {Furnace} furnace - The furnace object.
 * @param {any} packet - The furnace packet data.
 * @returns {number} - The number of seconds remaining in the fuel.
 */
const getFuelSeconds = (furnace: Furnace, packet: any) => {
  furnace.totalFuel = packet[1];
  furnace.totalFuelSeconds = ticksToSeconds(furnace.totalFuel);
  furnace.fuel = 0;
  furnace.fuelSeconds = 0;

  if (furnace.totalFuel) {
    furnace.fuel = packet[0] / furnace.totalFuel;
    furnace.fuelSeconds = furnace.fuel * furnace.totalFuelSeconds;
  }
  return furnace.fuelSeconds;
};

/**
 * Calculates the progress of a furnace item smelting operation.
 *
 * @param {Furnace} furnace - The furnace object.
 * @param {any} packet - The furnace packet data.
 * @returns {number} - The number of seconds remaining in the smelting progress.
 */
const getItemProgress = (furnace: Furnace, packet: any) => {
  furnace.totalProgress = packet[3];
  furnace.totalProgressSeconds = ticksToSeconds(furnace.totalProgress);

  furnace.progress = 0;
  furnace.progressSeconds = 0;
  if (furnace.totalProgress) {
    furnace.progress = packet[2] / furnace.totalProgress;
    furnace.progressSeconds =
      furnace.totalProgressSeconds -
      furnace.progress * furnace.totalProgressSeconds;
  }
  return furnace.progressSeconds;
};

/**
 * Finds nearby furnace blocks within a specified search radius and maximum count.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IFindNearbyFurnacesOptions} options
 * @param {number} options.searchRadius - The maximum distance to search for furnace blocks.
 * @param {number} options.maxFurnaces - The maximum number of furnace blocks to return.
 * @returns {Block[]} - An array of furnace blocks found within the search radius.
 */
const findNearbyFurnaces = (bot: Bot, options: IFindNearbyFurnacesOptions) => {
  const {searchRadius, maxFurnaces} = options;
  const mcData = minecraftData(bot.version);
  return bot.findBlocks({
    matching: [mcData.blocksByName.furnace.id],
    maxDistance: searchRadius,
    count: maxFurnaces,
  });
};

/**
 * Retrieves items from a single furnace.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ILRetrieveItemFromSingleFurnaceOptions} options - The options for retrieving items from the furnace.
 * @param {Block} options.furnaceBlock - The furnace block to retrieve items from.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get the stats data.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set the stats data.
 * @returns {Promise<[Furnace, string]>} - The furnace object and a message describing the items retrieved.
 */
const _retrieveItemFromSingleFurnace = async (
  bot: Bot,
  options: ILRetrieveItemFromSingleFurnaceOptions,
) => {
  /*
  Atomic function that retrieves items from a single furnace.
  Note that no text observations are emitted here. We leave it to the outside function to handle text observations.

  Behavior:
  - If furnace is in progress, take output items
  - If furnace is not in progress, take all items if there are any.
  */
  const {furnaceBlock, getStatsData, setStatsData} = options;

  const smeltTime = 10;
  const location = `${Math.floor(furnaceBlock.position.x)}, ${Math.floor(furnaceBlock.position.y)}, ${Math.floor(furnaceBlock.position.z)}`;

  /*
  Mineflayer currently does not update the furnace item and fuel progress correctly.
  Item smelting and fuel burning progress are both null due to packet update errors.
  The code block below is a temporary workaround to get the progress of the furnace.
  */
  const furnaceInfo: any = {}; // This is a temporary workaround to get the progress of the furnace. Not found the type in mineflayer.

  const furnaceInfoFunction = (packet: any) => {
    furnaceInfo[packet.property] = packet.value;
  };
  bot._client.on('craft_progress_bar', furnaceInfoFunction);
  const furnace = await asyncwrap({
    func: async () => {
      return await bot.openFurnace(furnaceBlock);
    },
    getStatsData,
    setStatsData,
  });
  await bot.waitForTicks(1);
  bot._client.removeListener('craft_progress_bar', furnaceInfoFunction);
  getFuelSeconds(furnace, furnaceInfo);
  getItemProgress(furnace, furnaceInfo);
  console.log(`Current fuel progress: ${furnace.fuelSeconds}`);
  console.log(`Current item progress: ${furnace.progressSeconds}`);
  const furnaceFuelSeconds = furnace.fuelSeconds.toFixed(1);
  const furnaceProgressSeconds = furnace.progressSeconds.toFixed(1);

  const retrieve_message_parts = [];
  let retrieve_message = '';
  try {
    // If furnace is not smelting, take out all items.
    if (furnaceProgressSeconds == 10 || furnaceProgressSeconds == 0) {
      console.log('Furnace is not smelting. Taking out all items.');
      if (furnace.inputItem()) {
        const ir = await furnace.takeInput();
        retrieve_message_parts.push(
          `you retrieved ${ir.count} ${ir.displayName} from the furnace input slot`,
        );
      }
      if (furnace.fuelItem()) {
        const fr = await furnace.takeFuel();
        retrieve_message_parts.push(
          `you retrieved ${fr.count} ${fr.displayName} from the furnace fuel slot`,
        );
      }
      if (furnace.outputItem()) {
        const outr = await furnace.takeOutput();
        retrieve_message_parts.push(
          `you retrieved ${outr.count} ${outr.displayName} from the furnace output slot`,
        );
      }

      if (retrieve_message_parts.length != 0) {
        retrieve_message = `At furnace location (${location}),`;
        for (let i = 0; i < retrieve_message_parts.length; i++) {
          if (
            retrieve_message_parts.length > 1 &&
            i == retrieve_message_parts.length - 1
          ) {
            retrieve_message += 'and ';
          }
          retrieve_message += retrieve_message_parts[i];
          if (i < retrieve_message_parts.length - 1) {
            retrieve_message += ', ';
          } else {
            retrieve_message += '. ';
          }
        }
      } else {
        retrieve_message = `There were no items to retrieve at furnace location (${location}). `;
      }
      retrieve_message += `This furnace is currently free for smelting. `;
    } else {
      // If furnace is in use, just take out the output items if there are any and then wait
      const total_wait_time =
        furnaceProgressSeconds + (furnace.inputItem().count - 1) * smeltTime;
      if (furnace.outputItem()) {
        const outr = await furnace.takeOutput();
        retrieve_message += `At furnace location (${location}), you retrieved ${outr.count} ${outr.displayName} from the furnace output slot, and `;
        retrieve_message += `the next ${outr.displayName} will be smelted in ${furnaceProgressSeconds} seconds. `;
        retrieve_message += `This furnace will be free for smelting in ${total_wait_time} seconds. `;
      } else {
        retrieve_message += `Furnace at location (${location}) is currently smelting. `;
        retrieve_message += `The next item will be smelted in ${furnaceProgressSeconds} seconds. `;
        retrieve_message += `It will be free for smelting in ${total_wait_time} seconds. `;
      }
    }
  } catch (error) {
    retrieve_message = `ERROR: Failed to retrieve items from the furnace due to: ${error}`;
  } finally {
    console.log(retrieve_message);
    // bot.emit('alteraBotTextObservation', `${retrieve_message}`);
    furnace.close();
    return [furnace, retrieve_message];
  }
};

/**
 * Retrieves items from all furnaces near you
 *
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {Object} params - The parameters for the function.
 * @param {Object} serviceParams - additional parameters for the skill function.
 * @param {ISkillServiceParams['getStatsData']} serviceParams.getStatsData - The function to get the stats data.
 * @param {ISkillServiceParams['setStatsData']} serviceParams.setStatsData - The function to set the stats data.
 * @param {ISkillServiceParams[]} serviceParams.signal - The signal object to check if the skill execution has been cancelled.
 *
 */
export const retrieveItemsFromNearbyFurnace = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'retrieveItemsFromNearbyFurnace';
  const requiredParams: string[] = [];
  if (
    !validateSkillParams(
      params,
      requiredParams,
      skillName,
    )
  ) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide all of the required parameters ${requiredParams.join(', ')} for the ${skillName} skill.`,
    );
    return false;
  }

  const {signal, getStatsData, setStatsData} = serviceParams;

  const furnacePositions = findNearbyFurnaces(bot, {
    searchRadius: 10,
    maxFurnaces: 10,
  });
  if (furnacePositions.length === 0) {
    return bot.emit(
      'alteraBotEndObservation',
      'You tried to retrieve items from a nearby furnace but no furnaces were found nearby.',
    );
  }

  let msg = '';
  bot.emit(
    'alteraBotStartObservation',
    `You are retrieving items from ${furnacePositions.length} furnaces nearby.`,
  );

  for (const furnaceBlock of furnacePositions
    .map((pos) => bot.blockAt(pos))
    .filter(Boolean)) {
    const location = `(${Math.floor(furnaceBlock.position.x)}, ${Math.floor(furnaceBlock.position.y)}, ${Math.floor(furnaceBlock.position.z)})`;

    if (isInventoryFull(bot)) {
      return bot.emit(
        'alteraBotEndObservation',
        `You tried to retrieve items at furnace location ${location} but your inventory is full.`,
      );
    }

    try {
      await cancelableMove(bot, {
        goal: new GoalNear(
          furnaceBlock.position.x,
          furnaceBlock.position.y,
          furnaceBlock.position.z,
          2,
        ),
        signal,
      });

      if (isSignalAborted(signal)) {
        return bot.emit(
          'alteraBotTextObservation',
          interrupt_message_accumulated_items(msg),
        );
      }

      bot.lookAt(furnaceBlock.position.offset(0.5, 0.5, 0.5));
      console.log(`You are looking at the furnace at ${location}.`);

      const [furnace, cur_msg] = await _retrieveItemFromSingleFurnace(bot, {
        furnaceBlock,
        getStatsData,
        setStatsData,
      });

      msg += cur_msg;
      console.log(`Furnace object: ${furnace}`);

      if (isSignalAborted(signal)) {
        furnace?.close();
        return bot.emit(
          'alteraBotTextObservation',
          interrupt_message_accumulated_items(msg),
        );
      }
    } catch (err) {
      const error = err as Error;
      console.log(error?.message ?? String(error));
      bot.emit(
        'alteraBotTextObservation',
        `You can't reach the furnace at ${location}. It was too difficult to reach it.`,
      );
      continue;
    }
  }

  return bot.emit('alteraBotEndObservation', msg);
};
/**
 * Generates a message to be emitted when the bot's item retrieval from nearby furnaces is interrupted.
 * @param endMessage - The message describing the items that were retrieved before the interruption.
 * @returns A message indicating that the bot stopped retrieving items and did something else instead.
 */
const interrupt_message_accumulated_items = (endMessage: string) => {
  const something_else_message = `You decided to do something else and stopped retrieving items from furnaces nearby.`;
  return `${endMessage} Then, ${something_else_message}`;
};


