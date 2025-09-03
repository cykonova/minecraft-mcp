import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Find and sleep in a nearby bed for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {number} params.searchRadius - How far to search for beds (default: 20)
 * @param {string} params.preferColor - Preferred bed color (optional)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully slept in a bed
 */
export const sleepInNearbyBed = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'sleepInNearbyBed';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  const searchRadius = (params.searchRadius as number) || 20;
  const preferColor = (params.preferColor as string) || 'any';

  try {
    const currentPos = (bot as any).getPosition();
    let nearestBed: any = null;
    let minDistance = Infinity;

    // Search for beds
    for (let x = -searchRadius; x <= searchRadius; x++) {
      for (let y = -searchRadius / 2; y <= searchRadius / 2; y++) {
        for (let z = -searchRadius; z <= searchRadius; z++) {
          const checkPos = new Vec3(
            Math.floor(currentPos.x + x),
            Math.floor(currentPos.y + y),
            Math.floor(currentPos.z + z)
          );

          const block = (bot as any).blockAt(checkPos);
          if (!block) continue;

          const blockNameLower = (block.name || '').toLowerCase();
          const isBed = blockNameLower.includes('bed');

          if (isBed) {
            // Check color preference
            if (preferColor !== 'any' && !blockNameLower.includes(preferColor)) {
              continue;
            }

            const distance = Math.sqrt(x * x + y * y + z * z);
            if (distance < minDistance) {
              minDistance = distance;
              nearestBed = {
                block: block,
                position: checkPos,
                distance: distance
              };
            }
          }
        }
      }
    }

    if (!nearestBed) {
      bot.emit(
        'alteraBotEndObservation',
        preferColor === 'any' ? 
          `No beds found within ${searchRadius} blocks` :
          `No ${preferColor} beds found within ${searchRadius} blocks`,
      );
      return false;
    }

    // Check if it's night time (simplified check)
    // In a real implementation, you'd check the actual time
    const timeOfDay = (bot as any).time?.timeOfDay || 0;
    const isNightTime = timeOfDay >= 12542 && timeOfDay <= 23458;

    if (!isNightTime) {
      bot.emit(
        'alteraBotEndObservation',
        'You can only sleep at night or during thunderstorms',
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Found ${nearestBed.block.name || 'bed'} at distance ${nearestBed.distance.toFixed(1)} blocks. Moving to bed...`,
    );

    // Navigate to the bed
    const approachPos = new Vec3(
      nearestBed.position.x + 0.5,
      nearestBed.position.y,
      nearestBed.position.z + 0.5
    );

    if ((bot as any).navigateTo) {
      await (bot as any).navigateTo(approachPos, { maxDistance: 2 });
    } else {
      await (bot as any).moveTo({
        x: approachPos.x,
        y: approachPos.y,
        z: approachPos.z
      });
    }

    // Look at the bed
    await (bot as any).lookAt(nearestBed.position);

    // Use the bed (right-click)
    if ((bot as any).activateBlock) {
      await (bot as any).activateBlock(nearestBed.block);
    } else if ((bot as any).protocolHelpers) {
      await (bot as any).protocolHelpers.openContainer(nearestBed.position);
    }

    // Wait for sleep animation to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're sleeping (simplified)
    const isSleeping = (bot as any).isSleeping || false;

    if (!isSleeping) {
      bot.emit(
        'alteraBotEndObservation',
        'Could not sleep in bed. It might be occupied or obstructed.',
      );
      return false;
    }

    bot.emit(
      'alteraBotEndObservation',
      `Sleeping in ${nearestBed.block.name || 'bed'} at (${nearestBed.position.x}, ${nearestBed.position.y}, ${nearestBed.position.z})`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to sleep in bed: ${errorMessage}`,
    );
    return false;
  }
};