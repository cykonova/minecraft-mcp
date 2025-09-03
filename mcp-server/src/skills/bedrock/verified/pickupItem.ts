import { Vec3 } from 'vec3';
import { ISkillParams, ISkillServiceParams } from '../../../types/skillType.js';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Navigate to and pick up dropped items for Bedrock Edition
 * 
 * @param {UnifiedBot} bot - The Bedrock bot instance.
 * @param {ISkillParams} params - The parameters for the skill.
 * @param {string} params.itemName - Name of the item to pick up (optional, picks up nearest if not specified)
 * @param {number} params.searchRadius - How far to search for items (default: 20)
 * @param {number} params.maxItems - Maximum number of items to pick up (default: 1)
 * @param {ISkillServiceParams} serviceParams - Additional parameters for the skill.
 * 
 * @return {Promise<boolean>} - Returns true if the bot successfully picked up items
 */
export const pickupItem = async (
  bot: UnifiedBot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'pickupItem';
  
  // Validate bot edition
  if (bot.edition !== 'bedrock') {
    bot.emit(
      'alteraBotEndObservation',
      `Error: ${skillName} skill requires a Bedrock Edition bot, but got ${bot.edition} edition`,
    );
    return false;
  }
  const itemName = params.itemName as string;
  const searchRadius = (params.searchRadius as number) || 20;
  const maxItems = (params.maxItems as number) || 1;

  try {
    const currentPos = (bot as any).getPosition();
    let itemsPickedUp = 0;
    let itemEntities: any[] = [];

    // Find dropped items (entities)
    const filter = (entity: any) => {
      // Check if it's an item entity
      if (entity.type !== 'item' && !entity.name?.includes('item')) {
        return false;
      }

      // Check distance
      if (entity.position) {
        const distance = Math.sqrt(
          Math.pow(entity.position.x - currentPos.x, 2) +
          Math.pow(entity.position.y - currentPos.y, 2) +
          Math.pow(entity.position.z - currentPos.z, 2)
        );
        if (distance > searchRadius) {
          return false;
        }
      }

      // Check item name if specified
      if (itemName && entity.metadata?.item) {
        const entityItemName = entity.metadata.item.name || '';
        if (!entityItemName.toLowerCase().includes(itemName.toLowerCase())) {
          return false;
        }
      }

      return true;
    };

    // Get nearest item entity
    const nearestItem = (bot as any).nearestEntity?.(filter);
    
    if (!nearestItem) {
      bot.emit(
        'alteraBotEndObservation',
        itemName ? 
          `No ${itemName} found within ${searchRadius} blocks` :
          `No items found within ${searchRadius} blocks`,
      );
      return false;
    }

    bot.emit(
      'alteraBotTextObservation',
      `Moving to pick up item at (${nearestItem.position?.x.toFixed(1)}, ${nearestItem.position?.y.toFixed(1)}, ${nearestItem.position?.z.toFixed(1)})...`,
    );

    // Navigate to the item
    const itemPos = nearestItem.position || currentPos;
    const targetPos = new Vec3(itemPos.x, itemPos.y, itemPos.z);

    if ((bot as any).navigateTo) {
      await (bot as any).navigateTo(targetPos, {
        maxDistance: 1.5
      });
    } else {
      await (bot as any).moveTo({
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z
      });
    }

    // Wait for pickup (items are picked up automatically when close enough)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if we picked up items (simplified check)
    const finalPos = (bot as any).getPosition();
    const distanceToItem = Math.sqrt(
      Math.pow(finalPos.x - targetPos.x, 2) +
      Math.pow(finalPos.y - targetPos.y, 2) +
      Math.pow(finalPos.z - targetPos.z, 2)
    );

    if (distanceToItem < 2) {
      itemsPickedUp++;
    }

    if (itemsPickedUp === 0) {
      bot.emit(
        'alteraBotEndObservation',
        'Could not pick up any items',
      );
      return false;
    }

    bot.emit(
      'alteraBotEndObservation',
      itemName ? 
        `Picked up ${itemsPickedUp} ${itemName}` :
        `Picked up ${itemsPickedUp} item(s)`,
    );
    return true;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot.emit(
      'alteraBotEndObservation',
      `Failed to pick up items: ${errorMessage}`,
    );
    return false;
  }
};