import { Vec3 } from 'vec3';
import { UnifiedBot } from '../../bots/UnifiedBot.js';

/**
 * Movement state for tracking bot's current movement status
 */
export interface MovementState {
  /** Whether the bot is currently moving */
  isMoving: boolean;
  /** Current target position if moving */
  target?: Vec3;
  /** Movement start time */
  startTime?: number;
  /** Movement type currently active */
  movementType?: MovementType;
  /** Whether the bot is sprinting */
  isSprinting: boolean;
  /** Whether the bot is sneaking */
  isSneaking: boolean;
  /** Whether the bot is jumping */
  isJumping: boolean;
  /** Whether the bot is swimming */
  isSwimming: boolean;
  /** Whether the bot is flying (creative/spectator mode) */
  isFlying: boolean;
}

/**
 * Types of movement operations
 */
export enum MovementType {
  WALK = 'walk',
  RUN = 'run',
  SPRINT = 'sprint',
  SNEAK = 'sneak',
  JUMP = 'jump',
  SWIM = 'swim',
  FLY = 'fly',
  STOP = 'stop'
}

/**
 * Options for movement operations
 */
export interface MovementOptions {
  /** Movement speed modifier (0.1 to 2.0) */
  speed?: number;
  /** Whether to sprint during movement */
  sprint?: boolean;
  /** Whether to sneak during movement */
  sneak?: boolean;
  /** Whether jumping is allowed */
  allowJump?: boolean;
  /** Maximum time to spend on movement (milliseconds) */
  timeout?: number;
  /** Tolerance distance for reaching target */
  tolerance?: number;
  /** Whether to avoid obstacles */
  avoidObstacles?: boolean;
  /** Whether to smooth movement path */
  smoothPath?: boolean;
  /** Whether to validate movement before execution */
  validateMovement?: boolean;
}

/**
 * Result of a movement operation
 */
export interface MovementResult {
  /** Whether the movement was successful */
  success: boolean;
  /** Final position reached */
  finalPosition: Vec3;
  /** Distance traveled */
  distanceTraveled: number;
  /** Time taken in milliseconds */
  timeTaken: number;
  /** Reason for failure if unsuccessful */
  error?: string;
  /** Whether movement was interrupted */
  interrupted?: boolean;
}

/**
 * Movement validation result
 */
export interface MovementValidation {
  /** Whether movement is possible */
  canMove: boolean;
  /** Reasons why movement might fail */
  warnings: string[];
  /** Critical issues preventing movement */
  errors: string[];
  /** Suggested alternative if direct movement fails */
  alternative?: Vec3;
}

/**
 * Obstacle information
 */
export interface Obstacle {
  /** Position of the obstacle */
  position: Vec3;
  /** Type of obstacle */
  type: 'block' | 'entity' | 'liquid' | 'void' | 'boundary';
  /** Block name or entity type */
  name: string;
  /** Whether the obstacle can be bypassed */
  bypassable: boolean;
  /** Severity level (0-10, higher is worse) */
  severity: number;
}

/**
 * Movement interpolation for smooth movement
 */
export interface MovementInterpolation {
  /** Starting position */
  from: Vec3;
  /** Target position */
  to: Vec3;
  /** Current progress (0-1) */
  progress: number;
  /** Duration of interpolation in milliseconds */
  duration: number;
  /** Easing function type */
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/**
 * Service interface for movement operations
 * Provides edition-agnostic movement capabilities with smooth interpolation and obstacle handling
 */
export interface IMovementService {
  /**
   * Move the bot to a specific position
   * @param bot The bot instance
   * @param target Target position
   * @param options Movement options
   * @returns Promise resolving to movement result
   */
  moveTo(bot: UnifiedBot, target: Vec3, options?: MovementOptions): Promise<MovementResult>;

  /**
   * Make the bot jump
   * @param bot The bot instance
   * @param height Optional jump height modifier
   * @returns Promise resolving to movement result
   */
  jump(bot: UnifiedBot, height?: number): Promise<MovementResult>;

  /**
   * Make the bot start or stop sprinting
   * @param bot The bot instance
   * @param sprint Whether to sprint or stop sprinting
   * @returns Promise resolving to success
   */
  sprint(bot: UnifiedBot, sprint: boolean): Promise<boolean>;

  /**
   * Make the bot start or stop sneaking
   * @param bot The bot instance
   * @param sneak Whether to sneak or stop sneaking
   * @returns Promise resolving to success
   */
  sneak(bot: UnifiedBot, sneak: boolean): Promise<boolean>;

  /**
   * Make the bot swim to a position (water/lava movement)
   * @param bot The bot instance
   * @param target Target position
   * @param options Movement options
   * @returns Promise resolving to movement result
   */
  swim(bot: UnifiedBot, target: Vec3, options?: MovementOptions): Promise<MovementResult>;

  /**
   * Make the bot fly to a position (creative/spectator mode)
   * @param bot The bot instance
   * @param target Target position
   * @param options Movement options
   * @returns Promise resolving to movement result
   */
  fly(bot: UnifiedBot, target: Vec3, options?: MovementOptions): Promise<MovementResult>;

  /**
   * Stop all movement immediately
   * @param bot The bot instance
   * @returns Promise resolving to success
   */
  stop(bot: UnifiedBot): Promise<boolean>;

  /**
   * Get the current movement state
   * @param bot The bot instance
   * @returns Current movement state
   */
  getMovementState(bot: UnifiedBot): MovementState;

  /**
   * Validate if movement to a position is possible
   * @param bot The bot instance
   * @param target Target position
   * @param options Movement options
   * @returns Movement validation result
   */
  validateMovement(bot: UnifiedBot, target: Vec3, options?: MovementOptions): Promise<MovementValidation>;

  /**
   * Detect obstacles between current position and target
   * @param bot The bot instance
   * @param target Target position
   * @param options Movement options
   * @returns Array of detected obstacles
   */
  detectObstacles(bot: UnifiedBot, target: Vec3, options?: MovementOptions): Promise<Obstacle[]>;

  /**
   * Find a safe position near the target if direct movement fails
   * @param bot The bot instance
   * @param target Original target position
   * @param radius Search radius for alternatives
   * @returns Alternative safe position or null
   */
  findAlternativePosition(bot: UnifiedBot, target: Vec3, radius: number): Promise<Vec3 | null>;

  /**
   * Smoothly interpolate movement between two positions
   * @param bot The bot instance
   * @param from Starting position
   * @param to Target position
   * @param duration Duration in milliseconds
   * @param easing Easing function type
   * @returns Promise resolving to movement result
   */
  smoothMove(
    bot: UnifiedBot,
    from: Vec3,
    to: Vec3,
    duration: number,
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  ): Promise<MovementResult>;

  /**
   * Move the bot along a predefined path with smooth transitions
   * @param bot The bot instance
   * @param path Array of positions to follow
   * @param options Movement options
   * @returns Promise resolving to movement result
   */
  followPath(bot: UnifiedBot, path: Vec3[], options?: MovementOptions): Promise<MovementResult>;

  /**
   * Emergency stop - immediately halt all movement and reset state
   * @param bot The bot instance
   * @returns Promise resolving to success
   */
  emergencyStop(bot: UnifiedBot): Promise<boolean>;

  /**
   * Check if the bot can physically reach a position
   * @param bot The bot instance
   * @param target Target position
   * @param options Movement constraints
   * @returns Whether position is reachable
   */
  canReach(bot: UnifiedBot, target: Vec3, options?: MovementOptions): Promise<boolean>;

  /**
   * Calculate the optimal movement speed for terrain
   * @param bot The bot instance
   * @param target Target position
   * @param terrain Terrain type or difficulty
   * @returns Optimal speed multiplier
   */
  calculateOptimalSpeed(bot: UnifiedBot, target: Vec3, terrain?: string): number;

  /**
   * Recover from stuck or error states
   * @param bot The bot instance
   * @param maxAttempts Maximum recovery attempts
   * @returns Promise resolving to success
   */
  recoverFromStuck(bot: UnifiedBot, maxAttempts?: number): Promise<boolean>;
}