import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Find and open a nearby chest or container for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.containerType - Type of container to open (default: any)
 * @param {number} params.searchRadius - How far to search for containers (default: 10)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully opened a container
 */
export const openNearbyChest = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'openNearbyChest';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  const containerType = (params.containerType as string) || 'any';
  const searchRadius = (params.searchRadius as number) || 10;

  try {
    const currentPos = (bot as any).getPosition();
    let nearestContainer: any = null;
    let minDistance = Infinity;

    // Container types to search for
    const containerNames = containerType === 'any' ? 
      ['chest', 'barrel', 'shulker_box', 'ender_chest', 'trapped_chest'] :
      [containerType];

    // Search for containers
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
          const isContainer = containerNames.some(name => 
            blockNameLower.includes(name)
          );

          if (isContainer) {
            const distance = Math.sqrt(x * x + y * y + z * z);
            if (distance < minDistance) {
              minDistance = distance;
              nearestContainer = {
                block: block,
                position: checkPos,
                distance: distance
              };
            }
          }
        }
      }
    }

    if (!nearestContainer) {
      bot.emit(
        'alteraBotEndObservation',
        containerType === 'any' ? 
          `No containers found within ${searchRadius} blocks` :
          `No ${containerType} found within ${searchRadius} blocks`,
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Found ${nearestContainer.block.name || 'container'} at distance ${nearestContainer.distance.toFixed(1)} blocks. Approaching...`,
    );

    // Navigate to the container
    const approachPos = new Vec3(
      nearestContainer.position.x + 0.5,
      nearestContainer.position.y,
      nearestContainer.position.z + 0.5
    );

    if ((bot as any).navigateTo) {
      await (bot as any).navigateTo(approachPos, { maxDistance: 3 });
    } else {
      await (bot as any).moveTo({
        x: approachPos.x,
        y: approachPos.y,
        z: approachPos.z
      });
    }

    // Look at the container
    await (bot as any).lookAt(nearestContainer.position);

    // Open the container
    if ((bot as any).activateBlock) {
      await (bot as any).activateBlock(nearestContainer.block);
    } else if ((bot as any).protocolHelpers) {
      await (bot as any).protocolHelpers.openContainer(nearestContainer.position);
    }

    // Wait for container to open
    await new Promise(resolve => setTimeout(resolve, 500));

    bot.emit(
      'alteraBotEndObservation',
      `Opened ${nearestContainer.block.name || 'container'} at (${nearestContainer.position.x}, ${nearestContainer.position.y}, ${nearestContainer.position.z})`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to open container: ${errorMessage}`,
    );
    return false;
  }
};