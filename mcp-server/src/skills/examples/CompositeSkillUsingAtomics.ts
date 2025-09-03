import { injectable } from 'tsyringe';

import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillResult, SkillResults } from '../SkillResult.js';
import { skillDependency } from '../decorators/skillDependency.js';

// Import atomic skills
import { MoveToPosition } from '../atomic/movement/MoveToPosition.js';
import { BreakBlock } from '../atomic/interaction/BreakBlock.js';
import { PickupItem } from '../atomic/inventory/PickupItem.js';

export interface IMineAndCollectParams {
  x: number;
  y: number;
  z: number;
  itemName?: string;
}

/**
 * Example composite skill that demonstrates atomic skill composition
 * 
 * This skill combines three atomic operations:
 * 1. Move to the target position
 * 2. Break the block at that position  
 * 3. Pick up the dropped items
 */
@injectable()
export class MineAndCollectSkill extends CompositeSkill {
  readonly name = 'MineAndCollectSkill';
  readonly description = 'Move to a position, break a block, and collect the drops';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;

  readonly skillDependencies: string[] = ['MoveToPosition', 'BreakBlock', 'PickupItem'];

  // Declare atomic skill dependencies
  @skillDependency(MoveToPosition)
  private moveToPosition!: MoveToPosition;

  @skillDependency(BreakBlock)
  private breakBlock!: BreakBlock;

  @skillDependency(PickupItem)
  private pickupItem!: PickupItem;

  readonly inputSchema = {
    type: 'object',
    required: ['x', 'y', 'z'],
    properties: {
      x: {
        type: 'number',
        description: 'X coordinate of the block to mine'
      },
      y: {
        type: 'number',
        description: 'Y coordinate of the block to mine'
      },
      z: {
        type: 'number',
        description: 'Z coordinate of the block to mine'
      },
      itemName: {
        type: 'string',
        description: 'Specific item to collect after breaking (optional)',
      }
    }
  };

  async execute(context: ISkillContext, dependencies: any): Promise<SkillResult> {
    return this.executeSkill(context);
  }

  createExecutionSteps(context: ISkillContext): any[] {
    return [
      { id: 'move', name: 'Move to position', dependencies: [] },
      { id: 'break', name: 'Break block', dependencies: ['move'] },
      { id: 'collect', name: 'Collect items', dependencies: ['break'] }
    ];
  }

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { x, y, z, itemName } = params as IMineAndCollectParams;

    this.log('info', `Starting mine and collect operation at ${x}, ${y}, ${z}`);

    try {
      // Step 1: Move to the target position
      this.log('debug', 'Step 1: Moving to target position');
      const moveResult = await this.moveToPosition.execute(context, {
        x,
        y,
        z,
        range: 3, // Get within 3 blocks
        timeout: 15000
      });

      if (!moveResult.success) {
        return SkillResults.error(`Failed to move to position: ${(moveResult as any).error}`);
      }

      // Step 2: Break the block
      this.log('debug', 'Step 2: Breaking block');
      const breakResult = await this.breakBlock.execute(context, {
        x,
        y,
        z,
        collect: false, // We'll collect manually in step 3
        timeout: 10000
      });

      if (!breakResult.success) {
        return SkillResults.error(`Failed to break block: ${(breakResult as any).error}`);
      }

      // Step 3: Pick up items (if specified)
      if (itemName) {
        this.log('debug', `Step 3: Collecting ${itemName}`);
        
        // Wait a moment for items to drop
        await bot.waitForTicks(10);
        
        const pickupResult = await this.pickupItem.execute(context, {
          itemName,
          maxDistance: 8,
          timeout: 5000
        });

        if (!pickupResult.success) {
          this.log('warn', `Failed to collect ${itemName}: ${pickupResult.message}`);
          // Don't fail the entire operation just because pickup failed
        }
      }

      const successMessage = itemName 
        ? `Successfully mined block and collected ${itemName} at ${x}, ${y}, ${z}`
        : `Successfully mined block at ${x}, ${y}, ${z}`;
      
      return SkillResults.success(null, successMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Mine and collect operation failed: ${errorMessage}`);
    }
  }

  /**
   * Resource requirements combine all atomic skill requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      tools: ['pickaxe', 'axe', 'shovel'], // Might need tools for mining
      environment: ['pathfinder'],
      permissions: [] // No special permissions needed
    };
  }

  /**
   * Estimate execution time as sum of atomic operations
   */
  estimateExecutionTime(params: Record<string, any>): number {
    // Rough estimates for each step
    const moveTime = 10000; // 10 seconds for movement
    const breakTime = 5000;  // 5 seconds for breaking
    const collectTime = params.itemName ? 3000 : 0; // 3 seconds if collecting
    
    return moveTime + breakTime + collectTime;
  }

  /**
   * This composite skill can be cancelled at any step
   */
  isCancellable(): boolean {
    return true;
  }
}