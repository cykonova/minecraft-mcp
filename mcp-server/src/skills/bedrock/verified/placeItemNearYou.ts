import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Place a block from inventory near your position for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.itemName - Name of the block/item to place
 * @param {object} params.position - Specific position to place at (optional)
 * @param {string} params.relativePosition - Relative position: front, back, left, right, up, down
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully placed the item
 */
export const placeItemNearYou = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'placeItemNearYou';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  
  // Validate required parameters
  if (!params.itemName) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide the required parameter 'itemName' for the ${skillName} skill.`,
    );
    return false;
  }
  const itemName = params.itemName as string;
  const position = params.position as {x: number, y: number, z: number} | undefined;
  const relativePosition = params.relativePosition as string;

  try {
    const inventory = (bot as any).getInventory();
    if (!inventory || !inventory.slots) {
      bot.emit(
        'alteraBotEndObservation',
        'Cannot access inventory',
      );
      return false;
    }

    // Find the item in inventory
    let targetItem = null;
    let targetSlot = -1;

    for (let i = 0; i < inventory.slots.length; i++) {
      const item = inventory.slots[i];
      if (item && 
          (item.name?.toLowerCase().includes(itemName.toLowerCase()) ||
           item.network_id?.toString() === itemName)) {
        targetItem = item;
        targetSlot = i;
        break;
      }
    }

    if (!targetItem) {
      bot.emit(
        'alteraBotEndObservation',
        `Item "${itemName}" not found in inventory`,
      );
      return false;
    }

    // Determine placement position
    let placePos: Vec3;
    const currentPos = (bot as any).getPosition();

    if (position) {
      placePos = new Vec3(position.x, position.y, position.z);
    } else if (relativePosition) {
      const offset = getRelativeOffset(relativePosition, (bot as any).entity?.yaw || 0);
      placePos = new Vec3(
        Math.floor(currentPos.x + offset.x),
        Math.floor(currentPos.y + offset.y),
        Math.floor(currentPos.z + offset.z)
      );
    } else {
      // Default to placing in front
      placePos = new Vec3(
        Math.floor(currentPos.x),
        Math.floor(currentPos.y - 1),
        Math.floor(currentPos.z + 1)
      );
    }

    // Check if position is valid (has a block to place against)
    const referenceBlock = findReferenceBlock(bot, placePos);
    if (!referenceBlock) {
      bot.emit(
        'alteraBotEndObservation',
        'No suitable surface found to place block against',
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Placing ${targetItem.name || itemName} at (${placePos.x}, ${placePos.y}, ${placePos.z})...`,
    );

    // Select the item in hotbar
    if (targetSlot >= 0 && targetSlot <= 8) {
      if ((bot as any).protocolHelpers) {
        await (bot as any).protocolHelpers.selectHotbarSlot(targetSlot);
      }
    } else {
      // Move item to hotbar first
      await (bot as any).equip(targetItem, 'hand');
    }

    // Look at the placement position
    await (bot as any).lookAt(placePos);

    // Place the block
    if ((bot as any).placeBlock) {
      const face = getFaceVector(referenceBlock.position, placePos);
      await (bot as any).placeBlock(referenceBlock, face);
    } else if ((bot as any).protocolHelpers) {
      await (bot as any).protocolHelpers.placeBlock(placePos);
    }

    bot.emit(
      'alteraBotEndObservation',
      `Placed ${targetItem.name || itemName} at (${placePos.x}, ${placePos.y}, ${placePos.z})`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to place item: ${errorMessage}`,
    );
    return false;
  }
};

function getRelativeOffset(direction: string, yaw: number): Vec3 {
  switch (direction) {
    case 'front':
      return new Vec3(Math.sin(yaw) * 2, 0, Math.cos(yaw) * 2);
    case 'back':
      return new Vec3(-Math.sin(yaw) * 2, 0, -Math.cos(yaw) * 2);
    case 'left':
      return new Vec3(Math.cos(yaw) * 2, 0, -Math.sin(yaw) * 2);
    case 'right':
      return new Vec3(-Math.cos(yaw) * 2, 0, Math.sin(yaw) * 2);
    case 'up':
      return new Vec3(0, 2, 0);
    case 'down':
      return new Vec3(0, -1, 0);
    default:
      return new Vec3(0, 0, 1);
  }
}

function findReferenceBlock(bot: any, targetPos: Vec3): any {
  // Check adjacent blocks to find one to place against
  const offsets = [
    new Vec3(0, -1, 0), // Below
    new Vec3(1, 0, 0),  // East
    new Vec3(-1, 0, 0), // West
    new Vec3(0, 0, 1),  // South
    new Vec3(0, 0, -1), // North
    new Vec3(0, 1, 0)   // Above
  ];

  for (const offset of offsets) {
    const checkPos = targetPos.plus(offset);
    const block = (bot as any).blockAt(checkPos);
    
    if (block && block.type !== 0) {
      return {
        ...block,
        position: checkPos
      };
    }
  }

  return null;
}

function getFaceVector(from: Vec3, to: Vec3): Vec3 {
  return to.minus(from).normalize();
}