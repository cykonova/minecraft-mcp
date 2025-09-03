import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Mine blocks to gather resources for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.blockName - Name of the block to mine
 * @param {number} params.count - Number of blocks to mine (default: 1)
 * @param {number} params.searchRadius - How far to search for blocks (default: 10)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully mined blocks
 */
export const mineResource = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'mineResource';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  
  // Validate required parameters
  if (!params.blockName) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide the required parameter 'blockName' for the ${skillName} skill.`,
    );
    return false;
  }
  const blockName = params.blockName as string;
  const count = (params.count as number) || 1;
  const searchRadius = (params.searchRadius as number) || 10;

  try {
    const currentPos = (bot as any).getPosition();
    let blocksMinedCount = 0;
    const targetBlocks: any[] = [];

    // Search for target blocks
    for (let x = -searchRadius; x <= searchRadius; x++) {
      for (let y = -searchRadius / 2; y <= searchRadius / 2; y++) {
        for (let z = -searchRadius; z <= searchRadius; z++) {
          if (targetBlocks.length >= count) break;

          const checkPos = new Vec3(
            Math.floor(currentPos.x + x),
            Math.floor(currentPos.y + y),
            Math.floor(currentPos.z + z)
          );

          const block = (bot as any).blockAt(checkPos);
          if (block && block.name?.toLowerCase().includes(blockName.toLowerCase())) {
            targetBlocks.push({
              position: checkPos,
              block: block,
              distance: Math.sqrt(x * x + y * y + z * z)
            });
          }
        }
      }
    }

    if (targetBlocks.length === 0) {
      bot.emit(
        'alteraBotEndObservation',
        `No ${blockName} blocks found within ${searchRadius} blocks`,
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Found ${targetBlocks.length} ${blockName} block(s). Starting mining...`,
    );

    // Sort by distance
    targetBlocks.sort((a, b) => a.distance - b.distance);

    // Mine the blocks
    for (let i = 0; i < Math.min(count, targetBlocks.length); i++) {
      const target = targetBlocks[i];

      // Navigate to the block
      const miningPos = new Vec3(
        target.position.x,
        target.position.y,
        target.position.z
      );

      // Move close to the block
      const approachPos = new Vec3(
        miningPos.x + 0.5,
        miningPos.y,
        miningPos.z + 0.5
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

      // Look at the block
      await (bot as any).lookAt(miningPos);

      bot.emit(
        'alteraBotTextObservation',
        `Mining ${blockName} block ${i + 1}/${Math.min(count, targetBlocks.length)}...`,
      );

      // Mine the block
      if ((bot as any).digBlock) {
        await (bot as any).digBlock(miningPos);
      } else if ((bot as any).protocolHelpers) {
        await (bot as any).protocolHelpers.startBreakBlock(miningPos);
        
        // Calculate break time (simplified)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await (bot as any).protocolHelpers.stopBreakBlock(miningPos);
      }

      blocksMinedCount++;
      
      // Wait a bit before mining next block
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (blocksMinedCount === 0) {
      bot.emit(
        'alteraBotEndObservation',
        'Could not mine any blocks',
      );
      return false;
    }

    bot.emit(
      'alteraBotEndObservation',
      `Mined ${blocksMinedCount} ${blockName} block(s)`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to mine resource: ${errorMessage}`,
    );
    return false;
  }
};