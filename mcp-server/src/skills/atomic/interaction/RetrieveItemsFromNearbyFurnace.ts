import { injectable } from 'tsyringe';
import minecraftData from 'minecraft-data';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const { goals: { GoalNear } } = mineflayer_pathfinder;

export interface IRetrieveItemsFromNearbyFurnaceParams {
  maxFurnaces?: number;
  searchRadius?: number;
}

/**
 * Atomic skill for retrieving items from nearby furnaces
 * 
 * This skill handles:
 * - Finding all furnaces within a search radius
 * - Navigating to each furnace
 * - Retrieving completed items from output slots
 * - Collecting leftover fuel and input items if furnace is idle
 * - Providing detailed feedback on what was collected
 */
@injectable()
export class RetrieveItemsFromNearbyFurnace extends AtomicSkill {
  readonly name = 'retrieveItemsFromNearbyFurnace';
  readonly description = 'Retrieve items from all nearby furnaces';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      maxFurnaces: {
        type: 'number',
        description: 'Maximum number of furnaces to check (default: 10)',
        default: 10,
        minimum: 1,
        maximum: 20
      },
      searchRadius: {
        type: 'number',
        description: 'Maximum distance to search for furnaces (default: 16)',
        default: 16,
        minimum: 1,
        maximum: 32
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { maxFurnaces = 10, searchRadius = 16 } = params as IRetrieveItemsFromNearbyFurnaceParams;

    try {
      // Find all nearby furnaces
      const furnacePositions = this.findNearbyFurnaces(bot, searchRadius, maxFurnaces);
      
      if (furnacePositions.length === 0) {
        return SkillResults.error('No furnaces found nearby to retrieve items from');
      }

      this.log('info', `Found ${furnacePositions.length} furnaces nearby`);

      const results: Array<{
        location: string;
        items: Array<{ name: string; count: number; slot: string }>;
        status: string;
      }> = [];

      // Visit each furnace
      for (let i = 0; i < furnacePositions.length; i++) {
        if (signal?.aborted) {
          return SkillResults.error('Item retrieval cancelled');
        }

        const position = furnacePositions[i];
        const furnaceBlock = bot.blockAt(position);
        
        if (!furnaceBlock) {
          this.log('warn', `Furnace at ${position} no longer exists`);
          continue;
        }

        try {
          const result = await this.retrieveFromSingleFurnace(bot, furnaceBlock, signal);
          results.push(result);
          
          this.log('debug', `Processed furnace ${i + 1}/${furnacePositions.length}: ${result.status}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log('warn', `Failed to retrieve from furnace at ${position}: ${errorMessage}`);
          
          results.push({
            location: this.formatLocation(position),
            items: [],
            status: `Error: ${errorMessage}`
          });
        }
      }

      // Summarize results
      const totalItems = results.reduce((sum, result) => sum + result.items.length, 0);
      const activeFurnaces = results.filter(r => r.status.includes('smelting')).length;
      const errorCount = results.filter(r => r.status.startsWith('Error')).length;

      const summary = `Retrieved items from ${furnacePositions.length} furnaces: ${totalItems} items collected, ${activeFurnaces} still smelting, ${errorCount} errors`;

      return SkillResults.success(
        {
          furnacesChecked: furnacePositions.length,
          totalItems,
          activeFurnaces,
          errors: errorCount,
          details: results
        },
        summary
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to retrieve items from furnaces: ${errorMessage}`);
    }
  }

  /**
   * Find nearby furnaces
   */
  private findNearbyFurnaces(bot: any, searchRadius: number, maxCount: number): any[] {
    const mcData = minecraftData((bot as any).version);
    const furnaceId = mcData.blocksByName.furnace.id;
    
    return bot.findBlocks({
      matching: [furnaceId],
      maxDistance: searchRadius,
      count: maxCount
    });
  }

  /**
   * Retrieve items from a single furnace
   */
  private async retrieveFromSingleFurnace(
    bot: any, 
    furnaceBlock: any, 
    signal?: AbortSignal
  ): Promise<{
    location: string;
    items: Array<{ name: string; count: number; slot: string }>;
    status: string;
  }> {
    const location = this.formatLocation(furnaceBlock.position);
    const items: Array<{ name: string; count: number; slot: string }> = [];

    // Move to the furnace
    await this.moveToFurnace(bot, furnaceBlock);
    
    if (signal?.aborted) {
      throw new Error('Cancelled during movement');
    }

    // Open the furnace
    const furnace = await bot.openFurnace(furnaceBlock);
    let status = 'idle';

    try {
      // Check furnace progress (this is complex in mineflayer due to packet handling)
      const isActive = this.isFurnaceActive(furnace);
      
      if (isActive) {
        status = 'smelting';
        // Only take output items if furnace is active
        if (furnace.outputItem()) {
          const outputItem = await furnace.takeOutput();
          items.push({
            name: outputItem.displayName,
            count: outputItem.count,
            slot: 'output'
          });
        }
      } else {
        status = 'idle';
        // Take all items if furnace is idle
        if (furnace.inputItem()) {
          const inputItem = await furnace.takeInput();
          items.push({
            name: inputItem.displayName,
            count: inputItem.count,
            slot: 'input'
          });
        }
        
        if (furnace.fuelItem()) {
          const fuelItem = await furnace.takeFuel();
          items.push({
            name: fuelItem.displayName,
            count: fuelItem.count,
            slot: 'fuel'
          });
        }
        
        if (furnace.outputItem()) {
          const outputItem = await furnace.takeOutput();
          items.push({
            name: outputItem.displayName,
            count: outputItem.count,
            slot: 'output'
          });
        }
      }

      return {
        location,
        items,
        status: items.length > 0 
          ? `${status} - retrieved ${items.length} item types`
          : `${status} - no items to retrieve`
      };

    } finally {
      furnace.close();
    }
  }

  /**
   * Check if furnace is actively smelting (simplified version)
   */
  private isFurnaceActive(furnace: any): boolean {
    // This is a simplified check - the real implementation would need
    // to handle mineflayer's packet system properly
    return furnace.inputItem() && furnace.fuelItem();
  }

  /**
   * Move to a furnace
   */
  private async moveToFurnace(bot: any, furnaceBlock: any): Promise<void> {
    if (!bot.pathfinder) {
      throw new Error('Pathfinder plugin not available');
    }

    const goal = new GoalNear(
      furnaceBlock.position.x,
      furnaceBlock.position.y,
      furnaceBlock.position.z,
      2
    );
    
    await bot.pathfinder.goto(goal);
    await bot.lookAt(furnaceBlock.position.offset(0.5, 0.5, 0.5));
  }

  /**
   * Format location for display
   */
  private formatLocation(position: any): string {
    return `(${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)})`;
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      blocks: ['furnace'],
      environment: ['pathfinder'],
      inventory: ['empty_slots'] // Need space for retrieved items
    };
  }

  /**
   * Estimate execution time based on number of furnaces
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const maxFurnaces = params.maxFurnaces || 10;
    const searchRadius = params.searchRadius || 16;
    
    // Estimate: 5 seconds per furnace + travel time
    const baseTime = 5000;
    const perFurnaceTime = 5000;
    const travelTime = searchRadius * 100; // Rough estimate
    
    return baseTime + (maxFurnaces * perFurnaceTime) + travelTime;
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
      this.log('info', 'Furnace retrieval cancelled');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}