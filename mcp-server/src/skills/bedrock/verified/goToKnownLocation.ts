import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Navigate to specific coordinates in the world for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {number} params.x - X coordinate
 * @param {number} params.y - Y coordinate  
 * @param {number} params.z - Z coordinate
 * @param {number} params.timeout - Timeout in milliseconds (default: 30000)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully navigated to the location
 */
export const goToKnownLocation = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'goToKnownLocation';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  
  // Validate required parameters
  if (typeof params.x !== 'number' || typeof params.y !== 'number' || typeof params.z !== 'number') {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide the required parameters 'x', 'y', and 'z' coordinates for the ${skillName} skill.`,
    );
    return false;
  }
  const x = params.x as number;
  const y = params.y as number;
  const z = params.z as number;
  const timeout = (params.timeout as number) || 30000;

  try {
    const targetPosition = new Vec3(x, y, z);
    const startPosition = (bot as any).getPosition();
    const distance = Math.sqrt(
      Math.pow(startPosition.x - x, 2) +
      Math.pow(startPosition.y - y, 2) +
      Math.pow(startPosition.z - z, 2)
    );

    if (distance > 256) {
      bot.emit(
        'alteraBotEndObservation',
        `Target location is too far (${distance.toFixed(1)} blocks). Maximum distance is 256 blocks.`,
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Navigating to coordinates (${x}, ${y}, ${z})...`,
    );

    // Use navigateTo if available (with pathfinding)
    if ((bot as any).navigateTo) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Navigation timeout')), timeout);
      });

      const navigationPromise = (bot as any).navigateTo(targetPosition, {
        maxDistance: 256,
        timeout: timeout
      });

      await Promise.race([navigationPromise, timeoutPromise]);
    } else {
      // Fallback to simple movement
      await (bot as any).moveTo({ x, y, z });
    }

    const finalPosition = (bot as any).getPosition();
    const finalDistance = Math.sqrt(
      Math.pow(finalPosition.x - x, 2) +
      Math.pow(finalPosition.y - y, 2) +
      Math.pow(finalPosition.z - z, 2)
    );

    if (finalDistance > 5) {
      bot.emit(
        'alteraBotEndObservation',
        `Moved closer to target location (${finalDistance.toFixed(1)} blocks away). Could not reach exact location.`,
      );
      return true;
    }

    bot.emit(
      'alteraBotEndObservation',
      `Arrived at location (${x}, ${y}, ${z})`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Navigation timeout') {
      const currentPos = (bot as any).getPosition();
      bot.emit(
        'alteraBotEndObservation',
        `Navigation timed out. Current position: (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)})`,
      );
      return false;
    }

    bot.emit(
      'alteraBotEndObservation',
      `Failed to navigate to location: ${errorMessage}`,
    );
    return false;
  }
};