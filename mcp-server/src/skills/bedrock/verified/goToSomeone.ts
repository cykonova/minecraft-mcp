import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Navigate to a specific player in Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.username - The username of the player to go to
 * @param {number} params.distance - How close to get to the player (default: 3)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully navigated to the player
 */
export const goToSomeone = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'goToSomeone';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  
  // Validate required parameters
  if (!params.username) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide the required parameter 'username' for the ${skillName} skill.`,
    );
    return false;
  }
  
  const username = params.username as string;
  const distance = (params.distance as number) || 3;

  try {
    // Find the player
    const players = (bot as any).getPlayers ? (bot as any).getPlayers() : [];
    const targetPlayer = players.find((p: any) => 
      p.username?.toLowerCase() === username.toLowerCase()
    );

    if (!targetPlayer) {
      bot.emit(
        'alteraBotEndObservation',
        `Player ${username} not found`,
      );
      return false;
    }

    // Get player position
    const targetPosition = targetPlayer.position;
    if (!targetPosition) {
      bot.emit(
        'alteraBotEndObservation',
        `Cannot determine position of ${username}`,
      );
      return false;
    }

    const targetVec = new Vec3(
      targetPosition.x,
      targetPosition.y,
      targetPosition.z
    );

    bot.emit(
      'alteraBotTextObservation',
      `Navigating to ${username}...`,
    );

    // Navigate to the player
    if ((bot as any).navigateTo) {
      await (bot as any).navigateTo(targetVec, {
        maxDistance: distance
      });
    } else {
      // Fallback to simple movement
      await (bot as any).moveTo({
        x: targetVec.x,
        y: targetVec.y,
        z: targetVec.z
      });
    }

    const currentPos = (bot as any).getPosition();
    const finalDistance = Math.sqrt(
      Math.pow(currentPos.x - targetVec.x, 2) +
      Math.pow(currentPos.y - targetVec.y, 2) +
      Math.pow(currentPos.z - targetVec.z, 2)
    );

    bot.emit(
      'alteraBotEndObservation',
      `Navigated to ${username} (distance: ${finalDistance.toFixed(1)} blocks)`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to navigate to ${username}: ${errorMessage}`,
    );
    return false;
  }
};