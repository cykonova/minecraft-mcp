import {Bot} from 'mineflayer';

/**
 * Returns a string that describes nearby blocks, intended for the building interface.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 *
 * Example usage:
 * buildingInterfaceRadar(bot); // Returns a string that describes nearby blocks
 */
export const buildingInterfaceRadar = (bot: Bot): string => {
  // Create a dwarf fortress-like radar of the blocks around the bot
  const NEARBY_DISTANCE = 5;
  const NEARBY_HEIGHT_MIN = -1;
  const NEARBY_HEIGHT_MAX = 2;

  const radar = [];
  for (let y = NEARBY_HEIGHT_MIN; y <= NEARBY_HEIGHT_MAX; y++) {
    const row = [];
    for (let x = -NEARBY_DISTANCE; x <= NEARBY_DISTANCE; x++) {
      const column = [];
      for (let z = -NEARBY_DISTANCE; z <= NEARBY_DISTANCE; z++) {
        const block = bot.blockAt(bot.entity.position.offset(x, y, z));
        column.push(block.name);
      }
      row.push(column);
    }
    radar.push(row);
  }

  // Convert the radar to a string
  let radarString = '';
  const radarPalette: {[key: string]: any} = {};

  for (let y = 0; y < radar.length; y++) {
    radarString += `y=${y + NEARBY_HEIGHT_MIN + bot.entity.position.y}:\n`;
    for (let x = 0; x < radar[y].length; x++) {
      for (let z = 0; z < radar[y][x].length; z++) {
        // See if the bot is at this block
        if (
          x + NEARBY_DISTANCE == Math.floor(bot.entity.position.x) &&
          y + NEARBY_HEIGHT_MIN == Math.floor(bot.entity.position.y) &&
          z + NEARBY_DISTANCE == Math.floor(bot.entity.position.z)
        ) {
          radarPalette['@'] = 'You';
          radarString += '@ ';
          continue;
        }
        // Convert the block name to a single character - if it's a duplicate first character for a different block, use another character
        const blockName = radar[y][x][z];
        /* let blockChar = blockName[0];
                let tries = 0;
                while (blockChar in radarPalette && radarPalette[blockChar] != blockName) {
                    tries++;
                    blockChar = blockName[0] + tries;
                }
                radarPalette[blockChar] = blockName;
                radarString += blockChar + " ";*/
        radarString += blockName + ' ';
      }
      radarString += '\n';
    }
    radarString += '\n';
  }

  let returnString =
    '\nNearby block radar to be used for knowing where open blocks are:\n';

  returnString += 'Coordinates are in {x,y,z}\n';
  returnString += `X coordinates on radar from ${Math.floor(bot.entity.position.x) - NEARBY_DISTANCE} to ${Math.floor(bot.entity.position.x) + NEARBY_DISTANCE}\n`;
  returnString += `Z coordinates on radar from ${Math.floor(bot.entity.position.z) - NEARBY_DISTANCE} to ${Math.floor(bot.entity.position.z) + NEARBY_DISTANCE}\n`;

  returnString += 'X is horizontal, Z is vertical\n';
  returnString += '\n';

  // Add the radar palette to the end of the radar string
  /* returnString += "Palette:\n";
    for (const [key, value] of Object.entries(radarPalette)) {
        returnString += `${key}: ${value}\n`;
    }*/

  returnString += '\n';

  returnString += radarString;

  return returnString;
};


