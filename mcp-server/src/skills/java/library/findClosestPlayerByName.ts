import {closest, distance} from 'fastest-levenshtein';
import {Bot} from 'mineflayer';
import {Entity} from 'prismarine-entity';

interface IFindClosestPlayerByNameOptions {
  name: string;
}
/**
 * Finds and returns the entity closest to the given name string.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {object} options
 * @param {string} options.name - The name string to search for.
 *
 * @return {Entity|null} The entity that has the closest matching name, or null if no close match is found.
 */
export const findClosestPlayerByName = (
  bot: Bot,
  options: IFindClosestPlayerByNameOptions,
): Entity | null => {
  const {name} = options;
  // Get all players in the bot's view, ignore itself
  // Assuming 'closest' is a function that finds the closest matching name
  const closestName = findClosestPlayerName(bot, {name});
  if (!closestName) return null;

  return bot.players[closestName].entity;
};

interface IFindClosestPlayerNameOptions {
  name: string;
}
/**
 * Finds the closest player name to the given name string.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {object} options
 * @param {string} options.name - The name string to search for.
 *
 * @return {string|null} The closest player name, or null if no close match is found.
 */
const findClosestPlayerName = (
  bot: Bot,
  options: IFindClosestPlayerNameOptions,
): null | string => {
  const {name} = options;
  const playerNames = Object.keys(bot.players).filter(
    (playerName) => playerName !== bot.username,
  );
  if (playerNames.length === 0) return null;

  // convert name to a lowercase string with no special characters
  const nameSimplified = name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');

  // create a temporary array of all the player names in lowercase and converting special characters to spaces
  const simplifiedNames: {[key: string]: number} = {};
  playerNames.forEach((playerName, index) => {
    const playerSimplified = playerName
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '');
    // store the index of the player name in the original
    simplifiedNames[playerSimplified] = index;
  });

  // console.log(`Searching for ${nameSimplified} in ${JSON.stringify(simplifiedNames)}`);

  const closestName = closest(nameSimplified, Object.keys(simplifiedNames));

  if (distance(closestName, nameSimplified) > 3) {
    console.error(`Failed to find player ${name}. 
        Closest name is ${closestName}. 
        Distance is from name is ${distance(closestName, name)}.`);
    return null;
  }

  return playerNames[simplifiedNames[closestName]];
};


