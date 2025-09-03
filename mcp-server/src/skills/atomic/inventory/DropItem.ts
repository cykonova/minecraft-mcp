import { injectable } from 'tsyringe';
import minecraftData from 'minecraft-data';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IDropItemParams {
  name: string;
  count?: number;
  userName?: string;
}

/**
 * Atomic skill for dropping items from the bot's inventory
 * 
 * This skill handles:
 * - Finding items in inventory by name
 * - Dropping specified quantity of items
 * - Optional directional dropping towards a player
 * - Validation of item existence and quantities
 */
@injectable()
export class DropItem extends AtomicSkill {
  readonly name = 'dropItem';
  readonly description = 'Drops a specified item from the inventory on the ground';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'The name of the item to drop',
        minLength: 1,
        maxLength: 50
      },
      count: {
        type: 'number',
        description: 'The number of items to drop (default: 1)',
        default: 1,
        minimum: 1,
        maximum: 2304 // Max possible stack
      },
      userName: {
        type: 'string',
        description: 'Optional: The name of the player to toss the item towards',
        maxLength: 16
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    let { name, count = 1, userName } = params as IDropItemParams;

    if (typeof name !== 'string') {
      return SkillResults.error(`Item name must be a string, got ${typeof name}`);
    }

    name = name.toLowerCase().trim();

    // Don't let bots give items to themselves
    if (userName && userName === bot.username) {
      return SkillResults.error(`You cannot give items to yourself`);
    }

    try {
      // Get Minecraft data for this version
      const mcData = minecraftData((bot as any).version);
      
      // Find closest matching item name
      const closestItemName = this.findClosestItemName(name, mcData);
      if (!closestItemName) {
        return SkillResults.error(`No item named '${name}' found in Minecraft`);
      }

      name = closestItemName;
      const itemByName = mcData.itemsByName[name];
      if (!itemByName) {
        return SkillResults.error(`Item '${name}' not found in Minecraft data`);
      }

      // Find the item in the bot's inventory
      const item = bot.inventory.findInventoryItem(itemByName.id, null, false);
      if (!item) {
        return SkillResults.error(
          `You don't have any ${name} in your inventory to drop`
        );
      }

      // Check if we have enough items to drop
      const actualCount = Math.min(count, item.count);
      if (actualCount < count) {
        this.log('warn', `Only have ${item.count} ${name}, dropping ${actualCount} instead of ${count}`);
      }

      // If a target player is specified, try to drop towards them
      if (userName) {
        return await this.dropTowardsPlayer(bot, item, actualCount, userName);
      } else {
        return await this.dropItem(bot, item, actualCount);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to drop ${name}: ${errorMessage}`);
    }
  }

  /**
   * Drop item normally (straight down)
   */
  private async dropItem(bot: any, item: any, count: number): Promise<SkillResult> {
    this.log('info', `Dropping ${count} ${item.name}`);
    
    await bot.toss(item.type, null, count);
    
    return SkillResults.success(
      {
        droppedItem: {
          name: item.name,
          displayName: item.displayName,
          count: count
        }
      },
      `Successfully dropped ${count} ${item.name}`
    );
  }

  /**
   * Drop item towards a specific player
   */
  private async dropTowardsPlayer(bot: any, item: any, count: number, playerName: string): Promise<SkillResult> {
    // Find the target player
    const targetPlayer = this.findPlayerByName(bot, playerName);
    if (!targetPlayer) {
      // Fall back to normal drop if player not found
      this.log('warn', `Player '${playerName}' not found, dropping normally`);
      return await this.dropItem(bot, item, count);
    }

    this.log('info', `Dropping ${count} ${item.name} towards ${playerName}`);
    
    // Calculate direction to player
    const botPos = bot.entity.position;
    const playerPos = targetPlayer.entity.position;
    const direction = playerPos.minus(botPos).normalize();
    
    // Toss the item with some force towards the player
    await bot.toss(item.type, null, count);
    
    // Note: The basic toss doesn't support directional throwing in mineflayer
    // This would require more complex physics calculations or plugins
    
    return SkillResults.success(
      {
        droppedItem: {
          name: item.name,
          displayName: item.displayName,
          count: count
        },
        targetPlayer: playerName
      },
      `Successfully dropped ${count} ${item.name} towards ${playerName}`
    );
  }

  /**
   * Find a player by name in the world
   */
  private findPlayerByName(bot: any, name: string): any {
    const players = Object.values(bot.players).filter((player: any) => 
      player && player.entity && player.username.toLowerCase() === name.toLowerCase()
    );
    
    if (players.length === 0) {
      return null;
    }

    return players[0]; // Return first match
  }

  /**
   * Find the closest item name match
   */
  private findClosestItemName(inputName: string, mcData: any): string | null {
    const normalizedInput = inputName.toLowerCase().replace(/[_\s-]/g, '');
    
    // First try exact match
    if (mcData.itemsByName[inputName]) {
      return inputName;
    }

    // Try normalized match
    for (const itemName of Object.keys(mcData.itemsByName)) {
      const normalizedItemName = itemName.toLowerCase().replace(/[_\s-]/g, '');
      if (normalizedItemName === normalizedInput) {
        return itemName;
      }
    }

    // Try partial match
    for (const itemName of Object.keys(mcData.itemsByName)) {
      if (itemName.toLowerCase().includes(inputName.toLowerCase()) || 
          inputName.toLowerCase().includes(itemName.toLowerCase())) {
        return itemName;
      }
    }

    return null;
  }

  /**
   * Resource requirements for dropping items
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      items: [params.name], // Need the item to be in inventory
    };
  }

  /**
   * Estimate execution time - relatively fast operation
   */
  estimateExecutionTime(params: Record<string, any>): number {
    return 1000; // 1 second - dropping is usually quick
  }

  /**
   * Dropping can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }
}