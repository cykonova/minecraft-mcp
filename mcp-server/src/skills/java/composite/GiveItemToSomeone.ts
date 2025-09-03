import { injectable } from 'tsyringe';

import { CompositeSkill } from '../../CompositeSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../../ICompositeSkill.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../../decorators/skillDependency.js';
import { IAtomicSkill } from '../../IAtomicSkill.js';

export interface IGiveItemToSomeoneParams {
  userName: string;
  itemName: string;
  itemCount?: number;
}

/**
 * Give an item or items from your inventory to someone
 * 
 * This composite skill handles the complete process of giving items to another player:
 * 1. Validates that the item exists in inventory
 * 2. Approaches the target player to get within range
 * 3. Drops/tosses the item towards the player
 * 
 * The skill uses atomic skills for navigation and item dropping, providing
 * better error handling and progress tracking than the legacy implementation.
 */
@autoResolveDependencies
@injectable()
export class GiveItemToSomeone extends CompositeSkill {
  readonly name = 'giveItemToSomeone';
  readonly description = 'Give items from your inventory to another player';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  readonly skillDependencies = ['goToSomeone', 'dropItem'];

  // Dependencies injected via decorator
  @skillDependency({ name: 'goToSomeone' })
  private goToPlayer!: IAtomicSkill;

  @skillDependency({ name: 'dropItem' })
  private dropItem!: IAtomicSkill;

  readonly inputSchema = {
    type: 'object',
    required: ['userName', 'itemName'],
    properties: {
      userName: {
        type: 'string',
        description: 'The name of the player to give the item to',
        minLength: 1,
        maxLength: 16
      },
      itemName: {
        type: 'string',
        description: 'The name of the item to give (must be in your inventory)',
        minLength: 1,
        maxLength: 50
      },
      itemCount: {
        type: 'number',
        description: 'The number of items to give (default: 1)',
        default: 1,
        minimum: 1,
        maximum: 2304
      }
    }
  };

  protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    const { userName, itemName, itemCount = 1 } = params as IGiveItemToSomeoneParams;

    return [
      {
        skillName: 'goToSomeone',
        description: `Move close to player ${userName}`,
        params: {
          userName,
          distance: 3, // Get within 3 blocks for item giving
          keepFollowing: false
        },
        estimatedTime: 15000, // 15 seconds to reach player
        optional: false
      },
      {
        skillName: 'dropItem',
        description: `Drop ${itemCount} ${itemName} towards ${userName}`,
        params: {
          name: itemName,
          count: itemCount,
          userName
        },
        estimatedTime: 2000, // 2 seconds to drop item
        optional: false,
        dependsOn: undefined, // Can execute immediately after reaching player
      }
    ];
  }

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    // Inject dependencies using the dependency injector
    const injector = require('../../decorators/skillDependency.js').SkillDependencyInjector.getInstance();
    injector.injectDependencies(this, dependencies);

    // Validate parameters
    const { userName, itemName, itemCount = 1 } = context.params as IGiveItemToSomeoneParams;
    
    if (!userName || typeof userName !== 'string') {
      return SkillResults.error('userName must be provided as a string');
    }

    if (!itemName || typeof itemName !== 'string') {
      return SkillResults.error('itemName must be provided as a string');
    }

    if (itemCount < 1) {
      return SkillResults.error('itemCount must be at least 1');
    }

    // Check if trying to give to self
    if (userName === context.bot.username) {
      return SkillResults.error('You cannot give items to yourself');
    }

    // Pre-validate that we have the item in inventory
    const hasItem = this.validateInventoryItem(context.bot, itemName, itemCount);
    if (!hasItem.success) {
      return SkillResults.error(hasItem.message);
    }

    this.log('info', `Starting to give ${itemCount} ${itemName} to ${userName}`);

    // Execute the composite skill using the base class orchestration
    return await this.executeCompositeSkill(context, dependencies);
  }

  /**
   * Validate that the bot has the required item in inventory
   */
  private validateInventoryItem(bot: any, itemName: string, count: number): { success: boolean; message?: string } {
    try {
      // This is a basic check - the actual atomic skill will do more thorough validation
      const items = bot.inventory.items();
      const normalizedName = itemName.toLowerCase();
      
      const item = items.find((item: any) => 
        item.name.toLowerCase().includes(normalizedName) || 
        normalizedName.includes(item.name.toLowerCase())
      );

      if (!item) {
        return {
          success: false,
          message: `You don't have any ${itemName} in your inventory`
        };
      }

      if (item.count < count) {
        return {
          success: false,
          message: `You only have ${item.count} ${itemName} but need ${count}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check inventory: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle partial failure with recovery options
   */
  async handlePartialFailure(
    step: ExecutionStep,
    error: SkillResult,
    context: ISkillContext
  ): Promise<boolean> {
    const errorCode = (error as any).code;

    // If we can't reach the player, try dropping the item anyway
    if (step.skillName === 'goToSomeone' && errorCode === 'PATHFINDING_FAILED') {
      this.log('warn', `Couldn't reach player, but will try to drop item towards them`);
      return true; // Continue to drop item step
    }

    // If player not found, this is a hard failure
    if (errorCode === 'PLAYER_NOT_FOUND') {
      return false;
    }

    // For inventory-related errors, fail immediately
    if (errorCode === 'ITEM_NOT_FOUND' || errorCode === 'INSUFFICIENT_ITEMS') {
      return false;
    }

    // Default to parent behavior
    return await super.handlePartialFailure(step, error, context);
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    const { itemName } = params as IGiveItemToSomeoneParams;
    return {
      items: [itemName],
      environment: ['pathfinder'], // Needed for movement
      players: [(params as IGiveItemToSomeoneParams).userName] // Target player should be online
    };
  }

  /**
   * Estimate total execution time
   */
  estimateExecutionTime(params: Record<string, any>): number {
    // Movement (15s) + Item drop (2s) + buffer
    return 20000;
  }

  /**
   * This skill can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation by stopping movement
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    const { bot } = context;
    try {
      // Stop any active pathfinding
      if ((bot as any).pathfinder) {
        (bot as any).pathfinder.setGoal(null);
      }
      this.log('info', 'Give item operation cancelled');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}