import { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';
import { AnyBot } from '../../types.js';

/**
 * Combat target with priority and threat assessment
 */
export interface CombatTarget {
  /** The entity to target */
  entity: Entity;
  /** Priority level (0-100, higher = more important) */
  priority: number;
  /** Threat level (0-100, higher = more dangerous) */
  threat: number;
  /** Distance to target */
  distance: number;
  /** Target health percentage */
  healthPercent: number;
  /** Target type (player, hostile, animal, etc.) */
  type: string;
  /** Last known position */
  lastPosition: Vec3;
  /** Time when target was last seen */
  lastSeen: Date;
}

/**
 * Combat state information
 */
export interface CombatState {
  /** Whether bot is currently in combat */
  inCombat: boolean;
  /** Current primary target */
  currentTarget: CombatTarget | null;
  /** List of all potential targets */
  potentialTargets: CombatTarget[];
  /** Bot's current health percentage */
  health: number;
  /** Bot's current food level */
  food: number;
  /** Currently equipped weapon */
  weapon: string | null;
  /** Combat strategy being used */
  strategy: string;
  /** Time combat started */
  combatStartTime: Date | null;
  /** Number of kills in current session */
  kills: number;
  /** Last damage taken time */
  lastDamageTaken: Date | null;
}

/**
 * Combat options for different scenarios
 */
export interface CombatOptions {
  /** Target type preference (player, mob, animal) */
  targetType?: 'player' | 'mob' | 'animal';
  /** Specific target name/type */
  targetName?: string;
  /** Maximum combat duration in seconds */
  duration?: number;
  /** Number of targets to eliminate */
  killCount?: number;
  /** Combat strategy to use */
  strategy?: 'aggressive' | 'defensive' | 'balanced' | 'ranged';
  /** Maximum engagement range */
  maxRange?: number;
  /** Minimum health to maintain combat */
  minHealth?: number;
  /** Whether to auto-equip weapons */
  autoEquipWeapon?: boolean;
  /** Whether to collect loot after kills */
  collectLoot?: boolean;
  /** Whether to retreat when low on health */
  retreatOnLowHealth?: boolean;
}

/**
 * Combat event data
 */
export interface CombatEvent {
  type: 'combat_start' | 'combat_end' | 'target_acquired' | 'target_killed' | 'damage_taken' | 'health_low';
  timestamp: Date;
  data: any;
}

/**
 * Weapon information
 */
export interface WeaponInfo {
  name: string;
  damage: number;
  durability: number;
  range: number;
  type: 'sword' | 'axe' | 'bow' | 'crossbow' | 'trident';
  material: 'wood' | 'stone' | 'iron' | 'diamond' | 'netherite' | 'other';
}

/**
 * Combat service interface for managing bot combat operations
 * Provides edition-agnostic combat capabilities with threat assessment and strategic combat
 */
export interface ICombatService {
  /**
   * Start combat with specified options
   * @param bot The bot to control
   * @param options Combat configuration
   * @returns Promise that resolves when combat ends or fails
   */
  startCombat(bot: AnyBot, options: CombatOptions): Promise<boolean>;

  /**
   * Stop all combat operations immediately
   * @param bot The bot to stop combat for
   */
  stopCombat(bot: AnyBot): void;

  /**
   * Attack a specific target
   * @param bot The bot to control
   * @param target The target to attack
   * @param options Combat options
   * @returns Promise that resolves when attack completes
   */
  attackTarget(bot: AnyBot, target: Entity, options?: CombatOptions): Promise<boolean>;

  /**
   * Defend against attackers (reactive combat)
   * @param bot The bot to control
   * @param options Defensive options
   * @returns Promise that resolves when defense ends
   */
  defend(bot: AnyBot, options?: CombatOptions): Promise<boolean>;

  /**
   * Perform evasive maneuvers to avoid damage
   * @param bot The bot to control
   * @param threat The threat to dodge
   * @returns Promise that resolves when dodge completes
   */
  dodge(bot: AnyBot, threat: Vec3): Promise<boolean>;

  /**
   * Assess all threats in the area and prioritize targets
   * @param bot The bot to assess threats for
   * @param maxRange Maximum range to scan for threats
   * @returns Array of combat targets sorted by priority
   */
  assessThreats(bot: AnyBot, maxRange?: number): CombatTarget[];

  /**
   * Get the current combat state for a bot
   * @param bot The bot to get state for
   * @returns Current combat state
   */
  getCombatState(bot: AnyBot): CombatState;

  /**
   * Update combat strategy for ongoing combat
   * @param bot The bot to update strategy for
   * @param strategy New strategy to use
   */
  updateStrategy(bot: AnyBot, strategy: 'aggressive' | 'defensive' | 'balanced' | 'ranged'): void;

  /**
   * Get optimal weapon for current situation
   * @param bot The bot to select weapon for
   * @param targetType Type of target being engaged
   * @returns Best available weapon info
   */
  selectOptimalWeapon(bot: AnyBot, targetType?: string): WeaponInfo | null;

  /**
   * Equip the best available weapon
   * @param bot The bot to equip weapon for
   * @param weaponType Preferred weapon type
   * @returns Whether weapon was successfully equipped
   */
  equipWeapon(bot: AnyBot, weaponType?: string): Promise<boolean>;

  /**
   * Check if bot should retreat based on health/situation
   * @param bot The bot to evaluate
   * @param options Combat options with retreat thresholds
   * @returns Whether bot should retreat
   */
  shouldRetreat(bot: AnyBot, options?: CombatOptions): boolean;

  /**
   * Execute retreat maneuvers
   * @param bot The bot to retreat
   * @param safeDistance Distance to retreat
   * @returns Promise that resolves when retreat completes
   */
  retreat(bot: AnyBot, safeDistance?: number): Promise<boolean>;

  /**
   * Register event handler for combat events
   * @param event Event type to listen for
   * @param handler Function to call when event occurs
   */
  onCombatEvent(event: CombatEvent['type'], handler: (data: CombatEvent) => void): void;

  /**
   * Remove event handler
   * @param event Event type
   * @param handler Handler function to remove
   */
  offCombatEvent(event: CombatEvent['type'], handler: (data: CombatEvent) => void): void;

  /**
   * Get combat statistics for a bot
   * @param bot The bot to get stats for
   * @returns Combat statistics
   */
  getCombatStats(bot: AnyBot): {
    totalKills: number;
    totalDeaths: number;
    totalDamageDealt: number;
    totalDamageTaken: number;
    combatTime: number;
    averageCombatDuration: number;
    winRate: number;
  };

  /**
   * Reset combat statistics
   * @param bot The bot to reset stats for
   */
  resetCombatStats(bot: AnyBot): void;
}