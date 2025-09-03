import {Bot, Chest} from 'mineflayer';
import {Item} from 'prismarine-item';
import {Vec3} from 'vec3';

import {ISkillServiceParams} from '../../../types/skillType.js';
import {asyncwrap} from './asyncwrap.js';
import {findAChest} from './findAChest.js';

interface IUpdateChestInterfaceOptions {
  chestPosition?: Vec3;
  chest?: Chest;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}
/**
 * Updates the chest interface with the chest's contents.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {IUpdateChestInterfaceOptions} options - The options for updating the chest interface.
 * @param {IUpdateChestInterfaceOptions['chestPosition']} options.chestPosition - The position of the chest to open.
 * @param {IUpdateChestInterfaceOptions['chest']} options.chest - The chest to open.
 * @param {ISkillServiceParams['getStatsData']} options.getStatsData - The function to get stats data.
 * @param {ISkillServiceParams['setStatsData']} options.setStatsData - The function to set stats data.
 *
 * @return {Promise<boolean>} - Returns true if the chest interface was updated, false otherwise.
 */
export const updateChestInterface = async (
  bot: Bot,
  options: IUpdateChestInterfaceOptions,
): Promise<boolean> => {
  let {
    getStatsData,
    setStatsData,
    chestPosition = null,
    chest = null,
  } = options;
  const skills = [
    'store items in chest',
    'take items from chest',
    'take all items from chest',
  ];
  // If chestPosition is not provided, find a chest to open
  if (!chestPosition) {
    chestPosition = findAChest(bot, {posToAvoid: null});
  }

  // check if there are other nearby chests that could be opened

  if (chestPosition && findAChest(bot, {posToAvoid: chestPosition})) {
    skills.push('open another chest');
  }

  skills.push('close interface');

  const chestBlock = bot.blockAt(chestPosition);
  if (!chestBlock)
    return bot.emit(
      'alteraBotEndObservation',
      'The chest you were trying to open no longer exists!',
    );

  const openChestFunc = async function () {
    return bot.openChest(chestBlock);
  };
  chest = await asyncwrap({func: openChestFunc, setStatsData, getStatsData});

  let items: Item[];
  if (chest) {
    items = chest.containerItems();
  } else {
    // shoudldn't happen throw an error?
    // TODO: throw an error
    items = bot.openedInterface.containerItems();
  }

  let materials = items.map((item) => item.count + ' ' + item.name);
  if (materials.length == 0) {
    materials = ['No items in chest'];
  }
  const interfaceToSet = {
    title: 'Chest',
    description: 'You are examinging the contents of a chest you have opened.',
    additionalCraftableItems: [] as string[],
    additionalMaterials: materials,
    skillNames: skills,
  };
  if (chest) {
    bot.setInterface(interfaceToSet, chestPosition, chest);
  } else {
    bot.updateInterface(interfaceToSet);
  }
};


