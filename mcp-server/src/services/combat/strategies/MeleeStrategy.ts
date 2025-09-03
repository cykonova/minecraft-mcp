import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import { AnyBot } from '../../../types.js';
import { CombatTarget, CombatOptions } from '../ICombatService.js';
import { BaseCombatStrategy } from './ICombatStrategy.js';
import { isUnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Aggressive melee combat strategy
 * Focuses on close-range combat with swords/axes, aggressive positioning
 */
@injectable()
export class MeleeStrategy extends BaseCombatStrategy {
  readonly name = 'melee';
  readonly description = 'Aggressive close-combat strategy using melee weapons';
  
  private readonly MELEE_RANGE = 4; // Maximum melee attack range
  private readonly OPTIMAL_RANGE = 2.5; // Optimal attack distance
  private readonly CIRCLE_STRAFE_RADIUS = 3; // Radius for circle strafing
  
  async execute(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<boolean> {
    this.isExecuting = true;
    
    try {
      // Equip best melee weapon
      await this.equipMeleeWeapon(bot);
      
      // Get bot reference for PvP operations
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Stop any existing combat
      if ('pvp' in botInstance && botInstance.pvp) {
        (botInstance.pvp as any).forceStop?.();
      }
      
      // Move to optimal attack position
      await this.moveToOptimalPosition(bot, target);
      
      // Start attacking
      if ('pvp' in botInstance && botInstance.pvp && 'attack' in botInstance.pvp) {
        (botInstance.pvp as any).attack(target.entity);
      }
      
      // Execute melee combat loop
      await this.executeMeleeCombat(bot, target, options);
      
      return true;
    } catch (error) {
      console.error('[MeleeStrategy] Error executing strategy:', error);
      return false;
    } finally {
      this.isExecuting = false;
    }
  }
  
  getSuitability(bot: AnyBot, target: CombatTarget, options: CombatOptions): number {
    let suitability = 50; // Base suitability
    
    // Prefer when target is close
    if (target.distance <= this.MELEE_RANGE) {
      suitability += 30;
    } else if (target.distance <= this.MELEE_RANGE * 2) {
      suitability += 15;
    } else {
      suitability -= 20; // Less suitable for distant targets
    }
    
    // Prefer when we have good melee weapons
    const meleeWeapon = this.getBestMeleeWeapon(bot);
    if (meleeWeapon) {
      if (meleeWeapon.includes('diamond') || meleeWeapon.includes('netherite')) {
        suitability += 20;
      } else if (meleeWeapon.includes('iron')) {
        suitability += 10;
      }
    } else {
      suitability -= 25; // Much less suitable without weapons
    }
    
    // Consider bot health
    const botHealth = this.getBotHealth(bot);
    if (botHealth > 70) {
      suitability += 15; // Good health for aggressive combat
    } else if (botHealth < 30) {
      suitability -= 20; // Too risky when low health
    }
    
    // Prefer against certain enemy types
    const targetType = target.type;
    if (['zombie', 'skeleton', 'spider'].includes(targetType)) {
      suitability += 10; // Good against common mobs
    } else if (['creeper'].includes(targetType)) {
      suitability -= 15; // Dangerous for melee
    }
    
    // Explicitly requested melee or aggressive strategy
    if (options.strategy === 'aggressive') {
      suitability += 25;
    }
    
    return Math.max(0, Math.min(100, suitability));
  }
  
  update(bot: AnyBot, target: CombatTarget, options: CombatOptions): void {
    super.update(bot, target, options);
    
    // Update positioning if target moved significantly
    const botPos = this.getBotPosition(bot);
    if (botPos && target.entity.position.distanceTo(target.lastPosition) > 2) {
      // Target moved, update our position
      this.moveToOptimalPosition(bot, target).catch(error => {
        console.error('[MeleeStrategy] Error updating position:', error);
      });
    }
  }
  
  /**
   * Execute the main melee combat loop
   * @param bot The bot
   * @param target The target
   * @param options Combat options
   */
  private async executeMeleeCombat(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<void> {
    const startTime = Date.now();
    const maxDuration = (options.duration || 30) * 1000; // Convert to milliseconds
    const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
    
    while (this.isExecuting && Date.now() - startTime < maxDuration) {
      try {
        // Check if target is still valid and alive
        if (!target.entity || !this.isEntityAlive(target.entity)) {
          break;
        }
        
        // Update target distance
        const botPos = this.getBotPosition(bot);
        if (botPos) {
          target.distance = botPos.distanceTo(target.entity.position);
        }
        
        // If target is too far, move closer
        if (target.distance > this.MELEE_RANGE) {
          await this.moveToOptimalPosition(bot, target);
        }
        
        // Circle strafe for better positioning and avoiding damage
        if (target.distance < this.MELEE_RANGE) {
          await this.circleStrafe(bot, target);
        }
        
        // Check if we should retreat (low health)
        const botHealth = this.getBotHealth(bot);
        if (botHealth < 20 && options.retreatOnLowHealth !== false) {
          break;
        }
        
        // Continue attacking
        if ('pvp' in botInstance && botInstance.pvp && target.distance <= this.MELEE_RANGE) {
          if (!(botInstance.pvp as any).target || (botInstance.pvp as any).target !== target.entity) {
            (botInstance.pvp as any).attack(target.entity);
          }
        }
        
        // Wait a bit before next iteration
        await this.sleep(100);
        
      } catch (error) {
        console.error('[MeleeStrategy] Error in combat loop:', error);
        break;
      }
    }
  }
  
  /**
   * Move to optimal attack position relative to target
   * @param bot The bot
   * @param target The target
   */
  private async moveToOptimalPosition(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return;
      
      const currentDistance = botPos.distanceTo(targetPos);
      
      // If already at optimal range, don't move
      if (Math.abs(currentDistance - this.OPTIMAL_RANGE) < 0.5) {
        return;
      }
      
      // Calculate optimal position (slightly closer than max range)
      const direction = botPos.minus(targetPos).normalize();
      const optimalPos = targetPos.plus(direction.scaled(this.OPTIMAL_RANGE));
      
      // Use pathfinding to get there
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        await (botInstance as any).pathfinder.goto(optimalPos);
      }
    } catch (error) {
      console.error('[MeleeStrategy] Error moving to optimal position:', error);
    }
  }
  
  /**
   * Circle strafe around the target to avoid damage while maintaining attack range
   * @param bot The bot
   * @param target The target
   */
  private async circleStrafe(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return;
      
      // Calculate strafe position (perpendicular to current direction)
      const directionToTarget = targetPos.minus(botPos).normalize();
      const strafeDirection = directionToTarget.cross(new Vec3(0, 1, 0)).normalize();
      
      // Randomly choose left or right strafe
      const strafeMultiplier = Math.random() > 0.5 ? 1 : -1;
      const strafePos = botPos.plus(strafeDirection.scaled(2 * strafeMultiplier));
      
      // Move to strafe position
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        // Use a short timeout for quick movement
        const pathPromise = (botInstance as any).pathfinder.goto(strafePos);
        await Promise.race([
          pathPromise,
          this.sleep(500) // Don't spend too long strafing
        ]);
      }
    } catch (error) {
      console.error('[MeleeStrategy] Error circle strafing:', error);
    }
  }
  
  /**
   * Equip the best available melee weapon
   * @param bot The bot
   */
  private async equipMeleeWeapon(bot: AnyBot): Promise<void> {
    try {
      const meleeWeapon = this.getBestMeleeWeapon(bot);
      if (meleeWeapon) {
        const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
        const weapon = (botInstance as any).inventory?.items?.()?.find((item: any) => 
          item.name === meleeWeapon
        );
        
        if (weapon && 'equip' in botInstance) {
          await (botInstance as any).equip(weapon, 'hand');
        }
      }
    } catch (error) {
      console.error('[MeleeStrategy] Error equipping melee weapon:', error);
    }
  }
  
  /**
   * Get the best available melee weapon from inventory
   * @param bot The bot
   * @returns Best melee weapon name or null
   */
  private getBestMeleeWeapon(bot: AnyBot): string | null {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const items = (botInstance as any).inventory?.items?.() || [];
      
      const meleeWeapons = [
        'netherite_sword',
        'diamond_sword',
        'iron_sword',
        'stone_sword',
        'wooden_sword',
        'netherite_axe',
        'diamond_axe',
        'iron_axe',
        'stone_axe',
        'wooden_axe'
      ];
      
      for (const weapon of meleeWeapons) {
        const foundWeapon = items.find((item: any) => item.name === weapon);
        if (foundWeapon) {
          return weapon;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[MeleeStrategy] Error getting best melee weapon:', error);
      return null;
    }
  }
  
  /**
   * Check if entity is still alive
   * @param entity The entity to check
   * @returns True if entity is alive
   */
  private isEntityAlive(entity: any): boolean {
    try {
      // Entity is dead if it doesn't exist or has 0 health
      if (!entity) return false;
      
      // Check if entity still exists in the world (basic check)
      return entity.isValid !== false;
    } catch {
      return false;
    }
  }
  
  /**
   * Utility sleep function
   * @param ms Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}