import {Bot} from 'mineflayer';

import {ISkillServiceParams, ISkillParams} from '../../../types/skillType.js';
import {validateSkillParams} from '../index.js';
import {goToPerson} from '../library/goToPerson.js';
import {navigateToLocation} from '../library/navigateToLocation.js';

/**
 * Go to the specified coordinates or go to someone.
 * Do not propose locations that are greater than a total of 50 x, y, or z distance away from your current location, unless you are directed to do so by others.
 *
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {ISkillParams} params - The parameters for the skill function.
 * @param {number} params.x - The x coordinate of the target location.
 * @param {number} params.y - The y coordinate of the target location.
 * @param {number} params.z - The z coordinate of the target location.
 * @param {string} params.name - The name of the person to go to.
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully went to the location or person, false otherwise.
 */
export const goToKnownLocation = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'goToKnownLocation';
  const requiredParams = ['x', 'y', 'z'];
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
    x: params.x,
    y: params.y,
    z: params.z,
    name: params.name,
    signal: serviceParams.signal,
  };
  const {x, y, z, name, signal} = unpackedParams;

  if (!name) {
    await navigateToLocation(bot, {
      x,
      y,
      z,
      signal,
      range: 1,
      verbose: true,
      allowTeleport: false,
    });
  } else {
    await goToPerson(bot, {
      name,
      distance: 3,
      keepFollowing: false,
      signal,
    });
  }
};


