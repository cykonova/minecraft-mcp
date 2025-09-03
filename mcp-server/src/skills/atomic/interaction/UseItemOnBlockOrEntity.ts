import { injectable } from 'tsyringe';
import minecraftData from 'minecraft-data';
import { closest, distance } from 'fastest-levenshtein';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const { goals: { GoalNear } } = mineflayer_pathfinder;

export interface IUseItemOnBlockOrEntityParams {
  item: string;
  target: string;
  count?: number;
}

/**
 * Atomic skill for using items on blocks or entities
 * 
 * This skill handles:
 * - Equipping the specified item (or using hands if no item)
 * - Finding the target (block or entity) by fuzzy matching
 * - Navigating to the target if needed
 * - Performing the use interaction
 * - Handling both single and multiple target interactions
 */
@injectable()
export class UseItemOnBlockOrEntity extends AtomicSkill {
  readonly name = 'useItemOnBlockOrEntity';
  readonly description = 'Use an equipped item on a block or entity';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['item', 'target'],
    properties: {
      item: {
        type: 'string',
        description: 'The name of the item to use (or empty/null for hands)',
        maxLength: 50
      },
      target: {
        type: 'string',
        description: 'The target block or entity to use the item on',
        minLength: 1,
        maxLength: 50
      },
      count: {
        type: 'number',
        description: 'The number of targets to interact with (default: 1)',
        default: 1,
        minimum: 1,
        maximum: 20
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { item, target, count = 1 } = params as IUseItemOnBlockOrEntityParams;

    try {
      const mcData = minecraftData((bot as any).version);
      
      // Handle item equipment
      let itemName = 'hands';
      if (item && item.trim() !== '') {
        const result = await this.equipItem(bot, item);
        if (!result.success) {
          return result;
        }
        itemName = result.data.itemName;
      }

      // Determine if target is block or entity
      const targetInfo = this.determineTargetType(target, mcData);
      if (!targetInfo.success) {
        return SkillResults.error(targetInfo.message);
      }

      this.log('info', `Using ${itemName} on ${count} ${targetInfo.data.name}(s)`);

      // Execute the interaction
      if (targetInfo.data.type === 'entity') {
        return await this.useItemOnEntities(bot, itemName, targetInfo.data.name, count, signal);
      } else {
        return await this.useItemOnBlocks(bot, itemName, targetInfo.data.name, count, signal);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to use item: ${errorMessage}`);
    }
  }

  /**
   * Equip the specified item
   */
  private async equipItem(bot: any, itemName: string): Promise<SkillResult> {
    // Find closest matching item name
    const closestItemName = this.findClosestItemName(itemName, bot);
    if (!closestItemName) {
      return SkillResults.error(`No item named '${itemName}' exists in Minecraft`);
    }

    // Check if item is in inventory
    const inventoryItem = bot.inventory.findInventoryItem(closestItemName, null, false);
    if (!inventoryItem) {
      return SkillResults.error(`You don't have any ${closestItemName} in your inventory`);
    }

    // Equip the item
    await bot.equip(inventoryItem, 'hand');
    
    return SkillResults.success({ itemName: closestItemName }, `Equipped ${closestItemName}`);
  }

  /**
   * Determine if target is a block or entity
   */
  private determineTargetType(target: string, mcData: any): {
    success: boolean;
    message?: string;
    data?: { type: 'block' | 'entity'; name: string };
  } {
    // Special case for boats
    let targetName = target;
    if (target.toLowerCase().includes('boat')) {
      targetName = 'boat';
    }

    // Check entities
    const entityName = closest(targetName.toLowerCase(), Object.keys(mcData.entitiesByName));
    const entityDistance = distance(targetName.toLowerCase(), entityName);

    // Check blocks  
    const blockName = closest(targetName.toLowerCase(), Object.keys(mcData.blocksByName));
    const blockDistance = distance(targetName.toLowerCase(), blockName);

    const isEntity = entityDistance < 4;
    const isBlock = blockDistance < 4;

    if (!isEntity && !isBlock) {
      return {
        success: false,
        message: `Target '${target}' not found. Did you mean '${entityName}' or '${blockName}'?`
      };
    }

    if (isEntity && isBlock) {
      // Choose the closer match
      if (blockDistance < entityDistance) {
        return { success: true, data: { type: 'block', name: blockName } };
      } else {
        return { success: true, data: { type: 'entity', name: entityName } };
      }
    }

    if (isEntity) {
      return { success: true, data: { type: 'entity', name: entityName } };
    } else {
      return { success: true, data: { type: 'block', name: blockName } };
    }
  }

  /**
   * Use item on entities
   */
  private async useItemOnEntities(
    bot: any,
    itemName: string,
    entityName: string,
    count: number,
    signal?: AbortSignal
  ): Promise<SkillResult> {
    // Find nearby entities
    const nearbyEntities = Object.values(bot.entities).filter((entity: any) =>
      entity.name === entityName &&
      bot.entity.position.distanceTo(entity.position) <= bot.nearbyEntityRadius
    );

    if (nearbyEntities.length === 0) {
      return SkillResults.error(`No ${entityName} found nearby`);
    }

    // Sort by distance and take the requested count
    nearbyEntities.sort((a: any, b: any) =>
      a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
    );
    
    const targetEntities = nearbyEntities.slice(0, count);
    let successCount = 0;

    for (const entity of targetEntities) {
      if (signal?.aborted) {
        break;
      }

      try {
        // Check if entity still exists
        if (!bot.entities[(entity as any).id]) {
          this.log('warn', `Entity ${entityName} no longer exists, skipping`);
          continue;
        }

        // Move to entity if needed
        const distance = (entity as any).position.distanceTo(bot.entity.position);
        if (distance > 2) {
          await this.moveToTarget(bot, (entity as any).position);
        }

        // Look at and use on entity
        await bot.lookAt((entity as any).position);
        await bot.useOn(entity);
        await bot.waitForTicks(5);

        successCount++;
        this.log('debug', `Successfully used ${itemName} on ${entityName} (${successCount}/${targetEntities.length})`);

      } catch (error) {
        this.log('warn', `Failed to use ${itemName} on ${entityName}: ${error}`);
      }
    }

    return SkillResults.success(
      { successCount, totalTargets: targetEntities.length },
      `Successfully used ${itemName} on ${successCount}/${targetEntities.length} ${entityName}(s)`
    );
  }

  /**
   * Use item on blocks
   */
  private async useItemOnBlocks(
    bot: any,
    itemName: string,
    blockName: string,
    count: number,
    signal?: AbortSignal
  ): Promise<SkillResult> {
    const mcData = minecraftData((bot as any).version);
    const blockId = mcData.blocksByName[blockName]?.id;
    
    if (!blockId) {
      return SkillResults.error(`Block '${blockName}' not found in Minecraft data`);
    }

    // Find nearby blocks
    const blockPositions = bot.findBlocks({
      matching: blockId,
      maxDistance: bot.nearbyBlockXZRange || 16,
      count: count
    });

    if (blockPositions.length === 0) {
      return SkillResults.error(`No ${blockName} blocks found nearby`);
    }

    const targetPositions = blockPositions.slice(0, count);
    let successCount = 0;

    for (const position of targetPositions) {
      if (signal?.aborted) {
        break;
      }

      try {
        const block = bot.blockAt(position);
        if (!block) {
          this.log('warn', `Block at ${position} no longer exists, skipping`);
          continue;
        }

        // Move to block if needed
        const distance = position.distanceTo(bot.entity.position);
        if (distance > 2) {
          await this.moveToTarget(bot, position);
        }

        // Look at and use on block
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
        
        // Use the item on the block
        if (itemName === 'hands') {
          // Just right-click the block
          await bot.activateBlock(block);
        } else {
          // Use the equipped item on the block
          await bot._client.write('use_item', { hand: 0 });
          await bot._client.write('block_place', {
            location: block.position,
            direction: 1, // Top face
            hand: 0,
            cursorX: 0.5,
            cursorY: 0.5,
            cursorZ: 0.5,
            insideBlock: false
          });
        }
        
        await bot.waitForTicks(5);

        successCount++;
        this.log('debug', `Successfully used ${itemName} on ${blockName} at ${position} (${successCount}/${targetPositions.length})`);

      } catch (error) {
        this.log('warn', `Failed to use ${itemName} on ${blockName} at ${position}: ${error}`);
      }
    }

    return SkillResults.success(
      { successCount, totalTargets: targetPositions.length },
      `Successfully used ${itemName} on ${successCount}/${targetPositions.length} ${blockName}(s)`
    );
  }

  /**
   * Move to a target position
   */
  private async moveToTarget(bot: any, position: any): Promise<void> {
    if (!bot.pathfinder) {
      throw new Error('Pathfinder plugin not available');
    }

    const goal = new GoalNear(position.x, position.y, position.z, 2);
    await bot.pathfinder.goto(goal);
  }

  /**
   * Find closest matching item name
   */
  private findClosestItemName(inputName: string, bot: any): string | null {
    const mcData = minecraftData((bot as any).version);
    const itemNames = Object.keys(mcData.itemsByName);
    
    const closestMatch = closest(inputName.toLowerCase(), itemNames);
    const matchDistance = distance(inputName.toLowerCase(), closestMatch);
    
    if (matchDistance > 3) {
      return null; // Too different
    }
    
    return closestMatch;
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    const requirements: any = {
      environment: ['pathfinder']
    };

    if (params.item && params.item.trim() !== '') {
      requirements.items = [params.item];
    }

    return requirements;
  }

  /**
   * Estimate execution time based on target count
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const baseTime = 3000; // 3 seconds for setup
    const perTargetTime = 2000; // 2 seconds per target
    const count = params.count || 1;
    
    return baseTime + (count * perTargetTime);
  }

  /**
   * This skill can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    const { bot } = context;
    try {
      // Stop any active pathfinding
      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
      }
      this.log('info', 'Item use cancelled');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}