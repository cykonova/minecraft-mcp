import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

export interface IOpenNearbyChestParams {
  maxDistance?: number;
  chestType?: string;
}

/**
 * Atomic skill for opening a nearby chest
 * 
 * This skill handles:
 * - Finding nearby chests (regular, trapped, ender)
 * - Navigation to the chest
 * - Opening the chest interface
 * - Inventory presentation
 */
@injectable()
export class OpenNearbyChest extends AtomicSkill {
  readonly name = 'OpenNearbyChest';
  readonly description = 'Find and open a nearby chest to access its contents';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      maxDistance: {
        type: 'number',
        description: 'Maximum distance to search for chests (default: 16)',
        default: 16,
        minimum: 3,
        maximum: 32
      },
      chestType: {
        type: 'string',
        description: 'Type of chest to look for: "chest", "trapped_chest", "ender_chest", or "any"',
        enum: ['chest', 'trapped_chest', 'ender_chest', 'any'],
        default: 'any'
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { maxDistance = 16, chestType = 'any' } = params as IOpenNearbyChestParams;

    this.log('info', `Looking for ${chestType} within ${maxDistance} blocks`);

    try {
      // Find nearby chests
      const chests = this.findNearbyChests(bot, maxDistance, chestType);
      
      if (chests.length === 0) {
        return SkillResults.error(`No ${chestType === 'any' ? 'chests' : chestType} found within ${maxDistance} blocks`);
      }

      // Select the closest chest
      const targetChest = this.selectClosestChest(bot, chests);
      this.log('debug', `Found ${chests.length} chest(s), opening closest at ${targetChest.toString()}`);

      // Navigate to the chest
      await this.navigateToChest(bot, targetChest);

      // Open the chest
      const chestResult = await this.openChest(bot, targetChest);
      return chestResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to open chest: ${errorMessage}`);
    }
  }

  private findNearbyChests(bot: any, maxDistance: number, chestType: string): Vec3[] {
    const mcData = minecraftData((bot as any).version);
    const chestBlockIds: number[] = [];

    // Determine which chest types to look for
    if (chestType === 'any') {
      if (mcData.blocksByName.chest) chestBlockIds.push(mcData.blocksByName.chest.id);
      if (mcData.blocksByName.trapped_chest) chestBlockIds.push(mcData.blocksByName.trapped_chest.id);
      if (mcData.blocksByName.ender_chest) chestBlockIds.push(mcData.blocksByName.ender_chest.id);
    } else {
      const block = mcData.blocksByName[chestType];
      if (block) {
        chestBlockIds.push(block.id);
      }
    }

    if (chestBlockIds.length === 0) {
      return [];
    }

    try {
      return bot.findBlocks({
        matching: chestBlockIds,
        maxDistance,
        count: 10 // Find up to 10 chests
      });
    } catch (error) {
      this.log('warn', `Error finding chests: ${error}`);
      return [];
    }
  }

  private selectClosestChest(bot: any, chests: Vec3[]): Vec3 {
    const botPosition = bot.entity.position;
    
    return chests.reduce((closest, current) => {
      const closestDistance = botPosition.distanceTo(closest);
      const currentDistance = botPosition.distanceTo(current);
      
      return currentDistance < closestDistance ? current : closest;
    });
  }

  private async navigateToChest(bot: any, chestPosition: Vec3): Promise<void> {
    try {
      const distance = bot.entity.position.distanceTo(chestPosition);
      
      if (distance > 3) {
        this.log('debug', `Moving to chest (distance: ${distance.toFixed(2)})`);
        
        const goal = new GoalNear(chestPosition.x, chestPosition.y, chestPosition.z, 2);
        await (bot as any).pathfinder.goto(goal);
      }

      // Look at the chest
      await bot.lookAt(chestPosition.offset(0.5, 0.5, 0.5));
      await bot.waitForTicks(2);
      
    } catch (error) {
      throw new Error(`Could not reach chest: ${error}`);
    }
  }

  private async openChest(bot: any, chestPosition: Vec3): Promise<SkillResult> {
    try {
      const chestBlock = bot.blockAt(chestPosition);
      
      if (!chestBlock) {
        return SkillResults.error('Chest no longer exists at the target location');
      }

      this.log('debug', `Opening ${chestBlock.name} at ${chestPosition.toString()}`);

      // Open the chest
      const chest = await bot.openChest(chestBlock);
      
      if (!chest) {
        return SkillResults.error('Failed to open chest - it may be blocked or protected');
      }

      // Get chest contents
      const chestContents = this.getChestContents(chest);
      const chestInfo = this.formatChestInfo(chestBlock.name, chestPosition, chestContents);

      return SkillResults.success(
        {
          position: chestPosition,
          chestType: chestBlock.name,
          contents: chestContents,
          chest: chest // Include chest object for potential further operations
        },
        chestInfo
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle common chest opening errors
      if (errorMessage.includes('blocked')) {
        return SkillResults.error('Cannot open chest - path is blocked');
      } else if (errorMessage.includes('too far')) {
        return SkillResults.error('Too far from chest - try moving closer');
      } else if (errorMessage.includes('permission')) {
        return SkillResults.error('Permission denied - chest may be protected');
      }
      
      return SkillResults.error(`Failed to open chest: ${errorMessage}`);
    }
  }

  private getChestContents(chest: any): Array<{name: string, count: number, slot: number}> {
    try {
      const items = chest.containerItems();
      
      return items.map((item: any, index: number) => ({
        name: item.name,
        count: item.count,
        slot: index
      }));
    } catch (error) {
      this.log('warn', `Error getting chest contents: ${error}`);
      return [];
    }
  }

  private formatChestInfo(
    chestType: string, 
    position: Vec3, 
    contents: Array<{name: string, count: number, slot: number}>
  ): string {
    const lines: string[] = [];
    
    lines.push(`📦 CHEST OPENED 📦`);
    lines.push(`Type: ${chestType.replace(/_/g, ' ')}`);
    lines.push(`Location: ${position.x}, ${position.y}, ${position.z}`);
    
    if (contents.length === 0) {
      lines.push('Contents: Empty chest');
    } else {
      lines.push(`Contents (${contents.length} items):`);
      
      // Group items by name
      const itemCounts = new Map<string, number>();
      contents.forEach(item => {
        const current = itemCounts.get(item.name) || 0;
        itemCounts.set(item.name, current + item.count);
      });
      
      // Format item list
      itemCounts.forEach((count, name) => {
        lines.push(`- ${name.replace(/_/g, ' ')}: ${count}`);
      });
    }
    
    lines.push('');
    lines.push('You can now take items from or store items in this chest.');
    
    return lines.join('\n');
  }

  /**
   * Resource requirements for chest opening
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      environment: ['pathfinder'],
      blocks: ['chest'],
      conditions: ['Chest accessible', 'Not blocked by other blocks']
    };
  }

  /**
   * Estimate execution time based on search distance
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const maxDistance = params.maxDistance || 16;
    const baseTime = 2000; // 2 seconds base
    const navigationTime = Math.min(maxDistance * 200, 5000); // Max 5 seconds for navigation
    const openTime = 1000; // 1 second to open
    
    return baseTime + navigationTime + openTime;
  }
}