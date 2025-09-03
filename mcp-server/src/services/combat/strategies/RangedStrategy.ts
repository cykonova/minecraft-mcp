import { injectable } from 'tsyringe';
import { AnyBot } from '../../../types.js';
import { CombatTarget, CombatOptions } from '../ICombatService.js';
import { BaseCombatStrategy } from './ICombatStrategy.js';
import { isUnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Ranged combat strategy using bows, crossbows, and tridents
 * Focuses on maintaining distance while dealing damage
 */
@injectable()
export class RangedStrategy extends BaseCombatStrategy {
  readonly name = 'ranged';
  readonly description = 'Ranged combat strategy using bows, crossbows, and projectiles';
  
  private readonly MIN_RANGE = 8; // Minimum distance to maintain
  private readonly MAX_RANGE = 32; // Maximum effective range
  private readonly OPTIMAL_RANGE = 16; // Optimal shooting distance
  private readonly KITE_DISTANCE = 12; // Distance to maintain while kiting
  
  async execute(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<boolean> {
    this.isExecuting = true;
    
    try {
      // Equip best ranged weapon
      await this.equipRangedWeapon(bot);
      
      // Get bot reference
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Move to optimal shooting position
      await this.moveToShootingPosition(bot, target);
      
      // Execute ranged combat loop
      await this.executeRangedCombat(bot, target, options);
      
      return true;
    } catch (error) {
      console.error('[RangedStrategy] Error executing strategy:', error);
      return false;
    } finally {
      this.isExecuting = false;
    }
  }
  
  getSuitability(bot: AnyBot, target: CombatTarget, options: CombatOptions): number {
    let suitability = 40; // Base suitability
    
    // Prefer when target is at medium to long range
    if (target.distance >= this.MIN_RANGE && target.distance <= this.MAX_RANGE) {
      suitability += 40;
    } else if (target.distance < this.MIN_RANGE) {
      suitability -= 20; // Less suitable for close targets
    } else {
      suitability -= 30; // Much less suitable for very distant targets
    }
    
    // Prefer when we have good ranged weapons and ammunition
    const rangedWeapon = this.getBestRangedWeapon(bot);
    if (rangedWeapon) {
      suitability += 25;
      
      // Check for ammunition
      if (this.hasAmmunition(bot, rangedWeapon)) {
        suitability += 15;
      } else {
        suitability -= 30; // Useless without ammo
      }
    } else {
      suitability -= 40; // Much less suitable without ranged weapons
    }
    
    // Prefer when we have line of sight
    if (this.hasLineOfSight(bot, target)) {
      suitability += 20;
    } else {
      suitability -= 25;
    }
    
    // Consider bot health - ranged is safer for low health
    const botHealth = this.getBotHealth(bot);
    if (botHealth < 50) {
      suitability += 20; // Safer when low health
    } else if (botHealth > 80) {
      suitability += 5; // Still good when healthy
    }
    
    // Prefer against certain enemy types
    const targetType = target.type;
    if (['creeper'].includes(targetType)) {
      suitability += 25; // Much safer against creepers
    } else if (['skeleton'].includes(targetType)) {
      suitability += 15; // Good against other ranged enemies
    } else if (['spider', 'enderman'].includes(targetType)) {
      suitability -= 10; // These are fast and can close distance quickly
    }
    
    // Explicitly requested ranged strategy
    if (options.strategy === 'ranged') {
      suitability += 30;
    }
    
    return Math.max(0, Math.min(100, suitability));
  }
  
  update(bot: AnyBot, target: CombatTarget, options: CombatOptions): void {
    super.update(bot, target, options);
    
    // Continuously adjust position to maintain optimal range
    const botPos = this.getBotPosition(bot);
    if (botPos) {
      const currentDistance = botPos.distanceTo(target.entity.position);
      
      // If target is too close, kite away
      if (currentDistance < this.MIN_RANGE) {
        this.kiteAway(bot, target).catch(error => {
          console.error('[RangedStrategy] Error kiting away:', error);
        });
      }
      // If target is too far, move closer (but maintain safe distance)
      else if (currentDistance > this.MAX_RANGE) {
        this.moveToShootingPosition(bot, target).catch(error => {
          console.error('[RangedStrategy] Error moving to shooting position:', error);
        });
      }
    }
  }
  
  /**
   * Execute the main ranged combat loop
   * @param bot The bot
   * @param target The target
   * @param options Combat options
   */
  private async executeRangedCombat(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<void> {
    const startTime = Date.now();
    const maxDuration = (options.duration || 30) * 1000;
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
        
        // Maintain optimal distance
        if (target.distance < this.MIN_RANGE) {
          await this.kiteAway(bot, target);
        } else if (target.distance > this.MAX_RANGE) {
          await this.moveToShootingPosition(bot, target);
        }
        
        // Shoot at target if in range and have line of sight
        if (target.distance >= this.MIN_RANGE && 
            target.distance <= this.MAX_RANGE && 
            this.hasLineOfSight(bot, target)) {
          await this.shootAtTarget(bot, target);
        }
        
        // Check if we should retreat (very low health)
        const botHealth = this.getBotHealth(bot);
        if (botHealth < 15 && options.retreatOnLowHealth !== false) {
          break;
        }
        
        // Wait before next iteration
        await this.sleep(200); // Slightly longer delay for ranged combat
        
      } catch (error) {
        console.error('[RangedStrategy] Error in combat loop:', error);
        break;
      }
    }
  }
  
  /**
   * Move to optimal shooting position
   * @param bot The bot
   * @param target The target
   */
  private async moveToShootingPosition(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return;
      
      // Calculate optimal shooting position
      const direction = botPos.minus(targetPos).normalize();
      const shootingPos = targetPos.plus(direction.scaled(this.OPTIMAL_RANGE));
      
      // Add some height advantage if possible
      shootingPos.y += 1;
      
      // Use pathfinding to get there
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        await (botInstance as any).pathfinder.goto(shootingPos);
      }
    } catch (error) {
      console.error('[RangedStrategy] Error moving to shooting position:', error);
    }
  }
  
  /**
   * Kite away from target to maintain safe distance
   * @param bot The bot
   * @param target The target
   */
  private async kiteAway(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return;
      
      // Calculate direction away from target
      const awayDirection = botPos.minus(targetPos).normalize();
      const kitePos = botPos.plus(awayDirection.scaled(this.KITE_DISTANCE));
      
      // Use pathfinding to kite away
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        // Use shorter timeout for quick evasive movement
        const pathPromise = (botInstance as any).pathfinder.goto(kitePos);
        await Promise.race([
          pathPromise,
          this.sleep(1000) // Don't spend too long kiting
        ]);
      }
    } catch (error) {
      console.error('[RangedStrategy] Error kiting away:', error);
    }
  }
  
  /**
   * Shoot at the target
   * @param bot The bot
   * @param target The target
   */
  private async shootAtTarget(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Look at target first
      if ('lookAt' in botInstance) {
        await (botInstance as any).lookAt(target.entity.position);
      }
      
      // Get current weapon
      const weapon = this.getCurrentWeapon(bot);
      if (!weapon) return;
      
      // Shoot based on weapon type
      if (weapon.includes('bow')) {
        await this.shootBow(bot, target);
      } else if (weapon.includes('crossbow')) {
        await this.shootCrossbow(bot, target);
      } else if (weapon.includes('trident')) {
        await this.throwTrident(bot, target);
      }
      
    } catch (error) {
      console.error('[RangedStrategy] Error shooting at target:', error);
    }
  }
  
  /**
   * Shoot with bow
   * @param bot The bot
   * @param target The target
   */
  private async shootBow(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Start charging bow
      if ('activateItem' in botInstance) {
        (botInstance as any).activateItem();
        
        // Charge for optimal power (1-2 seconds)
        const chargeTime = Math.min(2000, Math.max(1000, target.distance * 50));
        await this.sleep(chargeTime);
        
        // Release
        (botInstance as any).deactivateItem();
      }
    } catch (error) {
      console.error('[RangedStrategy] Error shooting bow:', error);
    }
  }
  
  /**
   * Shoot with crossbow
   * @param bot The bot
   * @param target The target
   */
  private async shootCrossbow(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Crossbows are charged separately, just shoot
      if ('activateItem' in botInstance) {
        (botInstance as any).activateItem();
        await this.sleep(100);
        (botInstance as any).deactivateItem();
      }
    } catch (error) {
      console.error('[RangedStrategy] Error shooting crossbow:', error);
    }
  }
  
  /**
   * Throw trident
   * @param bot The bot
   * @param target The target
   */
  private async throwTrident(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Charge and throw trident
      if ('activateItem' in botInstance) {
        (botInstance as any).activateItem();
        await this.sleep(1000); // Charge for 1 second
        (botInstance as any).deactivateItem();
      }
    } catch (error) {
      console.error('[RangedStrategy] Error throwing trident:', error);
    }
  }
  
  /**
   * Equip the best available ranged weapon
   * @param bot The bot
   */
  private async equipRangedWeapon(bot: AnyBot): Promise<void> {
    try {
      const rangedWeapon = this.getBestRangedWeapon(bot);
      if (rangedWeapon) {
        const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
        const weapon = (botInstance as any).inventory?.items?.()?.find((item: any) => 
          item.name === rangedWeapon
        );
        
        if (weapon && 'equip' in botInstance) {
          await (botInstance as any).equip(weapon, 'hand');
        }
      }
    } catch (error) {
      console.error('[RangedStrategy] Error equipping ranged weapon:', error);
    }
  }
  
  /**
   * Get the best available ranged weapon from inventory
   * @param bot The bot
   * @returns Best ranged weapon name or null
   */
  private getBestRangedWeapon(bot: AnyBot): string | null {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const items = (botInstance as any).inventory?.items?.() || [];
      
      const rangedWeapons = [
        'crossbow',
        'bow',
        'trident'
      ];
      
      for (const weapon of rangedWeapons) {
        const foundWeapon = items.find((item: any) => item.name === weapon);
        if (foundWeapon && this.hasAmmunition(bot, weapon)) {
          return weapon;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[RangedStrategy] Error getting best ranged weapon:', error);
      return null;
    }
  }
  
  /**
   * Check if bot has ammunition for the weapon
   * @param bot The bot
   * @param weapon The weapon name
   * @returns True if has ammunition
   */
  private hasAmmunition(bot: AnyBot, weapon: string): boolean {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const items = (botInstance as any).inventory?.items?.() || [];
      
      if (weapon.includes('bow') || weapon.includes('crossbow')) {
        return items.some((item: any) => 
          item.name === 'arrow' || 
          item.name === 'spectral_arrow' || 
          item.name === 'tipped_arrow'
        );
      }
      
      // Trident doesn't need ammunition (but is consumed unless it has Loyalty)
      if (weapon.includes('trident')) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[RangedStrategy] Error checking ammunition:', error);
      return false;
    }
  }
  
  /**
   * Get currently equipped weapon
   * @param bot The bot
   * @returns Current weapon name or null
   */
  private getCurrentWeapon(bot: AnyBot): string | null {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const heldItem = (botInstance as any).heldItem;
      return heldItem?.name || null;
    } catch (error) {
      console.error('[RangedStrategy] Error getting current weapon:', error);
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
      if (!entity) return false;
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