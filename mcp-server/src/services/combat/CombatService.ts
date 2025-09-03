import { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';
import { injectable, singleton } from 'tsyringe';
import { EventEmitter } from 'events';

import { AnyBot } from '../../types.js';
import { isUnifiedBot } from '../../bots/UnifiedBot.js';
import { 
  ICombatService, 
  CombatTarget, 
  CombatOptions, 
  CombatState, 
  CombatEvent, 
  WeaponInfo 
} from './ICombatService.js';
import { ThreatAssessment } from './ThreatAssessment.js';
import { ICombatStrategy } from './strategies/ICombatStrategy.js';
import { MeleeStrategy } from './strategies/MeleeStrategy.js';
import { RangedStrategy } from './strategies/RangedStrategy.js';
import { DefensiveStrategy } from './strategies/DefensiveStrategy.js';

/**
 * Combat statistics tracking
 */
interface CombatStats {
  totalKills: number;
  totalDeaths: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  combatTime: number;
  combatSessions: number;
  lastCombatEnd: Date;
}

/**
 * Active combat session tracking
 */
interface CombatSession {
  bot: AnyBot;
  target: CombatTarget | null;
  strategy: ICombatStrategy | null;
  startTime: Date;
  options: CombatOptions;
  isActive: boolean;
  killCount: number;
}

/**
 * Comprehensive combat management service
 * Handles all combat operations with strategy pattern and threat assessment
 */
@injectable()
@singleton()
export class CombatService extends EventEmitter implements ICombatService {
  private activeSessions = new Map<string, CombatSession>();
  private combatStats = new Map<string, CombatStats>();
  private strategies = new Map<string, ICombatStrategy>();
  private lastThreatAssessment = new Map<string, Date>();
  
  // Weapon damage and priority mappings
  private readonly WEAPON_INFO: { [key: string]: WeaponInfo } = {
    // Swords
    'netherite_sword': { name: 'netherite_sword', damage: 8, durability: 2031, range: 3, type: 'sword', material: 'netherite' },
    'diamond_sword': { name: 'diamond_sword', damage: 7, durability: 1561, range: 3, type: 'sword', material: 'diamond' },
    'iron_sword': { name: 'iron_sword', damage: 6, durability: 250, range: 3, type: 'sword', material: 'iron' },
    'stone_sword': { name: 'stone_sword', damage: 5, durability: 131, range: 3, type: 'sword', material: 'stone' },
    'wooden_sword': { name: 'wooden_sword', damage: 4, durability: 59, range: 3, type: 'sword', material: 'wood' },
    
    // Axes
    'netherite_axe': { name: 'netherite_axe', damage: 10, durability: 2031, range: 3, type: 'axe', material: 'netherite' },
    'diamond_axe': { name: 'diamond_axe', damage: 9, durability: 1561, range: 3, type: 'axe', material: 'diamond' },
    'iron_axe': { name: 'iron_axe', damage: 9, durability: 250, range: 3, type: 'axe', material: 'iron' },
    'stone_axe': { name: 'stone_axe', damage: 9, durability: 131, range: 3, type: 'axe', material: 'stone' },
    'wooden_axe': { name: 'wooden_axe', damage: 7, durability: 59, range: 3, type: 'axe', material: 'wood' },
    
    // Ranged
    'bow': { name: 'bow', damage: 9, durability: 384, range: 32, type: 'bow', material: 'other' },
    'crossbow': { name: 'crossbow', damage: 11, durability: 326, range: 32, type: 'crossbow', material: 'other' },
    'trident': { name: 'trident', damage: 9, durability: 250, range: 20, type: 'trident', material: 'other' }
  };
  
  private threatAssessment: ThreatAssessment;
  private meleeStrategy: MeleeStrategy;
  private rangedStrategy: RangedStrategy;
  private defensiveStrategy: DefensiveStrategy;

  constructor() {
    super();
    // Create instances directly to avoid circular dependency issues
    this.threatAssessment = new ThreatAssessment();
    this.meleeStrategy = new MeleeStrategy();
    this.rangedStrategy = new RangedStrategy();
    this.defensiveStrategy = new DefensiveStrategy();
    this.initializeStrategies();
    console.error('[CombatService] Initialized with strategies and threat assessment');
  }
  
  /**
   * Initialize combat strategies
   */
  private initializeStrategies(): void {
    this.strategies.set('melee', this.meleeStrategy);
    this.strategies.set('aggressive', this.meleeStrategy);
    this.strategies.set('ranged', this.rangedStrategy);
    this.strategies.set('defensive', this.defensiveStrategy);
    this.strategies.set('balanced', this.meleeStrategy); // Default balanced to melee for now
  }
  
  /**
   * Start combat with specified options
   */
  async startCombat(bot: AnyBot, options: CombatOptions = {}): Promise<boolean> {
    const botId = this.getBotId(bot);
    
    try {
      // Stop any existing combat
      this.stopCombat(bot);
      
      // Assess threats to find target
      const threats = this.assessThreats(bot, options.maxRange);
      if (threats.length === 0) {
        this.emitCombatEvent('combat_end', { botId, reason: 'No threats found' });
        return false;
      }
      
      // Find target based on options
      const target = this.selectTarget(threats, options);
      if (!target) {
        this.emitCombatEvent('combat_end', { botId, reason: 'No suitable target found' });
        return false;
      }
      
      // Select combat strategy
      const strategy = this.selectStrategy(bot, target, options);
      if (!strategy) {
        this.emitCombatEvent('combat_end', { botId, reason: 'No suitable strategy found' });
        return false;
      }
      
      // Create combat session
      const session: CombatSession = {
        bot,
        target,
        strategy,
        startTime: new Date(),
        options: { ...options }, // Copy options to prevent mutations
        isActive: true,
        killCount: 0
      };
      
      this.activeSessions.set(botId, session);
      
      // Emit combat start event
      this.emitCombatEvent('combat_start', { 
        botId, 
        targetType: target.type, 
        targetName: target.entity.name || target.entity.displayName,
        strategy: strategy.name 
      });
      
      // Execute combat strategy
      const result = await this.executeCombat(bot, session);
      
      // Clean up session
      this.activeSessions.delete(botId);
      
      return result;
      
    } catch (error) {
      console.error('[CombatService] Error starting combat:', error);
      this.stopCombat(bot);
      return false;
    }
  }
  
  /**
   * Stop all combat operations immediately
   */
  stopCombat(bot: AnyBot): void {
    const botId = this.getBotId(bot);
    const session = this.activeSessions.get(botId);
    
    if (session) {
      session.isActive = false;
      
      // Cleanup strategy
      if (session.strategy) {
        session.strategy.cleanup(bot);
      }
      
      // Stop PvP if active
      try {
        const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
        if ('pvp' in botInstance && botInstance.pvp) {
          (botInstance.pvp as any).forceStop?.();
        }
      } catch (error) {
        console.error('[CombatService] Error stopping PvP:', error);
      }
      
      this.activeSessions.delete(botId);
      
      this.emitCombatEvent('combat_end', { 
        botId, 
        duration: Date.now() - session.startTime.getTime(),
        kills: session.killCount 
      });
    }
  }
  
  /**
   * Attack a specific target
   */
  async attackTarget(bot: AnyBot, target: Entity, options: CombatOptions = {}): Promise<boolean> {
    // Create combat target from entity
    const botPosition = this.getBotPosition(bot);
    const combatTarget: CombatTarget = {
      entity: target,
      priority: 100, // High priority for specific target
      threat: this.threatAssessment.calculateThreatLevel(target, botPosition, this.getBotHealth(bot)),
      distance: botPosition.distanceTo(target.position),
      healthPercent: this.getEntityHealth(target),
      type: this.getEntityType(target),
      lastPosition: target.position.clone(),
      lastSeen: new Date()
    };
    
    // Start combat with this specific target
    const modifiedOptions: CombatOptions = {
      ...options,
      targetName: target.name || target.displayName || undefined,
      killCount: 1
    };
    
    return this.startCombat(bot, modifiedOptions);
  }
  
  /**
   * Defend against attackers (reactive combat)
   */
  async defend(bot: AnyBot, options: CombatOptions = {}): Promise<boolean> {
    const defensiveOptions: CombatOptions = {
      ...options,
      strategy: 'defensive',
      retreatOnLowHealth: true,
      minHealth: options.minHealth || 30
    };
    
    return this.startCombat(bot, defensiveOptions);
  }
  
  /**
   * Perform evasive maneuvers to avoid damage
   */
  async dodge(bot: AnyBot, threat: Vec3): Promise<boolean> {
    try {
      const botPos = this.getBotPosition(bot);
      
      // Calculate dodge direction (perpendicular to threat direction)
      const threatDirection = threat.minus(botPos).normalize();
      const dodgeDirection = threatDirection.cross(new Vec3(0, 1, 0)).normalize();
      
      // Choose random dodge direction
      const dodgeMultiplier = Math.random() > 0.5 ? 1 : -1;
      const dodgeTarget = botPos.plus(dodgeDirection.scaled(4 * dodgeMultiplier));
      
      // Execute dodge movement
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        await Promise.race([
          (botInstance as any).pathfinder.goto(dodgeTarget),
          this.sleep(1000) // Quick dodge timeout
        ]);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[CombatService] Error performing dodge:', error);
      return false;
    }
  }
  
  /**
   * Assess all threats in the area and prioritize targets
   */
  assessThreats(bot: AnyBot, maxRange: number = 32): CombatTarget[] {
    const botId = this.getBotId(bot);
    const now = new Date();
    
    // Throttle threat assessment to avoid excessive computation
    const lastAssessment = this.lastThreatAssessment.get(botId);
    if (lastAssessment && now.getTime() - lastAssessment.getTime() < 1000) {
      return []; // Return empty if assessed too recently
    }
    
    this.lastThreatAssessment.set(botId, now);
    return this.threatAssessment.assessThreats(bot, maxRange);
  }
  
  /**
   * Get the current combat state for a bot
   */
  getCombatState(bot: AnyBot): CombatState {
    const botId = this.getBotId(bot);
    const session = this.activeSessions.get(botId);
    const botHealth = this.getBotHealth(bot);
    const botFood = this.getBotFood(bot);
    
    const state: CombatState = {
      inCombat: !!session?.isActive,
      currentTarget: session?.target || null,
      potentialTargets: this.assessThreats(bot),
      health: botHealth,
      food: botFood,
      weapon: this.getCurrentWeapon(bot),
      strategy: session?.strategy?.name || 'none',
      combatStartTime: session?.startTime || null,
      kills: session?.killCount || 0,
      lastDamageTaken: null // Would need to track this via events
    };
    
    return state;
  }
  
  /**
   * Update combat strategy for ongoing combat
   */
  updateStrategy(bot: AnyBot, strategy: 'aggressive' | 'defensive' | 'balanced' | 'ranged'): void {
    const botId = this.getBotId(bot);
    const session = this.activeSessions.get(botId);
    
    if (session && session.isActive) {
      const newStrategy = this.strategies.get(strategy);
      if (newStrategy) {
        // Cleanup old strategy
        if (session.strategy) {
          session.strategy.cleanup(bot);
        }
        
        // Update to new strategy
        session.strategy = newStrategy;
        session.options.strategy = strategy;
        
        console.log(`[CombatService] Updated strategy to ${strategy} for bot ${botId}`);
      }
    }
  }
  
  /**
   * Get optimal weapon for current situation
   */
  selectOptimalWeapon(bot: AnyBot, targetType?: string): WeaponInfo | null {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const items = (botInstance as any).inventory?.items?.() || [];
      
      let bestWeapon: WeaponInfo | null = null;
      let bestScore = 0;
      
      for (const item of items) {
        const weaponInfo = this.WEAPON_INFO[item.name];
        if (weaponInfo) {
          let score = weaponInfo.damage;
          
          // Bonus for better materials
          switch (weaponInfo.material) {
            case 'netherite': score += 10; break;
            case 'diamond': score += 8; break;
            case 'iron': score += 4; break;
            case 'stone': score += 2; break;
            case 'wood': score += 1; break;
          }
          
          // Consider target type
          if (targetType === 'creeper' && weaponInfo.type === 'bow') {
            score += 15; // Prefer ranged against creepers
          } else if (targetType === 'skeleton' && weaponInfo.type === 'sword') {
            score += 10; // Prefer melee against skeletons
          }
          
          if (score > bestScore) {
            bestScore = score;
            bestWeapon = weaponInfo;
          }
        }
      }
      
      return bestWeapon;
    } catch (error) {
      console.error('[CombatService] Error selecting optimal weapon:', error);
      return null;
    }
  }
  
  /**
   * Equip the best available weapon
   */
  async equipWeapon(bot: AnyBot, weaponType?: string): Promise<boolean> {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const items = (botInstance as any).inventory?.items?.() || [];
      
      let weaponToEquip: any = null;
      
      if (weaponType) {
        // Look for specific weapon type
        weaponToEquip = items.find((item: any) => 
          item.name.includes(weaponType) && this.WEAPON_INFO[item.name]
        );
      } else {
        // Find best available weapon
        const optimalWeapon = this.selectOptimalWeapon(bot);
        if (optimalWeapon) {
          weaponToEquip = items.find((item: any) => item.name === optimalWeapon.name);
        }
      }
      
      if (weaponToEquip && 'equip' in botInstance) {
        await (botInstance as any).equip(weaponToEquip, 'hand');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[CombatService] Error equipping weapon:', error);
      return false;
    }
  }
  
  /**
   * Check if bot should retreat based on health/situation
   */
  shouldRetreat(bot: AnyBot, options: CombatOptions = {}): boolean {
    const botHealth = this.getBotHealth(bot);
    const minHealth = options.minHealth || 20;
    
    // Retreat if health is too low
    if (botHealth <= minHealth) {
      return true;
    }
    
    // Retreat if explicitly disabled retreat
    if (options.retreatOnLowHealth === false) {
      return false;
    }
    
    // Retreat if outnumbered significantly
    const nearbyThreats = this.assessThreats(bot, 16);
    if (nearbyThreats.length > 3 && botHealth < 50) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Execute retreat maneuvers
   */
  async retreat(bot: AnyBot, safeDistance: number = 20): Promise<boolean> {
    try {
      this.stopCombat(bot); // Stop current combat
      
      const botPos = this.getBotPosition(bot);
      const threats = this.assessThreats(bot, 32);
      
      if (threats.length === 0) {
        return true; // Already safe
      }
      
      // Find direction away from all threats
      let retreatDirection = new Vec3(0, 0, 0);
      for (const threat of threats) {
        const threatDirection = threat.entity.position.minus(botPos).normalize();
        retreatDirection = retreatDirection.minus(threatDirection);
      }
      
      retreatDirection = retreatDirection.normalize();
      const retreatTarget = botPos.plus(retreatDirection.scaled(safeDistance));
      
      this.emitCombatEvent('health_low', { botId: this.getBotId(bot), health: this.getBotHealth(bot) });
      
      // Execute retreat
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      if ('pathfinder' in botInstance && (botInstance as any).pathfinder?.goto) {
        await (botInstance as any).pathfinder.goto(retreatTarget);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[CombatService] Error during retreat:', error);
      return false;
    }
  }
  
  /**
   * Register event handler for combat events
   */
  onCombatEvent(event: CombatEvent['type'], handler: (data: CombatEvent) => void): void {
    this.on(event, handler);
  }
  
  /**
   * Remove event handler
   */
  offCombatEvent(event: CombatEvent['type'], handler: (data: CombatEvent) => void): void {
    this.off(event, handler);
  }
  
  /**
   * Get combat statistics for a bot
   */
  getCombatStats(bot: AnyBot): {
    totalKills: number;
    totalDeaths: number;
    totalDamageDealt: number;
    totalDamageTaken: number;
    combatTime: number;
    averageCombatDuration: number;
    winRate: number;
  } {
    const botId = this.getBotId(bot);
    const stats = this.combatStats.get(botId) || this.createDefaultStats();
    
    return {
      totalKills: stats.totalKills,
      totalDeaths: stats.totalDeaths,
      totalDamageDealt: stats.totalDamageDealt,
      totalDamageTaken: stats.totalDamageTaken,
      combatTime: stats.combatTime,
      averageCombatDuration: stats.combatSessions > 0 ? stats.combatTime / stats.combatSessions : 0,
      winRate: stats.combatSessions > 0 ? (stats.totalKills / stats.combatSessions) * 100 : 0
    };
  }
  
  /**
   * Reset combat statistics
   */
  resetCombatStats(bot: AnyBot): void {
    const botId = this.getBotId(bot);
    this.combatStats.set(botId, this.createDefaultStats());
  }
  
  // Private helper methods
  
  /**
   * Execute combat with the given session
   */
  private async executeCombat(bot: AnyBot, session: CombatSession): Promise<boolean> {
    if (!session.strategy || !session.target) {
      return false;
    }
    
    try {
      // Execute the strategy
      const result = await session.strategy.execute(bot, session.target, session.options);
      
      // Update stats
      this.updateCombatStats(bot, session);
      
      return result;
    } catch (error) {
      console.error('[CombatService] Error executing combat:', error);
      return false;
    }
  }
  
  /**
   * Select target from threats based on options
   */
  private selectTarget(threats: CombatTarget[], options: CombatOptions): CombatTarget | null {
    if (threats.length === 0) return null;
    
    // Filter by target type if specified
    let filteredThreats = threats;
    if (options.targetType) {
      filteredThreats = threats.filter(threat => threat.type === options.targetType);
    }
    
    // Filter by target name if specified
    if (options.targetName) {
      const nameFiltered = filteredThreats.filter(threat => 
        threat.entity.name?.toLowerCase().includes(options.targetName!.toLowerCase()) ||
        threat.entity.displayName?.toLowerCase().includes(options.targetName!.toLowerCase())
      );
      if (nameFiltered.length > 0) {
        filteredThreats = nameFiltered;
      }
    }
    
    // Return highest priority target
    return filteredThreats.length > 0 ? filteredThreats[0] : null;
  }
  
  /**
   * Select best combat strategy for the situation
   */
  private selectStrategy(bot: AnyBot, target: CombatTarget, options: CombatOptions): ICombatStrategy | null {
    // Use explicitly requested strategy
    if (options.strategy && this.strategies.has(options.strategy)) {
      return this.strategies.get(options.strategy)!;
    }
    
    // Evaluate all strategies and pick the best one
    let bestStrategy: ICombatStrategy | null = null;
    let bestSuitability = 0;
    
    for (const [name, strategy] of this.strategies) {
      const suitability = strategy.getSuitability(bot, target, options);
      if (suitability > bestSuitability) {
        bestSuitability = suitability;
        bestStrategy = strategy;
      }
    }
    
    return bestStrategy;
  }
  
  /**
   * Update combat statistics
   */
  private updateCombatStats(bot: AnyBot, session: CombatSession): void {
    const botId = this.getBotId(bot);
    const stats = this.combatStats.get(botId) || this.createDefaultStats();
    
    const duration = Date.now() - session.startTime.getTime();
    stats.combatTime += duration;
    stats.combatSessions += 1;
    stats.totalKills += session.killCount;
    stats.lastCombatEnd = new Date();
    
    this.combatStats.set(botId, stats);
  }
  
  /**
   * Create default combat stats
   */
  private createDefaultStats(): CombatStats {
    return {
      totalKills: 0,
      totalDeaths: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      combatTime: 0,
      combatSessions: 0,
      lastCombatEnd: new Date()
    };
  }
  
  /**
   * Emit combat event
   */
  private emitCombatEvent(type: CombatEvent['type'], data: any): void {
    const event: CombatEvent = {
      type,
      timestamp: new Date(),
      data
    };
    
    this.emit(type, event);
  }
  
  /**
   * Get unique bot identifier
   */
  private getBotId(bot: AnyBot): string {
    if (isUnifiedBot(bot)) {
      return bot._bot.username || `bot-${bot._bot.entity?.id || 'unknown'}`;
    }
    return bot.username || `bot-${(bot as any).entity?.id || 'unknown'}`;
  }
  
  /**
   * Get bot position
   */
  private getBotPosition(bot: AnyBot): Vec3 {
    if (isUnifiedBot(bot)) {
      return bot._bot.entity.position;
    }
    return (bot as any).entity.position;
  }
  
  /**
   * Get bot health percentage
   */
  private getBotHealth(bot: AnyBot): number {
    try {
      const health = isUnifiedBot(bot) ? bot._bot.health : (bot as any).health;
      const healthValue = typeof health === 'number' ? health : 20;
      return Math.round((healthValue / 20) * 100);
    } catch {
      return 100;
    }
  }
  
  /**
   * Get bot food level
   */
  private getBotFood(bot: AnyBot): number {
    try {
      const food = isUnifiedBot(bot) ? (bot._bot as any).food : (bot as any).food;
      return food || 20;
    } catch {
      return 20;
    }
  }
  
  /**
   * Get currently equipped weapon name
   */
  private getCurrentWeapon(bot: AnyBot): string | null {
    try {
      const botInstance = isUnifiedBot(bot) ? bot._bot : bot;
      const heldItem = (botInstance as any).heldItem;
      return heldItem?.name || null;
    } catch {
      return null;
    }
  }
  
  /**
   * Get entity health percentage
   */
  private getEntityHealth(entity: Entity): number {
    try {
      const metadata = entity.metadata;
      if (metadata) {
        for (let i = 6; i <= 9; i++) {
          if (metadata[i] && typeof metadata[i] === 'number') {
            return Math.round((Number(metadata[i]) / 20) * 100);
          }
        }
      }
      return 100;
    } catch {
      return 100;
    }
  }
  
  /**
   * Get entity type
   */
  private getEntityType(entity: Entity): string {
    if (entity.type === 'player') return 'player';
    
    const name = entity.name?.toLowerCase() || entity.displayName?.toLowerCase() || 'unknown';
    
    const hostileMobs = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch'];
    if (hostileMobs.some(mob => name.includes(mob))) return 'hostile';
    
    const passiveMobs = ['cow', 'pig', 'sheep', 'chicken', 'rabbit', 'villager'];
    if (passiveMobs.some(mob => name.includes(mob))) return 'passive';
    
    return 'neutral';
  }
  
  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}