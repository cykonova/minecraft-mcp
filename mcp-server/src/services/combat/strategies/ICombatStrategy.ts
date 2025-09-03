import { AnyBot } from '../../../types.js';
import { CombatTarget, CombatOptions } from '../ICombatService.js';

/**
 * Combat strategy interface for different combat approaches
 */
export interface ICombatStrategy {
  /** Strategy name */
  readonly name: string;
  
  /** Strategy description */
  readonly description: string;
  
  /**
   * Execute the combat strategy
   * @param bot The bot to control
   * @param target The target to engage
   * @param options Combat options
   * @returns Promise that resolves when strategy execution completes
   */
  execute(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<boolean>;
  
  /**
   * Check if this strategy is suitable for the current situation
   * @param bot The bot
   * @param target The target
   * @param options Combat options
   * @returns Suitability score (0-100, higher = more suitable)
   */
  getSuitability(bot: AnyBot, target: CombatTarget, options: CombatOptions): number;
  
  /**
   * Update strategy parameters during combat
   * @param bot The bot
   * @param target Current target
   * @param options Combat options
   */
  update(bot: AnyBot, target: CombatTarget, options: CombatOptions): void;
  
  /**
   * Clean up when strategy is stopped
   * @param bot The bot
   */
  cleanup(bot: AnyBot): void;
}

/**
 * Base combat strategy implementation with common functionality
 */
export abstract class BaseCombatStrategy implements ICombatStrategy {
  abstract readonly name: string;
  abstract readonly description: string;
  
  protected isExecuting = false;
  protected lastUpdate = Date.now();
  
  abstract execute(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<boolean>;
  abstract getSuitability(bot: AnyBot, target: CombatTarget, options: CombatOptions): number;
  
  update(bot: AnyBot, target: CombatTarget, options: CombatOptions): void {
    this.lastUpdate = Date.now();
  }
  
  cleanup(bot: AnyBot): void {
    this.isExecuting = false;
    try {
      // Stop any ongoing combat actions
      if ('pvp' in bot && bot.pvp) {
        (bot.pvp as any).forceStop?.();
      }
      if ('pathfinder' in bot && bot.pathfinder) {
        (bot.pathfinder as any).stop?.();
      }
    } catch (error) {
      console.error(`[${this.name}] Error during cleanup:`, error);
    }
  }
  
  /**
   * Common utility to get bot position
   * @param bot The bot
   * @returns Bot position
   */
  protected getBotPosition(bot: AnyBot) {
    return (bot as any).entity?.position || (bot as any).bot?.entity?.position;
  }
  
  /**
   * Common utility to get bot health
   * @param bot The bot
   * @returns Bot health percentage
   */
  protected getBotHealth(bot: AnyBot): number {
    try {
      const health = (bot as any).health || (bot as any).bot?.health || 20;
      return Math.round((health / 20) * 100);
    } catch {
      return 100;
    }
  }
  
  /**
   * Common utility to check if bot has line of sight to target
   * @param bot The bot
   * @param target The target
   * @returns True if has line of sight
   */
  protected hasLineOfSight(bot: AnyBot, target: CombatTarget): boolean {
    try {
      // Basic line of sight check - would need to implement raycasting
      // For now, assume line of sight if within reasonable range and not underground
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return false;
      
      const distance = botPos.distanceTo(targetPos);
      const heightDiff = Math.abs(botPos.y - targetPos.y);
      
      // If target is too far or too much height difference, assume no line of sight
      return distance < 32 && heightDiff < 10;
    } catch {
      return false;
    }
  }
  
  /**
   * Common utility to move to optimal attack position
   * @param bot The bot
   * @param target The target
   * @param preferredDistance Preferred distance from target
   * @returns Promise that resolves when positioning completes
   */
  protected async moveToAttackPosition(bot: AnyBot, target: CombatTarget, preferredDistance: number = 3): Promise<boolean> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return false;
      
      const currentDistance = botPos.distanceTo(targetPos);
      
      // If already at good distance, no need to move
      if (Math.abs(currentDistance - preferredDistance) < 1) {
        return true;
      }
      
      // Calculate position to move to
      const direction = botPos.minus(targetPos).normalize();
      const moveTarget = targetPos.plus(direction.scaled(preferredDistance));
      
      // Use pathfinding if available
      if ('pathfinder' in bot && (bot as any).pathfinder?.goto) {
        await (bot as any).pathfinder.goto(moveTarget);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`[${this.name}] Error moving to attack position:`, error);
      return false;
    }
  }
}