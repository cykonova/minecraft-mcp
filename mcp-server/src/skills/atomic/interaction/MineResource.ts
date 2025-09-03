import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { closest, distance } from 'fastest-levenshtein';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

export interface IMineResourceParams {
  name: string;
  count?: number;
  maxDistance?: number;
}

/**
 * Atomic skill for mining a specific resource in Minecraft
 * 
 * This skill handles:
 * - Resource name validation and fuzzy matching
 * - Block/item differentiation 
 * - Tool requirement checking
 * - Resource location and mining
 * - Progress tracking
 */
@injectable()
export class MineResource extends AtomicSkill {
  readonly name = 'MineResource';
  readonly description = 'Mine a specific resource like wood, stone, or iron ore';
  readonly version = '1.0.0';
  readonly edition = 'java' as const; // Initially Java only due to complex dependencies
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Name of the resource to mine (e.g., wood, stone, iron_ore, coal)'
      },
      count: {
        type: 'number',
        description: 'Number of blocks to mine (default: 1, max: 16)',
        default: 1,
        minimum: 1,
        maximum: 16
      },
      maxDistance: {
        type: 'number',
        description: 'Maximum distance to search for blocks (default: 32)',
        default: 32,
        minimum: 8,
        maximum: 64
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { name: resourceName, count = 1, maxDistance = 32 } = params as IMineResourceParams;

    // Validate parameters
    if (typeof resourceName !== 'string' || resourceName.trim() === '') {
      return SkillResults.error('Resource name must be a non-empty string');
    }

    const sanitizedCount = Math.min(Math.max(1, count), 16);
    
    this.log('info', `Mining ${sanitizedCount} ${resourceName}`);

    try {
      const mcData = minecraftData((bot as any).version);
      const result = await this.mineResource(bot, resourceName, sanitizedCount, maxDistance, mcData);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Mining failed: ${errorMessage}`);
    }
  }

  private async mineResource(
    bot: any, 
    resourceName: string, 
    count: number,
    maxDistance: number,
    mcData: any
  ): Promise<SkillResult> {
    // Handle wood alias
    let name = resourceName;
    if (name.includes('wood')) {
      name = 'oak_log';
      // Fix for older versions
      if (!mcData.blocksByName[name]) {
        name = 'log';
      }
    }

    // Find closest matching block/item name
    const blockName = closest(name.toLowerCase(), Object.keys(mcData.blocksByName));
    const itemName = closest(name.toLowerCase(), Object.keys(mcData.itemsByName));
    
    const isItemMode = distance(name, blockName) > distance(name, itemName);
    
    // Validate the resource exists
    if (!isItemMode && distance(blockName, name) > 1) {
      return SkillResults.error(`Cannot mine ${resourceName} - not a valid block in Minecraft`);
    } else if (isItemMode && distance(itemName, name) > 1) {
      return SkillResults.error(`Cannot mine ${resourceName} - not a valid item in Minecraft`);
    }

    // Get block/item data and check mining requirements
    let blocksByType: number[] = [];
    let targetBlockName = '';

    if (isItemMode) {
      const item = mcData.itemsByName[itemName];
      if (!item) {
        return SkillResults.error(`Item ${resourceName} not found in Minecraft data`);
      }

      // Check if bot can mine any blocks that drop this item
      const canMine = await this.canBotMineItem(bot, item, mcData);
      if (!canMine) {
        return SkillResults.error(`You don't have the right tool to mine ${resourceName}`);
      }

      // Find blocks that drop this item
      blocksByType = mcData.blocksArray
        .filter((block: any) => block.drops && block.drops.includes(item.id))
        .map((block: any) => block.id);
      targetBlockName = itemName;
    } else {
      const block = mcData.blocksByName[blockName];
      if (!block) {
        return SkillResults.error(`Block ${resourceName} not found in Minecraft data`);
      }

      const canMine = await this.canBotMineBlock(bot, block, mcData);
      if (!canMine) {
        return SkillResults.error(`You don't have the right tool to mine ${resourceName}`);
      }

      // Handle special block groups (wood, stone)
      if (block.name.includes('log')) {
        // All wood types
        blocksByType = mcData.blocksArray
          .filter((b: any) => b.name.includes('log'))
          .map((b: any) => b.id);
      } else if (block.name === 'stone' || block.name === 'cobblestone') {
        // Stone types
        blocksByType = [
          mcData.blocksByName.stone?.id,
          mcData.blocksByName.cobblestone?.id
        ].filter(id => id !== undefined);
      } else {
        blocksByType = [block.id];
      }
      targetBlockName = blockName;
    }

    // Find blocks
    const blocks = await this.findMineableBlocks(bot, blocksByType, count * 3, maxDistance);
    
    if (blocks.length === 0) {
      return SkillResults.error(`No ${resourceName} found nearby. Try exploring to find more resources.`);
    }

    // Mine the blocks
    const result = await this.mineBlocks(bot, blocks, count, targetBlockName);
    return result;
  }

  private async findMineableBlocks(
    bot: any,
    blockTypes: number[],
    findCount: number,
    maxDistance: number
  ): Promise<Vec3[]> {
    return bot.findBlocks({
      matching: (blockType: number) => {
        if (blockType === null) return false;
        if (!blockTypes.includes(blockType)) return false;
        
        // Check if block has nearby air (is accessible)
        const blockAt = bot.blockAt(bot.entity.position.plus(new Vec3(0, 0, 0)));
        return this.blockHasNearbyAir(bot, blockAt?.position);
      },
      maxDistance,
      count: findCount
    });
  }

  private async mineBlocks(
    bot: any,
    positions: Vec3[],
    targetCount: number,
    resourceName: string
  ): Promise<SkillResult> {
    let successCount = 0;
    const blocks = [...positions]; // Copy array

    while (blocks.length > 0 && successCount < targetCount) {
      // Sort by distance to bot
      const entityPos = bot.entity.position.floored().offset(0.5, 0, 0.5);
      blocks.sort((a, b) => a.distanceTo(entityPos) - b.distanceTo(entityPos));

      const position = blocks.shift()!;
      const block = bot.blockAt(position);

      if (!block || block.name === 'air') {
        continue; // Block already mined or doesn't exist
      }

      try {
        this.log('debug', `Mining ${block.name} at ${position.toString()} (${successCount + 1}/${targetCount})`);

        // Move to block if needed
        const distance = bot.entity.position.distanceTo(position);
        if (distance > 5) {
          const goal = new GoalNear(position.x, position.y, position.z, 4);
          await (bot as any).pathfinder.goto(goal);
        }

        // Look at the block
        await bot.lookAt(position.offset(0.5, 0.5, 0.5));
        await bot.waitForTicks(2);

        // Mine the block using collectBlock for proper tool handling
        if (bot.collectBlock) {
          await bot.collectBlock.collect([block], {
            ignoreNoPath: true
          });
        } else {
          // Fallback to direct digging
          await bot.dig(block);
        }

        successCount++;

        if (successCount < targetCount) {
          this.log('info', `Mined ${successCount} of ${targetCount} ${resourceName} blocks`);
        }

      } catch (error) {
        this.log('warn', `Failed to mine block at ${position.toString()}: ${error}`);
        continue;
      }
    }

    if (successCount === 0) {
      return SkillResults.error(`Failed to mine any ${resourceName}`);
    } else if (successCount < targetCount) {
      return SkillResults.success(
        null, 
        `Mined ${successCount} ${resourceName} blocks (${targetCount - successCount} not found nearby)`
      );
    } else {
      return SkillResults.success(null, `Successfully mined ${successCount} ${resourceName} blocks`);
    }
  }

  private blockHasNearbyAir(bot: any, position?: Vec3): boolean {
    if (!position) return false;
    
    const adjacentOffsets = [
      new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
      new Vec3(0, 1, 0), new Vec3(0, -1, 0),
      new Vec3(0, 0, 1), new Vec3(0, 0, -1)
    ];

    for (const offset of adjacentOffsets) {
      const adjacentPos = position.plus(offset);
      const block = bot.blockAt(adjacentPos);
      if (block && (block.name === 'air' || block.name === 'water')) {
        return true;
      }
    }
    return false;
  }

  private async canBotMineBlock(bot: any, block: any, mcData: any): Promise<boolean> {
    if (!block.harvestTools || Object.keys(block.harvestTools).length === 0) {
      return true; // No tool required
    }

    // Check if bot has any suitable tool
    const botTools = bot.inventory.items().map((item: any) => item.name);
    
    for (const toolName of botTools) {
      const tool = mcData.itemsByName[toolName];
      if (tool && block.harvestTools[tool.id.toString()]) {
        return true;
      }
    }

    return false;
  }

  private async canBotMineItem(bot: any, item: any, mcData: any): Promise<boolean> {
    // Find all blocks that drop this item
    const blocks = mcData.blocksArray.filter((block: any) => {
      return block.drops && block.drops.includes(item.id);
    });

    // Check if we can mine any of these blocks
    for (const block of blocks) {
      const canMine = await this.canBotMineBlock(bot, block, mcData);
      if (canMine) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resource requirements for mining
   */
  getResourceRequirements(params: Record<string, any>) {
    const resourceName = params.name || '';
    
    return {
      tools: ['pickaxe', 'axe', 'shovel'], // Might need tools based on resource
      environment: ['pathfinder', 'collectBlock'],
      exploration: resourceName ? [`Find ${resourceName} nearby`] : []
    };
  }

  /**
   * Estimate execution time based on resource type and count
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const count = Math.min(params.count || 1, 16);
    const baseTime = 5000; // 5 seconds base
    const perBlockTime = 3000; // 3 seconds per block
    const explorationTime = 10000; // 10 seconds for finding blocks
    
    return baseTime + (count * perBlockTime) + explorationTime;
  }
}