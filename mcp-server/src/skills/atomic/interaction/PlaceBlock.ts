import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { closest, distance } from 'fastest-levenshtein';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear, GoalLookAtBlock },
  Movements,
} = mineflayer_pathfinder;

export interface IPlaceBlockParams {
  blockName: string;
  x: number;
  y: number;
  z: number;
  timeout?: number;
  giveItem?: boolean;
}

/**
 * Atomic skill for placing a single block at specific coordinates
 * 
 * This skill handles:
 * - Finding the block in inventory
 * - Navigation to placement location
 * - Finding suitable reference block
 * - Block placement mechanics
 */
@injectable()
export class PlaceBlock extends AtomicSkill {
  readonly name = 'PlaceBlock';
  readonly description = 'Place a single block at the specified coordinates';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['blockName', 'x', 'y', 'z'],
    properties: {
      blockName: {
        type: 'string',
        description: 'Name of the block type to place (e.g., "stone", "dirt", "cobblestone")'
      },
      x: {
        type: 'number',
        description: 'X coordinate where to place the block'
      },
      y: {
        type: 'number',
        description: 'Y coordinate where to place the block'
      },
      z: {
        type: 'number',
        description: 'Z coordinate where to place the block'
      },
      timeout: {
        type: 'number',
        description: 'Maximum time in milliseconds to spend placing (default: 15000)',
        default: 15000,
        minimum: 1000,
        maximum: 60000
      },
      giveItem: {
        type: 'boolean',
        description: 'Give the bot the block if not in inventory (requires cheats, default: false)',
        default: false
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { blockName, x, y, z, timeout = 15000, giveItem = false } = params as IPlaceBlockParams;

    const mcData = minecraftData((bot as any).version);
    const position = new Vec3(x, y, z);

    // Find closest matching block name
    const closestBlockName = closest(blockName.toLowerCase(), Object.keys(mcData.blocksByName));
    if (distance(blockName.toLowerCase(), closestBlockName) > 1) {
      return SkillResults.error(`Unknown block name: ${blockName}. Did you mean ${closestBlockName}?`);
    }

    const targetBlockName = closestBlockName;
    this.log('info', `Placing ${targetBlockName} at ${position.toString()}`);

    // Check if target position is valid
    const existingBlock = bot.blockAt(position);
    if (!existingBlock) {
      return SkillResults.error(`Invalid position: ${position.toString()}`);
    }

    // Check if position is already occupied
    if (existingBlock.name !== 'air' && existingBlock.name !== 'water' && existingBlock.name !== 'lava') {
      return SkillResults.error(`Position ${position.toString()} is already occupied by ${existingBlock.name}`);
    }

    try {
      // Find the block in inventory
      const blockItem = mcData.itemsByName[targetBlockName];
      if (!blockItem) {
        return SkillResults.error(`${targetBlockName} is not a placeable item`);
      }

      let inventoryItem = bot.inventory.findInventoryItem(blockItem.id, null, false);
      
      // Give item if not found and allowed
      if (!inventoryItem && giveItem) {
        this.log('debug', `Giving ${targetBlockName} to bot`);
        bot.chat(`/give ${bot.username} ${targetBlockName} 1`);
        await bot.waitForTicks(4); // Wait for item to appear
        inventoryItem = bot.inventory.findInventoryItem(blockItem.id, null, false);
      }

      if (!inventoryItem) {
        return SkillResults.error(`Bot does not have ${targetBlockName} in inventory`);
      }

      // Find a reference block to place against
      const referenceInfo = this.findReferenceBlock(bot, position);
      if (!referenceInfo) {
        return SkillResults.error(`No suitable reference block found near ${position.toString()}`);
      }

      const { referenceBlock, faceVector } = referenceInfo;

      // Navigate to placement position
      const goal = new GoalLookAtBlock(referenceBlock.position, (bot as any).world);
      await (bot as any).pathfinder.goto(goal);

      // Check if bot or other entities are in the way
      const entityInWay = this.checkForEntitiesInWay(bot, position, referenceBlock.position);
      if (entityInWay) {
        return SkillResults.error(`Cannot place block: ${entityInWay}`);
      }

      // Equip the block
      await bot.equip(inventoryItem, 'hand');

      // Look at the reference block
      await bot.lookAt(referenceBlock.position.offset(0.5, 0.5, 0.5));

      // Place the block with timeout
      const placePromise = bot.placeBlock(referenceBlock, faceVector);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Place timeout')), timeout)
      );

      await Promise.race([placePromise, timeoutPromise]);

      // Verify placement
      await bot.waitForTicks(2);
      const placedBlock = bot.blockAt(position);
      if (placedBlock && placedBlock.name === targetBlockName) {
        return SkillResults.success(null, `Successfully placed ${targetBlockName} at ${position.toString()}`);
      } else {
        return SkillResults.error(`Block placement failed - ${placedBlock?.name || 'no block'} found at target position`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('timeout')) {
        return SkillResults.error(`Block placement timed out after ${timeout}ms`);
      } else if (errorMessage.includes('blockUpdate')) {
        return SkillResults.error(`Not enough room to place ${targetBlockName} at ${position.toString()}`);
      } else {
        return SkillResults.error(`Failed to place block: ${errorMessage}`);
      }
    }
  }

  /**
   * Find a suitable reference block to place against
   */
  private findReferenceBlock(bot: any, targetPos: Vec3): { referenceBlock: any, faceVector: Vec3 } | null {
    const directions = [
      new Vec3(0, -1, 0), // Below (preferred)
      new Vec3(0, 1, 0),  // Above
      new Vec3(1, 0, 0),  // East
      new Vec3(-1, 0, 0), // West
      new Vec3(0, 0, 1),  // South
      new Vec3(0, 0, -1), // North
    ];

    for (const direction of directions) {
      const referencePos = targetPos.plus(direction);
      const referenceBlock = bot.blockAt(referencePos);
      
      if (referenceBlock && referenceBlock.boundingBox === 'block') {
        const faceVector = new Vec3(0, 0, 0).minus(direction);
        return { referenceBlock, faceVector };
      }
    }

    return null;
  }

  /**
   * Check if any entities are blocking the placement
   */
  private checkForEntitiesInWay(bot: any, targetPos: Vec3, referencePos: Vec3): string | null {
    const entities = Object.values(bot.entities) as any[];
    
    for (const entity of entities) {
      if (!entity.position) continue;
      
      const entityPos = entity.position.floored();
      
      if (entityPos.equals(targetPos)) {
        if (entity === bot.entity) {
          return 'Bot is in the way of placement';
        } else if (entity.username) {
          return `Player ${entity.username} is in the way`;
        } else {
          return `Entity ${entity.type || 'unknown'} is in the way`;
        }
      }
      
      if (entityPos.equals(referencePos)) {
        if (entity === bot.entity) {
          return 'Bot is blocking the reference block';
        } else if (entity.username) {
          return `Player ${entity.username} is blocking the reference block`;
        } else {
          return `Entity ${entity.type || 'unknown'} is blocking the reference block`;
        }
      }
    }

    return null;
  }

  /**
   * Resource requirements for block placement
   */
  getResourceRequirements(params: Record<string, any>) {
    const requirements: any = {
      items: [params.blockName],
      environment: ['pathfinder']
    };
    
    if (params.giveItem) {
      requirements.permissions = ['give'];
    }
    
    return requirements;
  }

  /**
   * Estimate execution time
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const baseTime = 3000; // 3 seconds base
    const navigationTime = 5000; // 5 seconds for navigation
    const placementTime = 2000; // 2 seconds for placement
    
    return baseTime + navigationTime + placementTime;
  }
}