import { injectable } from 'tsyringe';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IEatFoodParams {
  foodName?: string;
  forceEat?: boolean;
}

/**
 * Atomic skill for eating food from the bot's inventory
 * 
 * This skill handles:
 * - Checking if the bot is hungry (food level < 20)
 * - Finding food items in inventory automatically or by name
 * - Equipping food to hand and consuming it
 * - Support for all Minecraft food types
 */
@injectable()
export class EatFood extends AtomicSkill {
  readonly name = 'eatFood';
  readonly description = 'Eat any food available in the bot\'s inventory';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      foodName: {
        type: 'string',
        description: 'Optional: Specific food item to eat (will find automatically if not specified)',
        maxLength: 50
      },
      forceEat: {
        type: 'boolean',
        description: 'Force eating even if not hungry (default: false)',
        default: false
      }
    },
    required: []
  };

  // List of all edible food items in Minecraft
  private readonly minecraftFoodNames = [
    'apple',
    'baked_potato',
    'beetroot',
    'beetroot_soup',
    'bread',
    'cake',
    'carrot',
    'chorus_fruit',
    'cooked_chicken',
    'cooked_cod',
    'cooked_mutton',
    'cooked_porkchop',
    'cooked_rabbit',
    'cooked_salmon',
    'cooked_beef',
    'cookie',
    'dried_kelp',
    'enchanted_golden_apple',
    'glow_berries',
    'golden_apple',
    'golden_carrot',
    'honey_bottle',
    'melon_slice',
    'mushroom_stew',
    'poisonous_potato',
    'potato',
    'pufferfish',
    'pumpkin_pie',
    'rabbit_stew',
    'beef',
    'chicken',
    'cod',
    'mutton',
    'porkchop',
    'rabbit',
    'salmon',
    'rotten_flesh',
    'spider_eye',
    'suspicious_stew',
    'sweet_berries',
    'tropical_fish'
  ];

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { foodName, forceEat = false } = params as IEatFoodParams;

    // Check if the bot is hungry (food level below max)
    const currentFoodLevel = bot.food || 0;
    if (currentFoodLevel >= 20 && !forceEat) {
      return SkillResults.success(
        { foodLevel: currentFoodLevel },
        'You decided not to eat since you are not hungry'
      );
    }

    this.log('info', `Bot is ${currentFoodLevel < 20 ? 'hungry' : 'being forced to eat'} and has ${currentFoodLevel} food points`);

    try {
      // If specific food is requested, try to find and eat that first
      if (foodName) {
        const result = await this.eatSpecificFood(bot, foodName, currentFoodLevel);
        if (result.success) {
          return result;
        }
        // If specific food failed, fall through to try any available food
        this.log('warn', `Could not eat ${foodName}, trying any available food`);
      }

      // Find and eat any available food
      return await this.eatAnyAvailableFood(bot, currentFoodLevel);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to eat food: ${errorMessage}`);
    }
  }

  /**
   * Try to eat a specific food item by name
   */
  private async eatSpecificFood(bot: any, foodName: string, initialFoodLevel: number): Promise<SkillResult> {
    const normalizedFoodName = foodName.toLowerCase().trim();
    
    // Check if it's a valid food name
    if (!this.minecraftFoodNames.includes(normalizedFoodName)) {
      return SkillResults.error(`'${foodName}' is not a recognized food item`);
    }

    const food = bot.inventory.findInventoryItem(normalizedFoodName as any, null, false);
    if (!food) {
      return SkillResults.error(`You don't have any ${foodName} in your inventory`);
    }

    return await this.consumeFood(bot, food, initialFoodLevel);
  }

  /**
   * Find and eat any available food in inventory
   */
  private async eatAnyAvailableFood(bot: any, initialFoodLevel: number): Promise<SkillResult> {
    // Try to find any food item in inventory
    for (const foodName of this.minecraftFoodNames) {
      const food = bot.inventory.findInventoryItem(foodName as any, null, false);
      
      if (food !== null) {
        this.log('info', `Found food item: ${foodName}`);
        return await this.consumeFood(bot, food, initialFoodLevel);
      }
    }

    return SkillResults.error('You tried to eat but you have no food in your inventory!');
  }

  /**
   * Consume a specific food item
   */
  private async consumeFood(bot: any, food: any, initialFoodLevel: number): Promise<SkillResult> {
    const foodName = food.name;
    
    this.log('info', `Equipping and eating ${foodName}`);
    
    // Equip the food to hand first
    await bot.equip(food, 'hand');
    
    // Consume the food
    await bot.consume();
    
    // Get the new food level
    const newFoodLevel = bot.food || 0;
    const foodGained = newFoodLevel - initialFoodLevel;
    
    return SkillResults.success(
      {
        consumedFood: {
          name: foodName,
          displayName: food.displayName
        },
        initialFoodLevel,
        newFoodLevel,
        foodGained
      },
      `You finished eating ${foodName}. Food level: ${initialFoodLevel} → ${newFoodLevel} (+${foodGained})`
    );
  }

  /**
   * Resource requirements - need food in inventory
   */
  getResourceRequirements(params: Record<string, any>) {
    const requirements: any = {};
    
    if (params.foodName) {
      requirements.items = [params.foodName];
    } else {
      requirements.items = this.minecraftFoodNames; // Any food will do
    }
    
    return requirements;
  }

  /**
   * Estimate execution time - eating takes a few seconds
   */
  estimateExecutionTime(params: Record<string, any>): number {
    return 3000; // 3 seconds - eating animation takes time
  }

  /**
   * Eating can be cancelled (though it might leave bot in weird state)
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation during eating
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    this.log('info', 'Eating cancelled - may have consumed partial food');
    // Note: Cancelling during eating might leave the bot in an inconsistent state
    // as the food consumption process has multiple steps
  }
}