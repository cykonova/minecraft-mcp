import minecraftData from 'minecraft-data';
import {Bot} from 'mineflayer';
import {Block} from 'prismarine-block';

import {ISkillServiceParams} from '../../../types/skillType.js';
import {asyncwrap} from './asyncwrap.js';

interface ITillLandToFarmlandOptions {
  targetBlock: Block;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * Till the land to farmland using a hoe.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ITillLandToFarmlandOptions} options - The options for the skill function.
 * @param {Block} options.targetBlock - The target block to till.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get the stats data from evaluateCode.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set the stats data from evaluateCode.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully tilled the land, false otherwise.
 */
export const tillLandToFarmland = async (
  bot: Bot,
  options: ITillLandToFarmlandOptions,
): Promise<boolean> => {
  const {targetBlock, setStatsData, getStatsData} = options;
  const mcData = minecraftData(bot.version);

  // Check if the target block is dirt or grass
  if (
    targetBlock.type === mcData.blocksByName.grass_block.id ||
    targetBlock.type === mcData.blocksByName.dirt.id
  ) {
    // Find a hoe in the bot's inventory
    const hoe = bot.inventory.items().find((item) => item.name.includes('hoe'));

    if (!hoe) {
      // If no hoe is found, emit an observation event
      return bot.emit(
        'alteraBotEndObservation',
        'No hoe found in inventory to till the land.',
      );
    }

    // Check the block above the target block
    const blockAbove = bot.blockAt(targetBlock.position.offset(0, 1, 0));
    if (
      blockAbove &&
      (blockAbove.type === mcData.blocksByName.grass?.id ||
        blockAbove.type === mcData.blocksByName.short_grass?.id ||
        blockAbove.type === mcData.blocksByName.tall_grass.id)
    ) {
      try {
        // Destroy the grass block above the target block
        const destroyFunc = async function () {
          return bot.dig(blockAbove);
        };
        await asyncwrap({func: destroyFunc, getStatsData, setStatsData});
      } catch (error) {
        // bot.emit('alteraBotTextObservation', `Failed to remove the grass above: ${error.message}`);
        return;
      }
    }

    try {
      // Equip the hoe
      const equipFunc = async function () {
        return bot.equip(hoe, 'hand');
      };
      await asyncwrap({func: equipFunc, getStatsData, setStatsData});

      // Use the hoe on the target block to till the land
      // Position the bot facing the block
      const lookAtFunc = async function () {
        return bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5), true);
      };
      await asyncwrap({func: lookAtFunc, getStatsData, setStatsData});

      // Use the hoe on the block to turn it into farmland
      const activateBlockFunc = async function () {
        return bot.activateBlock(targetBlock);
      };
      await asyncwrap({func: activateBlockFunc, getStatsData, setStatsData});
      // bot.emit('alteraBotTextObservation', `Successfully tilled a block of land.`);
    } catch (error) {
      // bot.emit('alteraBotTextObservation', `Failed to till the land: ${error.message}`);
    }
  } else {
    // If the block is not dirt or grass, emit an observation event
    // bot.emit('alteraBotTextObservation', 'The target block is neither dirt nor grass.');
  }
};


