import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import { AnyBot } from '../../../types.js';
import { CombatTarget, CombatOptions } from '../ICombatService.js';
import { BaseCombatStrategy } from './ICombatStrategy.js';
import { isUnifiedBot } from '../../../bots/UnifiedBot.js';

/**
 * Defensive combat strategy focused on survival and evasion
 * Prioritizes blocking, dodging, and strategic retreats
 */
@injectable()
export class DefensiveStrategy extends BaseCombatStrategy {
  readonly name = 'defensive';
  readonly description = 'Defensive combat strategy focused on survival and damage mitigation';
  
  private readonly SAFE_DISTANCE = 6; // Preferred distance from threats
  private readonly RETREAT_THRESHOLD = 30; // Health percentage to trigger retreat
  private readonly BLOCK_DISTANCE = 4; // Distance at which to use shield
  private readonly DODGE_COOLDOWN = 2000; // Milliseconds between dodge attempts
  
  private lastDodgeTime = 0;
  private retreating = false;
  
  async execute(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<boolean> {
    this.isExecuting = true;
    this.retreating = false;
    
    try {
      // Equip shield if available
      await this.equipShield(bot);
      
      // Get bot reference
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Execute defensive combat loop
      await this.executeDefensiveCombat(bot, target, options);
      
      return true;
    } catch (error) {
      console.error('[DefensiveStrategy] Error executing strategy:', error);
      return false;
    } finally {
      this.isExecuting = false;
      this.retreating = false;
    }
  }
  
  getSuitability(bot: AnyBot, target: CombatTarget, options: CombatOptions): number {
    let suitability = 30; // Base suitability
    
    // Highly suitable when bot health is low
    const botHealth = this.getBotHealth(bot);
    if (botHealth < 30) {
      suitability += 40; // Very suitable for low health
    } else if (botHealth < 50) {
      suitability += 20; // Suitable for medium health
    } else if (botHealth > 80) {
      suitability -= 10; // Less suitable when healthy
    }
    
    // Prefer when we have defensive equipment
    if (this.hasShield(bot)) {
      suitability += 25;
    }
    if (this.hasArmor(bot)) {
      suitability += 15;
    }
    
    // Prefer against high-threat enemies
    if (target.threat > 70) {
      suitability += 20; // Better to be defensive against dangerous enemies
    } else if (target.threat < 30) {
      suitability -= 15; // Overkill for weak enemies
    }
    
    // Consider number of nearby threats
    const nearbyThreats = this.countNearbyThreats(bot);
    if (nearbyThreats > 1) {
      suitability += 25; // Much better when outnumbered
    }
    
    // Prefer when target is close (need to defend)
    if (target.distance < this.SAFE_DISTANCE) {
      suitability += 15;
    }
    
    // Explicitly requested defensive strategy
    if (options.strategy === 'defensive') {
      suitability += 30;
    }
    
    // Consider food level (low food = defensive)
    const botFood = this.getBotFood(bot);
    if (botFood < 6) {
      suitability += 15; // More defensive when hungry
    }
    
    return Math.max(0, Math.min(100, suitability));
  }
  
  update(bot: AnyBot, target: CombatTarget, options: CombatOptions): void {
    super.update(bot, target, options);
    
    // Check if we need to start retreating
    const botHealth = this.getBotHealth(bot);
    if (botHealth < this.RETREAT_THRESHOLD && !this.retreating) {
      this.retreating = true;
      this.executeRetreat(bot, target).catch(error => {
        console.error('[DefensiveStrategy] Error executing retreat:', error);
      });
    }
  }
  
  /**
   * Execute the main defensive combat loop
   * @param bot The bot
   * @param target The target
   * @param options Combat options
   */
  private async executeDefensiveCombat(bot: AnyBot, target: CombatTarget, options: CombatOptions): Promise<void> {
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
        
        // Check health and decide on action
        const botHealth = this.getBotHealth(bot);
        
        // If very low health, prioritize retreat
        if (botHealth < this.RETREAT_THRESHOLD) {
          await this.executeRetreat(bot, target);
          continue;
        }
        
        // Maintain safe distance
        if (target.distance < this.SAFE_DISTANCE) {
          await this.maintainSafeDistance(bot, target);
        }
        
        // Use shield if target is close and we have one
        if (target.distance <= this.BLOCK_DISTANCE && this.hasShield(bot)) {
          await this.raiseShield(bot);
        }
        
        // Dodge incoming attacks
        if (this.shouldDodge(bot, target)) {
          await this.performDodge(bot, target);
        }
        
        // Counter-attack when safe
        if (this.canCounterAttack(bot, target)) {
          await this.counterAttack(bot, target);
        }
        
        // Wait before next iteration
        await this.sleep(150);
        
      } catch (error) {
        console.error('[DefensiveStrategy] Error in combat loop:', error);
        break;
      }
    }
  }
  
  /**
   * Execute a strategic retreat
   * @param bot The bot
   * @param target The target
   */
  private async executeRetreat(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return;
      
      // Find retreat direction (away from target)
      const retreatDirection = botPos.minus(targetPos).normalize();
      const retreatDistance = Math.max(15, this.SAFE_DISTANCE * 2);
      const retreatPos = botPos.plus(retreatDirection.scaled(retreatDistance));
      
      console.log(`[DefensiveStrategy] Retreating to safety (health: ${this.getBotHealth(bot)}%)`);
      
      // Use pathfinding to retreat
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        await (botInstance as any).pathfinder.goto(retreatPos);
      }
      
      // Try to find cover or higher ground
      await this.findCover(bot);
      
    } catch (error) {
      console.error('[DefensiveStrategy] Error during retreat:', error);
    }
  }
  
  /**
   * Maintain safe distance from target
   * @param bot The bot
   * @param target The target
   */
  private async maintainSafeDistance(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return;
      
      // Calculate position to maintain safe distance
      const direction = botPos.minus(targetPos).normalize();
      const safePos = targetPos.plus(direction.scaled(this.SAFE_DISTANCE));
      
      // Move to safe position
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        const pathPromise = (botInstance as any).pathfinder.goto(safePos);
        await Promise.race([
          pathPromise,
          this.sleep(1500) // Don't spend too long repositioning
        ]);
      }
    } catch (error) {
      console.error('[DefensiveStrategy] Error maintaining safe distance:', error);
    }
  }
  
  /**
   * Raise shield to block incoming attacks
   * @param bot The bot
   */
  private async raiseShield(bot: AnyBot): Promise<void> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Activate shield (right-click with shield)
      if ('activateItem' in botInstance && this.hasShield(bot)) {
        (botInstance as any).activateItem();
        await this.sleep(500); // Block for a short duration
        (botInstance as any).deactivateItem();
      }
    } catch (error) {
      console.error('[DefensiveStrategy] Error raising shield:', error);
    }
  }
  
  /**
   * Check if bot should dodge
   * @param bot The bot
   * @param target The target
   * @returns True if should dodge
   */
  private shouldDodge(bot: AnyBot, target: CombatTarget): boolean {
    const now = Date.now();
    
    // Don't dodge too frequently
    if (now - this.lastDodgeTime < this.DODGE_COOLDOWN) {
      return false;
    }
    
    // Dodge if target is close and we haven't dodged recently
    return target.distance <= 5;
  }
  
  /**
   * Perform evasive dodge maneuver
   * @param bot The bot
   * @param target The target
   */
  private async performDodge(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      const targetPos = target.entity.position;
      
      if (!botPos || !targetPos) return;
      
      // Calculate perpendicular dodge direction
      const toTarget = targetPos.minus(botPos).normalize();
      const dodgeDirection = toTarget.cross(new Vec3(0, 1, 0)).normalize();
      
      // Randomly choose left or right dodge
      const dodgeMultiplier = Math.random() > 0.5 ? 1 : -1;
      const dodgePos = botPos.plus(dodgeDirection.scaled(3 * dodgeMultiplier));
      
      console.log('[DefensiveStrategy] Performing evasive dodge');
      
      // Quick dodge movement
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        const pathPromise = (botInstance as any).pathfinder.goto(dodgePos);
        await Promise.race([
          pathPromise,
          this.sleep(800) // Quick dodge
        ]);
      }
      
      this.lastDodgeTime = Date.now();
    } catch (error) {
      console.error('[DefensiveStrategy] Error performing dodge:', error);
    }
  }
  
  /**
   * Check if it's safe to counter-attack
   * @param bot The bot
   * @param target The target
   * @returns True if can safely counter-attack
   */
  private canCounterAttack(bot: AnyBot, target: CombatTarget): boolean {
    const botHealth = this.getBotHealth(bot);
    
    // Only counter-attack if health is reasonable
    if (botHealth < 40) {
      return false;
    }
    
    // Only counter-attack if target is within reasonable range
    if (target.distance > 8) {
      return false;
    }
    
    // Don't counter-attack if retreating
    if (this.retreating) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Perform a quick counter-attack
   * @param bot The bot
   * @param target The target
   */
  private async counterAttack(bot: AnyBot, target: CombatTarget): Promise<void> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      
      // Quick melee attack if close enough
      if (target.distance <= 4 && 'pvp' in botInstance && botInstance.pvp) {
        console.log('[DefensiveStrategy] Counter-attacking');
        (botInstance.pvp as any).attack(target.entity);
        await this.sleep(500); // Brief attack window
        (botInstance.pvp as any).forceStop?.();
      }
    } catch (error) {
      console.error('[DefensiveStrategy] Error counter-attacking:', error);
    }
  }
  
  /**
   * Try to find cover (move to higher ground or behind blocks)
   * @param bot The bot
   */
  private async findCover(bot: AnyBot): Promise<void> {
    try {
      const botPos = this.getBotPosition(bot);
      if (!botPos) return;
      
      // Simple strategy: move to higher ground
      const higherPos = botPos.offset(0, 2, 0);
      
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        await Promise.race([
          (botInstance as any).pathfinder.goto(higherPos),
          this.sleep(2000)
        ]);
      }
    } catch (error) {
      console.error('[DefensiveStrategy] Error finding cover:', error);
    }
  }
  
  /**
   * Equip shield if available
   * @param bot The bot
   */
  private async equipShield(bot: AnyBot): Promise<void> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const items = (botInstance as any).inventory?.items?.() || [];
      
      const shield = items.find((item: any) => item.name === 'shield');
      
      if (shield && 'equip' in botInstance) {
        await (botInstance as any).equip(shield, 'off-hand');
      }
    } catch (error) {
      console.error('[DefensiveStrategy] Error equipping shield:', error);
    }
  }
  
  /**
   * Check if bot has a shield
   * @param bot The bot
   * @returns True if has shield
   */
  private hasShield(bot: AnyBot): boolean {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const items = (botInstance as any).inventory?.items?.() || [];
      return items.some((item: any) => item.name === 'shield');
    } catch {
      return false;
    }
  }
  
  /**
   * Check if bot has armor equipped
   * @param bot The bot
   * @returns True if has armor
   */
  private hasArmor(bot: AnyBot): boolean {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const inventory = (botInstance as any).inventory;
      
      // Check armor slots (helmet, chestplate, leggings, boots)
      const armorSlots = [5, 6, 7, 8]; // Standard armor slot numbers
      
      return armorSlots.some(slot => {
        const item = inventory?.slots?.[slot];
        return item && item.name && item.name.includes('helmet') || 
               item.name.includes('chestplate') || 
               item.name.includes('leggings') || 
               item.name.includes('boots');
      });
    } catch {
      return false;
    }
  }
  
  /**
   * Count nearby threats
   * @param bot The bot
   * @returns Number of nearby threats
   */
  private countNearbyThreats(bot: AnyBot): number {
    try {
      const botPos = this.getBotPosition(bot);
      if (!botPos) return 0;
      
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const entities = Object.values((botInstance as any).entities || {});
      
      return entities.filter((entity: any) => {
        if (!entity || !entity.position) return false;
        const distance = entity.position.distanceTo(botPos);
        return distance <= 10 && this.isHostileEntity(entity);
      }).length;
    } catch {
      return 0;
    }
  }
  
  /**
   * Check if entity is hostile
   * @param entity The entity to check
   * @returns True if hostile
   */
  private isHostileEntity(entity: any): boolean {
    const hostileTypes = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch'];
    const entityName = entity.name?.toLowerCase() || entity.displayName?.toLowerCase() || '';
    return hostileTypes.some(type => entityName.includes(type));
  }
  
  /**
   * Get bot's food level
   * @param bot The bot
   * @returns Food level (0-20)
   */
  private getBotFood(bot: AnyBot): number {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      return (botInstance as any).food || 20;
    } catch {
      return 20; // Default to full food
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