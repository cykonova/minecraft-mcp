import { injectable } from 'tsyringe';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IOpenInventoryParams {
  // No parameters needed - just opens/examines inventory
}

/**
 * Atomic skill for opening and examining the bot's inventory
 * 
 * This skill examines the bot's current inventory and provides:
 * - List of all items with quantities
 * - Formatted inventory display
 * - Empty inventory detection
 */
@injectable()
export class OpenInventory extends AtomicSkill {
  readonly name = 'openInventory';
  readonly description = 'Opens and examines the bot\'s inventory';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      // No parameters needed
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot } = context;

    try {
      const inventory = bot.inventory.items();

      // Format inventory items
      let inventoryStr = inventory
        .map((item) => `${item.count} ${item.displayName?.toLowerCase() || item.name}`)
        .join(', ');

      if (inventoryStr.length === 0) {
        inventoryStr = 'nothing';
      }

      const message = `You just finished examining your inventory and it contains: ${inventoryStr}.`;
      
      const inventoryData = {
        items: inventory.map(item => ({
          name: item.name,
          displayName: item.displayName,
          count: item.count,
          slot: item.slot,
          type: item.type,
          metadata: item.metadata
        })),
        totalItems: inventory.length,
        isEmpty: inventory.length === 0,
        formatted: inventoryStr
      };

      return SkillResults.success(inventoryData, message);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to examine inventory: ${errorMessage}`);
    }
  }

  /**
   * Estimate execution time - very fast operation
   */
  estimateExecutionTime(params: Record<string, any>): number {
    return 100; // 100ms - just reading inventory data
  }

  /**
   * Always cancellable (though it's so fast it's unlikely to be cancelled)
   */
  isCancellable(): boolean {
    return true;
  }
}