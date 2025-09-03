import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

export interface ISwimToLandParams {
  maxSearchDistance?: number;
  maxSurfaceSearch?: number;
}

/**
 * Atomic skill for swimming to the nearest land
 * 
 * This skill handles:
 * - Detecting if bot is in water
 * - Finding the water surface
 * - Locating nearest land
 * - Navigation to safety
 */
@injectable()
export class SwimToLand extends AtomicSkill {
  readonly name = 'SwimToLand';
  readonly description = 'Swim to the nearest land when underwater';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      maxSearchDistance: {
        type: 'number',
        description: 'Maximum distance to search for land in blocks (default: 32)',
        default: 32,
        minimum: 8,
        maximum: 128
      },
      maxSurfaceSearch: {
        type: 'number',
        description: 'Maximum blocks to search upward for surface (default: 64)',
        default: 64,
        minimum: 10,
        maximum: 256
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { maxSearchDistance = 32, maxSurfaceSearch = 64 } = params as ISwimToLandParams;

    this.log('info', 'Attempting to swim to land');

    try {
      // Check if bot is in water
      if (!this.isInWater(bot)) {
        return SkillResults.success(null, "You're not in water - no need to swim to land");
      }

      // Find surface
      this.log('debug', 'Searching for water surface');
      const surfacePosition = await this.findSurface(bot, maxSurfaceSearch);
      if (!surfacePosition) {
        return SkillResults.error('Unable to find water surface');
      }

      // Find land
      this.log('debug', `Surface found at ${surfacePosition.toString()}, searching for land`);
      const landPosition = await this.findLand(bot, surfacePosition, maxSearchDistance);
      if (!landPosition) {
        return SkillResults.error('No land found within search range - staying at surface');
      }

      // Navigate to land
      this.log('debug', `Land found at ${landPosition.toString()}, swimming to safety`);
      await this.navigateToLand(bot, landPosition);

      return SkillResults.success(null, 'Successfully swam to land and reached safety');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to swim to land: ${errorMessage}`);
    }
  }

  private isInWater(bot: any): boolean {
    const waterBlocks = new Set(['water', 'seagrass', 'kelp', 'kelp_plant', 'bubble_column']);
    
    try {
      const currentBlock = bot.blockAt(bot.entity.position);
      return currentBlock && waterBlocks.has(currentBlock.name);
    } catch (error) {
      this.log('warn', `Failed to check current block: ${error}`);
      // Fallback: check if bot is in liquid
      return bot.entity.isInWater || false;
    }
  }

  private async findSurface(bot: any, maxSearchHeight: number): Promise<Vec3 | null> {
    let currentPosition = bot.entity.position.offset(0, 1, 0);
    
    for (let i = 0; i < maxSearchHeight; i++) {
      try {
        const block = bot.blockAt(currentPosition);
        
        if (block && block.name === 'air') {
          this.log('debug', `Surface found at height ${currentPosition.y}`);
          return currentPosition;
        }
        
        currentPosition = currentPosition.offset(0, 1, 0);
      } catch (error) {
        this.log('warn', `Error checking block at ${currentPosition}: ${error}`);
        break;
      }
    }

    return null;
  }

  private async findLand(bot: any, surfacePosition: Vec3, maxDistance: number): Promise<Vec3 | null> {
    const visited = new Set<string>();
    const queue: Array<[number, number]> = [[Math.floor(surfacePosition.x), Math.floor(surfacePosition.z)]];
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    
    const landBlocks = new Set([
      'stone', 'grass_block', 'dirt', 'podzol', 'sand', 'gravel', 'clay', 
      'bedrock', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 
      'sandstone', 'mossy_cobblestone', 'obsidian', 'snow', 'snow_block',
      'ice', 'packed_ice', 'blue_ice', 'red_sand', 'terracotta', 'coarse_dirt',
      'granite', 'diorite', 'andesite', 'deepslate', 'tuff'
    ]);

    let searchRadius = 0;
    
    while (queue.length > 0 && searchRadius < maxDistance) {
      const [currentX, currentZ] = queue.shift()!;
      const distanceFromCenter = Math.abs(currentX - surfacePosition.x) + Math.abs(currentZ - surfacePosition.z);
      searchRadius = Math.max(searchRadius, distanceFromCenter);

      for (const [dx, dz] of directions) {
        const nx = currentX + dx;
        const nz = currentZ + dz;
        const hash = `${nx},${nz}`;

        if (visited.has(hash)) continue;
        visited.add(hash);

        // Check if this position is too far
        if (Math.abs(nx - surfacePosition.x) + Math.abs(nz - surfacePosition.z) > maxDistance) {
          continue;
        }

        try {
          const position = new Vec3(nx, surfacePosition.y, nz);
          const block = bot.blockAt(position);
          const blockBelow = bot.blockAt(position.offset(0, -1, 0));

          // Found land: air block above solid land block
          if (block && block.name === 'air' && 
              blockBelow && landBlocks.has(blockBelow.name)) {
            
            this.log('debug', `Land found at distance ${distanceFromCenter}`);
            return position;
          }

          queue.push([nx, nz]);
        } catch (error) {
          // Skip positions that cause errors
          continue;
        }
      }
    }

    return null;
  }

  private async navigateToLand(bot: any, landPosition: Vec3): Promise<void> {
    try {
      const goal = new GoalNear(landPosition.x, landPosition.y, landPosition.z, 1);
      await (bot as any).pathfinder.goto(goal);
      
      // Wait a moment to ensure we're on solid ground
      await bot.waitForTicks(10);
    } catch (error) {
      // Try direct movement if pathfinding fails
      this.log('warn', `Pathfinding failed, attempting direct movement: ${error}`);
      
      try {
        // Simple direct navigation
        const currentPos = bot.entity.position;
        const direction = landPosition.minus(currentPos).normalize();
        
        // Move towards land for a few seconds
        const moveTime = 3000; // 3 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < moveTime) {
          bot.setControlState('forward', true);
          bot.setControlState('jump', this.isInWater(bot)); // Jump if still in water
          
          // Adjust look direction towards land
          await bot.look(bot.entity.yaw + direction.x * 0.1, bot.entity.pitch);
          await bot.waitForTicks(1);
        }
        
        // Stop movement
        bot.clearControlStates();
        
      } catch (moveError) {
        this.log('error', `Direct movement also failed: ${moveError}`);
        throw moveError;
      }
    }
  }

  /**
   * Resource requirements for swimming
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      environment: ['pathfinder', 'water'],
      conditions: ['Bot can swim', 'Water present nearby']
    };
  }

  /**
   * Estimate execution time based on search distance
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const maxSearchDistance = params.maxSearchDistance || 32;
    const baseTime = 3000; // 3 seconds base
    const searchTime = maxSearchDistance * 100; // 0.1 seconds per block search
    const swimmingTime = maxSearchDistance * 200; // 0.2 seconds per block swimming
    
    return baseTime + searchTime + swimmingTime;
  }
}