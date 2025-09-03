import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Find and navigate to the nearest land when in water for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {number} params.searchRadius - How far to search for land (default: 50)
 * @param {string} params.preferredDirection - Preferred direction to search (north, south, east, west)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully found and swam to land
 */
export const swimToLand = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'swimToLand';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  const searchRadius = (params.searchRadius as number) || 50;
  const preferredDirection = params.preferredDirection as string;

  try {
    const currentPos = (bot as any).getPosition();
    
    // Check if bot is in water
    const currentBlock = (bot as any).blockAt?.(new Vec3(
      Math.floor(currentPos.x),
      Math.floor(currentPos.y),
      Math.floor(currentPos.z)
    ));

    const isInWater = currentBlock?.name?.includes('water') || 
                      currentBlock?.type === 8 || 
                      currentBlock?.type === 9;

    if (!isInWater) {
      bot.emit(
        'alteraBotEndObservation',
        'Already on land',
      );
      return true;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Searching for land within ${searchRadius} blocks...`,
    );

    // Search for land in expanding circles
    let landFound: Vec3 | null = null;
    const searchStep = 4;

    // Define search directions
    const directions = preferredDirection ? 
      [getDirectionVector(preferredDirection)] : 
      [
        new Vec3(1, 0, 0),   // East
        new Vec3(-1, 0, 0),  // West
        new Vec3(0, 0, 1),   // South
        new Vec3(0, 0, -1),  // North
        new Vec3(1, 0, 1),   // Southeast
        new Vec3(-1, 0, 1),  // Southwest
        new Vec3(1, 0, -1),  // Northeast
        new Vec3(-1, 0, -1)  // Northwest
      ];

    // Search for land
    for (let radius = searchStep; radius <= searchRadius && !landFound; radius += searchStep) {
      for (const direction of directions) {
        const checkPos = new Vec3(
          currentPos.x + direction.x * radius,
          currentPos.y,
          currentPos.z + direction.z * radius
        );

        // Check multiple heights
        for (let yOffset = -2; yOffset <= 2; yOffset++) {
          const testPos = checkPos.offset(0, yOffset, 0);
          const block = (bot as any).blockAt?.(testPos);
          const blockAbove = (bot as any).blockAt?.(testPos.offset(0, 1, 0));
          const blockBelow = (bot as any).blockAt?.(testPos.offset(0, -1, 0));

          // Check if this is a valid land position
          if (blockBelow && blockAbove) {
            const isGroundSolid = blockBelow.type !== 0 && 
                                  !blockBelow.name?.includes('water') &&
                                  !blockBelow.name?.includes('lava');
            const isSpaceClear = blockAbove.type === 0 || 
                               blockAbove.name?.includes('air');
            const isCurrentClear = block?.type === 0 || 
                                 block?.name?.includes('air');

            if (isGroundSolid && isSpaceClear && isCurrentClear) {
              landFound = testPos;
              break;
            }
          }
        }

        if (landFound) break;
      }
    }

    if (!landFound) {
      bot.emit(
        'alteraBotEndObservation',
        `No land found within ${searchRadius} blocks`,
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Found land! Swimming towards (${landFound.x}, ${landFound.y}, ${landFound.z})...`,
    );

    // Navigate to land
    if ((bot as any).navigateTo) {
      await (bot as any).navigateTo(landFound, {
        maxDistance: searchRadius * 2,
        avoidWater: false // Need to go through water to reach land
      });
    } else {
      // Simple movement towards land
      await (bot as any).moveTo({
        x: landFound.x,
        y: landFound.y,
        z: landFound.z
      });
    }

    const finalPos = (bot as any).getPosition();
    const finalBlock = (bot as any).blockAt?.(new Vec3(
      Math.floor(finalPos.x),
      Math.floor(finalPos.y),
      Math.floor(finalPos.z)
    ));

    const stillInWater = finalBlock?.name?.includes('water');

    if (stillInWater) {
      bot.emit(
        'alteraBotEndObservation',
        'Could not reach land, still in water',
      );
      return false;
    }

    bot.emit(
      'alteraBotEndObservation',
      `Successfully reached land at (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)}, ${finalPos.z.toFixed(1)})`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to swim to land: ${errorMessage}`,
    );
    return false;
  }
};

function getDirectionVector(direction: string): Vec3 {
  switch (direction) {
    case 'north': return new Vec3(0, 0, -1);
    case 'south': return new Vec3(0, 0, 1);
    case 'east': return new Vec3(1, 0, 0);
    case 'west': return new Vec3(-1, 0, 0);
    default: return new Vec3(0, 0, 0);
  }
}