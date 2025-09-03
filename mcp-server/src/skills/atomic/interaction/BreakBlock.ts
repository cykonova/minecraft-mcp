import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

export interface IBreakBlockParams {
  x: number;
  y: number;
  z: number;
  collect?: boolean;
  timeout?: number;
}

/**
 * Atomic skill for breaking a single block at specific coordinates
 * 
 * This skill handles:
 * - Navigation to the block
 * - Tool selection (if needed)
 * - Block breaking
 * - Optional item collection
 */
@injectable()
export class BreakBlock extends AtomicSkill {
  readonly name = 'BreakBlock';
  readonly description = 'Break a single block at the specified coordinates';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['x', 'y', 'z'],
    properties: {
      x: {
        type: 'number',
        description: 'X coordinate of the block to break'
      },
      y: {
        type: 'number',
        description: 'Y coordinate of the block to break'
      },
      z: {
        type: 'number',
        description: 'Z coordinate of the block to break'
      },
      collect: {
        type: 'boolean',
        description: 'Whether to collect the dropped items after breaking (default: true)',
        default: true
      },
      timeout: {
        type: 'number',
        description: 'Maximum time in milliseconds to spend breaking (default: 10000)',
        default: 10000,
        minimum: 1000,
        maximum: 60000
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { x, y, z, collect = true, timeout = 10000 } = params as IBreakBlockParams;

    const position = new Vec3(x, y, z);
    const block = bot.blockAt(position);

    // Validate block exists and is breakable
    if (!block) {
      return SkillResults.error(`No block found at position ${position.toString()}`);
    }

    if (block.name === 'air') {
      return SkillResults.error(`Cannot break air block at ${position.toString()}`);
    }

    // Check if block is unbreakable (bedrock, barrier, etc.)
    const unbreakableBlocks = ['bedrock', 'barrier', 'structure_void', 'structure_block'];
    if (unbreakableBlocks.includes(block.name)) {
      return SkillResults.error(`Cannot break unbreakable block: ${block.name}`);
    }

    this.log('info', `Breaking ${block.name} at ${position.toString()}`);

    try {
      // Get distance to block
      const distance = bot.entity.position.distanceTo(position);
      
      // Move closer if needed (within reach distance ~5 blocks)
      if (distance > 5) {
        this.log('debug', `Moving closer to block (distance: ${distance.toFixed(2)})`);
        
        const goal = new GoalNear(x, y, z, 3);
        await (bot as any).pathfinder.goto(goal);
      }

      // Look at the block
      await bot.lookAt(position.offset(0.5, 0.5, 0.5));

      // Try to equip the best tool for this block
      await this.equipBestTool(bot, block);

      // Record inventory before breaking for collection tracking
      const inventoryBefore = collect ? this.getInventorySnapshot(bot) : null;

      // Break the block with timeout
      const digPromise = bot.dig(block);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Break timeout')), timeout)
      );

      await Promise.race([digPromise, timeoutPromise]);

      // Wait a moment for items to drop and be collected
      if (collect) {
        await bot.waitForTicks(10);
        
        const inventoryAfter = this.getInventorySnapshot(bot);
        const itemsCollected = this.compareInventories(inventoryBefore!, inventoryAfter);
        
        if (itemsCollected.length > 0) {
          const itemsList = itemsCollected.map(item => `${item.count} ${item.name}`).join(', ');
          return SkillResults.success(null, `Successfully broke ${block.name} and collected: ${itemsList}`);
        }
      }

      return SkillResults.success(null, `Successfully broke ${block.name} at ${position.toString()}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('timeout')) {
        return SkillResults.error(`Block breaking timed out after ${timeout}ms`);
      } else if (errorMessage.includes('interrupted')) {
        return SkillResults.error(`Block breaking was interrupted`);
      } else {
        return SkillResults.error(`Failed to break block: ${errorMessage}`);
      }
    }
  }

  /**
   * Equip the best tool for breaking a specific block
   */
  private async equipBestTool(bot: any, block: any): Promise<void> {
    if (!bot.inventory || !bot.inventory.items) {
      return;
    }

    // Find the best tool in inventory
    let bestTool = null;
    let bestSpeed = 0;

    for (const item of bot.inventory.items()) {
      if (item && item.name) {
        // Calculate dig time with this tool (simplified)
        const digTime = block.digTime(item.type);
        const speed = 1 / (digTime || 1);
        
        if (speed > bestSpeed) {
          bestSpeed = speed;
          bestTool = item;
        }
      }
    }

    // Equip the best tool if found
    if (bestTool && bot.heldItem?.name !== bestTool.name) {
      try {
        await bot.equip(bestTool, 'hand');
        this.log('debug', `Equipped ${bestTool.name} for breaking ${block.name}`);
      } catch (error) {
        this.log('warn', `Failed to equip tool: ${error}`);
      }
    }
  }

  /**
   * Get a snapshot of the bot's inventory
   */
  private getInventorySnapshot(bot: any): Array<{name: string, count: number}> {
    if (!bot.inventory || !bot.inventory.items) {
      return [];
    }
    
    return bot.inventory.items().map((item: any) => ({
      name: item.name,
      count: item.count,
    }));
  }

  /**
   * Compare two inventory snapshots to find new items
   */
  private compareInventories(
    before: Array<{name: string, count: number}>,
    after: Array<{name: string, count: number}>
  ): Array<{name: string, count: number}> {
    const beforeMap = new Map(before.map(item => [item.name, item.count]));
    const afterMap = new Map(after.map(item => [item.name, item.count]));
    
    const differences: Array<{name: string, count: number}> = [];
    
    afterMap.forEach((newCount, name) => {
      const oldCount = beforeMap.get(name) || 0;
      if (newCount > oldCount) {
        differences.push({ name, count: newCount - oldCount });
      }
    });
    
    return differences;
  }

  /**
   * Resource requirements for block breaking
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      tools: ['pickaxe', 'axe', 'shovel', 'hoe'], // Might need tools
      environment: ['pathfinder']
    };
  }

  /**
   * Estimate execution time based on block and distance
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const baseTime = 3000; // 3 seconds base
    const navigationTime = 2000; // 2 seconds for navigation
    const breakTime = 5000; // 5 seconds for breaking
    
    return baseTime + navigationTime + breakTime;
  }
}