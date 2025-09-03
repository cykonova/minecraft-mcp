import { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';
import { injectable, singleton } from 'tsyringe';
import { AnyBot } from '../../types.js';
import { isUnifiedBot } from '../../bots/UnifiedBot.js';
import { CombatTarget } from './ICombatService.js';

/**
 * Threat assessment service for evaluating combat threats and target prioritization
 */
@injectable()
@singleton()
export class ThreatAssessment {
  // Threat weights for different factors
  private readonly THREAT_WEIGHTS = {
    DISTANCE: 0.3,
    HEALTH: 0.2,
    DAMAGE_POTENTIAL: 0.25,
    ENTITY_TYPE: 0.15,
    AGGRESSION: 0.1
  };

  // Entity type threat levels
  private readonly ENTITY_THREAT_LEVELS: { [key: string]: number } = {
    // Hostile mobs (high threat)
    'zombie': 60,
    'skeleton': 70,
    'creeper': 90,
    'spider': 50,
    'enderman': 80,
    'witch': 75,
    'zombie_villager': 55,
    'husk': 60,
    'stray': 70,
    'wither_skeleton': 95,
    'blaze': 85,
    'ghast': 80,
    'phantom': 65,
    'drowned': 65,
    'pillager': 75,
    'vindicator': 85,
    'evoker': 90,
    'ravager': 95,
    'warden': 100,
    
    // Neutral mobs (medium threat when provoked)
    'wolf': 40,
    'iron_golem': 70,
    'polar_bear': 60,
    'llama': 30,
    'dolphin': 35,
    'panda': 45,
    'bee': 25,
    'endermite': 20,
    'silverfish': 25,
    
    // Passive mobs (low threat)
    'cow': 10,
    'pig': 10,
    'sheep': 10,
    'chicken': 5,
    'rabbit': 5,
    'horse': 15,
    'donkey': 15,
    'mule': 15,
    'cat': 5,
    'ocelot': 10,
    'parrot': 5,
    'villager': 5,
    
    // Players (variable threat based on equipment and behavior)
    'player': 70
  };

  // Weapon damage values for threat calculation
  private readonly WEAPON_DAMAGE: { [key: string]: number } = {
    'netherite_sword': 8,
    'diamond_sword': 7,
    'iron_sword': 6,
    'stone_sword': 5,
    'wooden_sword': 4,
    'netherite_axe': 10,
    'diamond_axe': 9,
    'iron_axe': 9,
    'stone_axe': 9,
    'wooden_axe': 7,
    'bow': 9,
    'crossbow': 11,
    'trident': 9
  };

  /**
   * Assess all threats in the area around a bot
   * @param bot The bot to assess threats for
   * @param maxRange Maximum range to scan for threats
   * @returns Array of combat targets sorted by priority (highest first)
   */
  assessThreats(bot: AnyBot, maxRange: number = 32): CombatTarget[] {
    const threats: CombatTarget[] = [];
    const botPosition = this.getBotPosition(bot);
    const botHealth = this.getBotHealth(bot);
    
    // Get nearby entities
    const nearbyEntities = this.getNearbyEntities(bot, maxRange);
    
    for (const entity of nearbyEntities) {
      // Skip self and invalid entities
      if (this.isBot(bot, entity) || !this.isValidTarget(entity)) {
        continue;
      }

      const target = this.createCombatTarget(entity, botPosition, botHealth);
      if (target) {
        threats.push(target);
      }
    }

    // Sort by priority (highest first)
    threats.sort((a, b) => b.priority - a.priority);
    
    return threats;
  }

  /**
   * Calculate threat level for a specific entity
   * @param entity The entity to assess
   * @param botPosition Bot's current position
   * @param botHealth Bot's current health
   * @returns Threat level (0-100)
   */
  calculateThreatLevel(entity: Entity, botPosition: Vec3, botHealth: number): number {
    let threatLevel = 0;

    // Base threat from entity type
    const entityName = entity.name?.toLowerCase() || entity.displayName?.toLowerCase() || 'unknown';
    const baseThreat = this.ENTITY_THREAT_LEVELS[entityName] || 30;
    threatLevel += baseThreat * this.THREAT_WEIGHTS.ENTITY_TYPE;

    // Distance factor (closer = more threatening)
    const distance = entity.position.distanceTo(botPosition);
    const distanceThreat = Math.max(0, 100 - (distance * 3)); // Linear decrease
    threatLevel += distanceThreat * this.THREAT_WEIGHTS.DISTANCE;

    // Health factor (low bot health makes everything more threatening)
    const healthThreat = Math.max(0, 100 - botHealth);
    threatLevel += healthThreat * this.THREAT_WEIGHTS.HEALTH;

    // Damage potential (check for weapons/equipment)
    const damageThreat = this.assessDamagePotential(entity);
    threatLevel += damageThreat * this.THREAT_WEIGHTS.DAMAGE_POTENTIAL;

    // Aggression factor (is entity already hostile/targeting bot)
    const aggressionThreat = this.assessAggression(entity);
    threatLevel += aggressionThreat * this.THREAT_WEIGHTS.AGGRESSION;

    return Math.min(100, Math.max(0, threatLevel));
  }

  /**
   * Calculate priority level for a target
   * @param entity The entity to assess
   * @param botPosition Bot's current position
   * @param options Combat options that may affect priority
   * @returns Priority level (0-100)
   */
  calculatePriority(entity: Entity, botPosition: Vec3, options?: any): number {
    let priority = 0;

    // Base priority from threat level
    const threatLevel = this.calculateThreatLevel(entity, botPosition, 100);
    priority += threatLevel * 0.6; // Threat contributes 60% to priority

    // Distance factor (closer targets are higher priority for engagement)
    const distance = entity.position.distanceTo(botPosition);
    const distancePriority = Math.max(0, 50 - distance); // Prefer closer targets
    priority += distancePriority * 0.2;

    // Entity health (lower health = easier kill = higher priority)
    const entityHealth = this.getEntityHealth(entity);
    const healthPriority = Math.max(0, 100 - (entityHealth || 0));
    priority += healthPriority * 0.1;

    // Target type preference (if specified in options)
    if (options?.targetType) {
      const entityType = this.getEntityType(entity);
      if (entityType === options.targetType) {
        priority += 20; // Boost priority for preferred type
      }
    }

    // Specific target name match
    if (options?.targetName) {
      const entityName = entity.name || entity.displayName || '';
      if (entityName.toLowerCase().includes(options.targetName.toLowerCase())) {
        priority += 30; // High boost for specific target
      }
    }

    return Math.min(100, Math.max(0, priority));
  }

  /**
   * Check if an entity is currently aggressive toward the bot
   * @param entity The entity to check
   * @returns Aggression level (0-100)
   */
  private assessAggression(entity: Entity): number {
    // This would need to check entity behavior/target
    // For now, return base aggression based on entity type
    const entityName = entity.name?.toLowerCase() || entity.displayName?.toLowerCase() || 'unknown';
    
    // Hostile mobs are always aggressive
    if (['zombie', 'skeleton', 'creeper', 'spider', 'enderman'].includes(entityName)) {
      return 80;
    }
    
    // Players could be aggressive (would need more context)
    if (entityName === 'player') {
      return 40; // Moderate assumption
    }
    
    // Most other entities are not naturally aggressive
    return 10;
  }

  /**
   * Assess the damage potential of an entity
   * @param entity The entity to assess
   * @returns Damage potential (0-100)
   */
  private assessDamagePotential(entity: Entity): number {
    let damage = 30; // Base damage potential

    // Check for weapons in hand (for players and some mobs)
    const heldItem = this.getHeldItem(entity);
    if (heldItem && this.WEAPON_DAMAGE[heldItem]) {
      damage += this.WEAPON_DAMAGE[heldItem] * 8; // Scale weapon damage
    }

    // Entity-specific damage potential
    const entityName = entity.name?.toLowerCase() || entity.displayName?.toLowerCase() || 'unknown';
    switch (entityName) {
      case 'creeper':
        return 90; // Explosion damage
      case 'wither_skeleton':
        return 85; // High damage + wither effect
      case 'blaze':
        return 75; // Fire damage
      case 'ghast':
        return 70; // Fireball damage
      case 'ravager':
        return 80; // High melee damage
      case 'warden':
        return 100; // Extremely high damage
      default:
        break;
    }

    return Math.min(100, damage);
  }

  /**
   * Create a combat target from an entity
   * @param entity The entity to convert
   * @param botPosition Bot's current position
   * @param botHealth Bot's current health
   * @returns Combat target or null if invalid
   */
  private createCombatTarget(entity: Entity, botPosition: Vec3, botHealth: number): CombatTarget | null {
    try {
      const distance = entity.position.distanceTo(botPosition);
      const threat = this.calculateThreatLevel(entity, botPosition, botHealth);
      const priority = this.calculatePriority(entity, botPosition);
      const healthPercent = this.getEntityHealth(entity);
      const type = this.getEntityType(entity);

      return {
        entity,
        priority,
        threat,
        distance,
        healthPercent,
        type,
        lastPosition: entity.position.clone(),
        lastSeen: new Date()
      };
    } catch (error) {
      console.error('[ThreatAssessment] Error creating combat target:', error);
      return null;
    }
  }

  /**
   * Get bot's current position
   * @param bot The bot
   * @returns Position vector
   */
  private getBotPosition(bot: AnyBot): Vec3 {
    if (isUnifiedBot(bot)) {
      return bot._bot.entity.position;
    }
    return bot.entity.position;
  }

  /**
   * Get bot's current health percentage
   * @param bot The bot
   * @returns Health percentage (0-100)
   */
  private getBotHealth(bot: AnyBot): number {
    try {
      if (isUnifiedBot(bot)) {
        const health = bot._bot.health;
        return Math.round((health / 20) * 100); // Minecraft health is out of 20
      }
      const health = bot.health;
      return Math.round((health / 20) * 100);
    } catch {
      return 100; // Default to full health if can't determine
    }
  }

  /**
   * Get nearby entities within range
   * @param bot The bot
   * @param maxRange Maximum range to check
   * @returns Array of nearby entities
   */
  private getNearbyEntities(bot: AnyBot, maxRange: number): Entity[] {
    try {
      if (isUnifiedBot(bot)) {
        const entities = Object.values(bot._bot.entities as { [key: string]: Entity });
        return entities.filter((entity: Entity) => {
          if (!entity || !entity.position) return false;
          const distance = entity.position.distanceTo(bot._bot.entity.position);
          return distance <= maxRange;
        });
      }
      
      // For regular bot, get entities from world
      const entities = Object.values((bot as any).entities || {}) as Entity[];
      return entities.filter((entity: Entity) => {
        if (!entity || !entity.position) return false;
        const distance = entity.position.distanceTo(bot.entity.position);
        return distance <= maxRange;
      });
    } catch (error) {
      console.error('[ThreatAssessment] Error getting nearby entities:', error);
      return [];
    }
  }

  /**
   * Check if entity is the bot itself
   * @param bot The bot
   * @param entity The entity to check
   * @returns True if entity is the bot
   */
  private isBot(bot: AnyBot, entity: Entity): boolean {
    if (isUnifiedBot(bot)) {
      return entity.id === bot._bot.entity.id;
    }
    return entity.id === bot.entity.id;
  }

  /**
   * Check if entity is a valid combat target
   * @param entity The entity to check
   * @returns True if valid target
   */
  private isValidTarget(entity: Entity): boolean {
    if (!entity || !entity.position) return false;
    if (!entity.name && !entity.displayName) return false;
    return true;
  }

  /**
   * Get entity's current health percentage
   * @param entity The entity
   * @returns Health percentage (0-100)
   */
  private getEntityHealth(entity: Entity): number {
    try {
      // Try to get health from metadata (varies by Minecraft version)
      const metadata = entity.metadata;
      if (metadata) {
        // Health is typically in metadata slot 6-9 depending on version
        for (let i = 6; i <= 9; i++) {
          if (metadata[i] && typeof metadata[i] === 'number') {
            return Math.round((Number(metadata[i]) / 20) * 100);
          }
        }
      }
      return 100; // Default to full health if can't determine
    } catch {
      return 100;
    }
  }

  /**
   * Get entity type (player, hostile, neutral, passive)
   * @param entity The entity
   * @returns Entity type string
   */
  private getEntityType(entity: Entity): string {
    const entityName = entity.name?.toLowerCase() || entity.displayName?.toLowerCase() || 'unknown';
    
    if (entity.type === 'player') {
      return 'player';
    }
    
    if (['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch'].includes(entityName)) {
      return 'hostile';
    }
    
    if (['cow', 'pig', 'sheep', 'chicken', 'rabbit', 'villager'].includes(entityName)) {
      return 'passive';
    }
    
    return 'neutral';
  }

  /**
   * Get held item name for an entity (if visible)
   * @param entity The entity
   * @returns Item name or null
   */
  private getHeldItem(entity: Entity): string | null {
    try {
      // This would depend on entity metadata structure
      // For now, return null as implementation would be version-specific
      return null;
    } catch {
      return null;
    }
  }
}