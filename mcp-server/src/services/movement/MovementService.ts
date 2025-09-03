import { injectable, inject, singleton } from 'tsyringe';
import { Vec3 } from 'vec3';
import { UnifiedBot } from '../../bots/UnifiedBot.js';
import { IPathfindingService } from '../pathfinding/IPathfindingService.js';
import { BlockRegistry } from '../BlockRegistry.js';
import { TOKENS } from '../../config/tokens.js';
import {
  IMovementService,
  MovementState,
  MovementType,
  MovementOptions,
  MovementResult,
  MovementValidation,
  Obstacle,
  MovementInterpolation
} from './IMovementService.js';

/**
 * Movement service implementation providing edition-agnostic movement capabilities
 */
@injectable()
@singleton()
export class MovementService implements IMovementService {
  private readonly movementStates = new Map<string, MovementState>();
  private readonly activeInterpolations = new Map<string, MovementInterpolation>();

  constructor(
    @inject(TOKENS.PathfindingService) private readonly pathfindingService: IPathfindingService,
    @inject(TOKENS.BlockRegistry) private readonly blockRegistry: BlockRegistry
  ) {}

  /**
   * Move the bot to a specific position
   */
  async moveTo(bot: UnifiedBot, target: Vec3, options: MovementOptions = {}): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = this.getPosition(bot);
    
    try {
      // Set default options
      const opts: Required<MovementOptions> = {
        speed: options.speed ?? 1.0,
        sprint: options.sprint ?? false,
        sneak: options.sneak ?? false,
        allowJump: options.allowJump ?? true,
        timeout: options.timeout ?? 30000,
        tolerance: options.tolerance ?? 1.0,
        avoidObstacles: options.avoidObstacles ?? true,
        smoothPath: options.smoothPath ?? true,
        validateMovement: options.validateMovement ?? true
      };

      // Update movement state
      this.updateMovementState(bot, {
        isMoving: true,
        target: target,
        startTime: startTime,
        movementType: opts.sprint ? MovementType.SPRINT : opts.sneak ? MovementType.SNEAK : MovementType.WALK,
        isSprinting: opts.sprint,
        isSneaking: opts.sneak,
        isJumping: false,
        isSwimming: this.isInWater(bot),
        isFlying: false
      });

      // Validate movement if requested
      if (opts.validateMovement) {
        const validation = await this.validateMovement(bot, target, options);
        if (!validation.canMove) {
          return this.createFailureResult(startPosition, startTime, validation.errors.join(', '));
        }
      }

      // Choose movement strategy based on bot edition
      let result: MovementResult;
      if (bot.edition === 'java') {
        result = await this.moveJavaBot(bot, target, opts);
      } else {
        result = await this.moveBedrockBot(bot, target, opts);
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(startPosition, startTime, errorMessage);
    } finally {
      // Clear movement state
      this.updateMovementState(bot, {
        isMoving: false,
        target: undefined,
        startTime: undefined,
        movementType: undefined,
        isSprinting: false,
        isSneaking: false,
        isJumping: false,
        isSwimming: false,
        isFlying: false
      });
    }
  }

  /**
   * Make the bot jump
   */
  async jump(bot: UnifiedBot, height?: number): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = this.getPosition(bot);

    try {
      this.updateMovementState(bot, {
        ...this.getMovementState(bot),
        isJumping: true
      });

      if (bot.edition === 'java') {
        await this.jumpJavaBot(bot, height);
      } else {
        await this.jumpBedrockBot(bot, height);
      }

      const finalPosition = this.getPosition(bot);
      return {
        success: true,
        finalPosition,
        distanceTraveled: startPosition.distanceTo(finalPosition),
        timeTaken: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(startPosition, startTime, errorMessage);
    } finally {
      this.updateMovementState(bot, {
        ...this.getMovementState(bot),
        isJumping: false
      });
    }
  }

  /**
   * Make the bot start or stop sprinting
   */
  async sprint(bot: UnifiedBot, sprint: boolean): Promise<boolean> {
    try {
      this.updateMovementState(bot, {
        ...this.getMovementState(bot),
        isSprinting: sprint
      });

      if (bot.edition === 'java') {
        return await this.sprintJavaBot(bot, sprint);
      } else {
        return await this.sprintBedrockBot(bot, sprint);
      }
    } catch (error) {
      console.error(`[MovementService] Sprint failed: ${error}`);
      return false;
    }
  }

  /**
   * Make the bot start or stop sneaking
   */
  async sneak(bot: UnifiedBot, sneak: boolean): Promise<boolean> {
    try {
      this.updateMovementState(bot, {
        ...this.getMovementState(bot),
        isSneaking: sneak
      });

      if (bot.edition === 'java') {
        return await this.sneakJavaBot(bot, sneak);
      } else {
        return await this.sneakBedrockBot(bot, sneak);
      }
    } catch (error) {
      console.error(`[MovementService] Sneak failed: ${error}`);
      return false;
    }
  }

  /**
   * Make the bot swim to a position
   */
  async swim(bot: UnifiedBot, target: Vec3, options: MovementOptions = {}): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = this.getPosition(bot);

    try {
      this.updateMovementState(bot, {
        ...this.getMovementState(bot),
        isSwimming: true,
        target: target,
        startTime: startTime
      });

      // Swimming is similar to regular movement but with different constraints
      const swimOptions = {
        ...options,
        speed: (options.speed ?? 0.5) * 0.8, // Slower in water
        allowJump: false // Can't jump while swimming
      };

      return await this.moveTo(bot, target, swimOptions);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(startPosition, startTime, errorMessage);
    }
  }

  /**
   * Make the bot fly to a position
   */
  async fly(bot: UnifiedBot, target: Vec3, options: MovementOptions = {}): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = this.getPosition(bot);

    try {
      this.updateMovementState(bot, {
        ...this.getMovementState(bot),
        isFlying: true,
        target: target,
        startTime: startTime
      });

      // Flying allows 3D movement without pathfinding constraints
      if (bot.edition === 'java') {
        return await this.flyJavaBot(bot, target, options);
      } else {
        return await this.flyBedrockBot(bot, target, options);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(startPosition, startTime, errorMessage);
    }
  }

  /**
   * Stop all movement immediately
   */
  async stop(bot: UnifiedBot): Promise<boolean> {
    try {
      // Clear interpolations
      this.activeInterpolations.delete(bot.username);

      // Stop based on edition
      if (bot.edition === 'java') {
        await this.stopJavaBot(bot);
      } else {
        await this.stopBedrockBot(bot);
      }

      // Reset movement state
      this.updateMovementState(bot, {
        isMoving: false,
        target: undefined,
        startTime: undefined,
        movementType: undefined,
        isSprinting: false,
        isSneaking: false,
        isJumping: false,
        isSwimming: false,
        isFlying: false
      });

      return true;
    } catch (error) {
      console.error(`[MovementService] Stop failed: ${error}`);
      return false;
    }
  }

  /**
   * Get the current movement state
   */
  getMovementState(bot: UnifiedBot): MovementState {
    return this.movementStates.get(bot.username) || {
      isMoving: false,
      isSprinting: false,
      isSneaking: false,
      isJumping: false,
      isSwimming: false,
      isFlying: false
    };
  }

  /**
   * Validate if movement to a position is possible
   */
  async validateMovement(bot: UnifiedBot, target: Vec3, options: MovementOptions = {}): Promise<MovementValidation> {
    const warnings: string[] = [];
    const errors: string[] = [];
    let canMove = true;
    let alternative: Vec3 | undefined;

    try {
      const startPosition = this.getPosition(bot);
      const distance = startPosition.distanceTo(target);

      // Check distance limits
      if (distance > 1000) {
        warnings.push(`Target is very far (${Math.round(distance)} blocks)`);
      }

      if (distance < 0.1) {
        warnings.push('Target is very close to current position');
      }

      // Check for obstacles
      const obstacles = await this.detectObstacles(bot, target, options);
      const criticalObstacles = obstacles.filter(obs => obs.severity > 7);
      
      if (criticalObstacles.length > 0) {
        errors.push(`Critical obstacles detected: ${criticalObstacles.map(o => o.name).join(', ')}`);
        canMove = false;
        
        // Try to find alternative
        alternative = await this.findAlternativePosition(bot, target, 5);
        if (alternative) {
          warnings.push('Alternative position found');
          canMove = true;
        }
      }

      // Check terrain suitability
      const targetBlock = bot.blockAt?.(target);
      if (targetBlock && this.blockRegistry.isLiquid(targetBlock.type) && !options.allowJump) {
        if (bot.edition === 'java' && !this.isInWater(bot)) {
          warnings.push('Target is in water - consider using swim instead');
        }
      }

      // Check pathfinding capability
      if (bot.edition === 'java' && !bot.pathfinder) {
        errors.push('Java bot requires pathfinder plugin for complex navigation');
        canMove = false;
      }

      return {
        canMove,
        warnings,
        errors,
        alternative
      };

    } catch (error) {
      errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        canMove: false,
        warnings,
        errors
      };
    }
  }

  /**
   * Detect obstacles between current position and target
   */
  async detectObstacles(bot: UnifiedBot, target: Vec3, options: MovementOptions = {}): Promise<Obstacle[]> {
    const obstacles: Obstacle[] = [];
    const startPosition = this.getPosition(bot);

    try {
      // Calculate path points for obstacle detection
      const distance = startPosition.distanceTo(target);
      const steps = Math.ceil(distance * 2); // Check every 0.5 blocks
      
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const checkPos = new Vec3(
          startPosition.x + (target.x - startPosition.x) * progress,
          startPosition.y + (target.y - startPosition.y) * progress,
          startPosition.z + (target.z - startPosition.z) * progress
        );

        const block = bot.blockAt?.(checkPos);
        if (block) {
          const obstacle = this.analyzeBlockObstacle(block, checkPos);
          if (obstacle) {
            obstacles.push(obstacle);
          }
        }

        // Check for entities near this position
        const nearbyEntity = bot.nearestEntity?.((entity: any) => 
          entity.position && entity.position.distanceTo(checkPos) < 2
        );

        if (nearbyEntity) {
          obstacles.push({
            position: new Vec3(nearbyEntity.position.x, nearbyEntity.position.y, nearbyEntity.position.z),
            type: 'entity',
            name: nearbyEntity.type || nearbyEntity.username || 'unknown',
            bypassable: true,
            severity: 3
          });
        }
      }

      return obstacles;

    } catch (error) {
      console.error(`[MovementService] Obstacle detection failed: ${error}`);
      return obstacles;
    }
  }

  /**
   * Find a safe position near the target if direct movement fails
   */
  async findAlternativePosition(bot: UnifiedBot, target: Vec3, radius: number): Promise<Vec3 | null> {
    try {
      const searchRadius = Math.max(radius, 2);
      const candidates: Vec3[] = [];

      // Generate candidate positions in a spiral pattern
      for (let r = 1; r <= searchRadius; r++) {
        for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
          const candidate = new Vec3(
            target.x + Math.cos(angle) * r,
            target.y,
            target.z + Math.sin(angle) * r
          );

          // Check if this position is safe
          const validation = await this.validateMovement(bot, candidate, { validateMovement: false });
          if (validation.canMove) {
            candidates.push(candidate);
          }
        }

        if (candidates.length > 0) {
          // Return the closest safe position
          const startPosition = this.getPosition(bot);
          candidates.sort((a, b) => a.distanceTo(startPosition) - b.distanceTo(startPosition));
          return candidates[0];
        }
      }

      return null;

    } catch (error) {
      console.error(`[MovementService] Alternative position search failed: ${error}`);
      return null;
    }
  }

  /**
   * Smoothly interpolate movement between two positions
   */
  async smoothMove(
    bot: UnifiedBot,
    from: Vec3,
    to: Vec3,
    duration: number,
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' = 'ease-out'
  ): Promise<MovementResult> {
    const startTime = Date.now();
    
    try {
      const interpolation: MovementInterpolation = {
        from,
        to,
        progress: 0,
        duration,
        easing
      };

      this.activeInterpolations.set(bot.username, interpolation);

      const steps = Math.ceil(duration / 50); // 50ms intervals
      const stepDuration = duration / steps;

      for (let i = 1; i <= steps; i++) {
        if (!this.activeInterpolations.has(bot.username)) {
          // Movement was cancelled
          break;
        }

        const progress = i / steps;
        const easedProgress = this.applyEasing(progress, easing);
        
        const currentPos = new Vec3(
          from.x + (to.x - from.x) * easedProgress,
          from.y + (to.y - from.y) * easedProgress,
          from.z + (to.z - from.z) * easedProgress
        );

        // Move to interpolated position
        if (bot.edition === 'bedrock' && (bot as any).moveTo) {
          await (bot as any).moveTo(currentPos);
        }

        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }

      const finalPosition = this.getPosition(bot);
      return {
        success: true,
        finalPosition,
        distanceTraveled: from.distanceTo(finalPosition),
        timeTaken: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(from, startTime, errorMessage);
    } finally {
      this.activeInterpolations.delete(bot.username);
    }
  }

  /**
   * Move the bot along a predefined path with smooth transitions
   */
  async followPath(bot: UnifiedBot, path: Vec3[], options: MovementOptions = {}): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = path[0] || this.getPosition(bot);
    
    if (path.length === 0) {
      return this.createFailureResult(startPosition, startTime, 'Empty path provided');
    }

    try {
      let totalDistance = 0;
      let currentPos = this.getPosition(bot);

      for (let i = 0; i < path.length; i++) {
        const target = path[i];
        const result = await this.moveTo(bot, target, {
          ...options,
          smoothPath: true,
          tolerance: 0.5 // Tighter tolerance for path following
        });

        if (!result.success) {
          return result; // Return failure immediately
        }

        totalDistance += result.distanceTraveled;
        currentPos = result.finalPosition;

        // Brief pause between waypoints
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return {
        success: true,
        finalPosition: currentPos,
        distanceTraveled: totalDistance,
        timeTaken: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(startPosition, startTime, errorMessage);
    }
  }

  /**
   * Emergency stop - immediately halt all movement and reset state
   */
  async emergencyStop(bot: UnifiedBot): Promise<boolean> {
    try {
      console.warn(`[MovementService] Emergency stop triggered for ${bot.username}`);
      
      // Clear all active operations
      this.activeInterpolations.delete(bot.username);
      this.movementStates.delete(bot.username);

      // Force stop based on edition
      if (bot.edition === 'java') {
        const javaBot = bot as any;
        if (javaBot.pathfinder) {
          javaBot.pathfinder.stop();
        }
        if (javaBot._bot?.clearControlStates) {
          javaBot._bot.clearControlStates();
        }
      } else {
        // For Bedrock, there's no direct control state clearing
        // Just stop current movement
        await this.stop(bot);
      }

      return true;
    } catch (error) {
      console.error(`[MovementService] Emergency stop failed: ${error}`);
      return false;
    }
  }

  /**
   * Check if the bot can physically reach a position
   */
  async canReach(bot: UnifiedBot, target: Vec3, options: MovementOptions = {}): Promise<boolean> {
    try {
      const validation = await this.validateMovement(bot, target, options);
      if (!validation.canMove) {
        return false;
      }

      // For Java edition, use pathfinding service
      if (bot.edition === 'java' && this.pathfindingService) {
        const startPosition = this.getPosition(bot);
        const path = this.pathfindingService.calculatePath(
          startPosition,
          target,
          (pos) => bot.blockAt?.(pos) || { type: 0 },
          {
            maxDistance: 100,
            timeout: 5000,
            allowJump: options.allowJump ?? true
          }
        );
        
        return path !== null && path.length > 0;
      }

      // For Bedrock or when pathfinding is not available, use simple distance check
      const distance = this.getPosition(bot).distanceTo(target);
      return distance < 100; // Reasonable limit for direct movement

    } catch (error) {
      console.error(`[MovementService] Reachability check failed: ${error}`);
      return false;
    }
  }

  /**
   * Calculate the optimal movement speed for terrain
   */
  calculateOptimalSpeed(bot: UnifiedBot, target: Vec3, terrain?: string): number {
    const baseSpeed = 1.0;
    const currentPos = this.getPosition(bot);
    
    // Adjust speed based on terrain
    let speedMultiplier = baseSpeed;
    
    if (terrain) {
      switch (terrain.toLowerCase()) {
        case 'water':
        case 'lava':
          speedMultiplier *= 0.6;
          break;
        case 'ice':
          speedMultiplier *= 1.2;
          break;
        case 'soul_sand':
          speedMultiplier *= 0.4;
          break;
        case 'honey_block':
          speedMultiplier *= 0.3;
          break;
        default:
          speedMultiplier *= 1.0;
      }
    }

    // Adjust for elevation change
    const elevationChange = Math.abs(target.y - currentPos.y);
    if (elevationChange > 5) {
      speedMultiplier *= Math.max(0.5, 1.0 - elevationChange / 50);
    }

    return Math.max(0.1, Math.min(2.0, speedMultiplier));
  }

  /**
   * Recover from stuck or error states
   */
  async recoverFromStuck(bot: UnifiedBot, maxAttempts: number = 3): Promise<boolean> {
    try {
      const originalPosition = this.getPosition(bot);
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.warn(`[MovementService] Recovery attempt ${attempt}/${maxAttempts} for ${bot.username}`);
        
        // First, try emergency stop
        await this.emergencyStop(bot);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try simple movements to unstuck
        const recoveryMoves = [
          new Vec3(0, 1, 0),    // Jump up
          new Vec3(1, 0, 0),    // Move east
          new Vec3(-1, 0, 0),   // Move west  
          new Vec3(0, 0, 1),    // Move south
          new Vec3(0, 0, -1),   // Move north
          new Vec3(0, -1, 0)    // Move down (if possible)
        ];

        for (const move of recoveryMoves) {
          try {
            const newTarget = originalPosition.plus(move);
            const result = await this.moveTo(bot, newTarget, { 
              timeout: 5000, 
              validateMovement: false 
            });
            
            if (result.success) {
              console.log(`[MovementService] Recovery successful for ${bot.username}`);
              return true;
            }
          } catch (error) {
            // Continue to next recovery move
            continue;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.error(`[MovementService] Recovery failed after ${maxAttempts} attempts for ${bot.username}`);
      return false;

    } catch (error) {
      console.error(`[MovementService] Recovery error: ${error}`);
      return false;
    }
  }

  // Private helper methods

  private async moveJavaBot(bot: UnifiedBot, target: Vec3, options: Required<MovementOptions>): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = this.getPosition(bot);
    const javaBot = bot as any;

    try {
      // Use pathfinding if available
      if (javaBot.pathfinder && this.pathfindingService) {
        const path = this.pathfindingService.calculatePath(
          startPosition,
          target,
          (pos) => bot.blockAt?.(pos) || { type: 0 },
          {
            maxDistance: options.timeout / 100,
            allowJump: options.allowJump,
            timeout: options.timeout
          }
        );

        if (!path || path.length === 0) {
          return this.createFailureResult(startPosition, startTime, 'No path found');
        }

        // Follow the path
        for (const waypoint of path) {
          if (javaBot.navigate?.to) {
            await javaBot.navigate.to(waypoint);
          } else {
            // Fallback to direct movement
            await javaBot.lookAt(waypoint);
            if (javaBot._bot.setControlState) {
              javaBot._bot.setControlState('forward', true);
              await new Promise(resolve => setTimeout(resolve, 200));
              javaBot._bot.setControlState('forward', false);
            }
          }
        }
      } else {
        // Direct movement without pathfinding
        await javaBot.lookAt(target);
        if (javaBot._bot.setControlState) {
          javaBot._bot.setControlState('forward', true);
          const distance = startPosition.distanceTo(target);
          const moveTime = Math.min(distance * 500, options.timeout);
          await new Promise(resolve => setTimeout(resolve, moveTime));
          javaBot._bot.setControlState('forward', false);
        }
      }

      const finalPosition = this.getPosition(bot);
      return {
        success: finalPosition.distanceTo(target) <= options.tolerance,
        finalPosition,
        distanceTraveled: startPosition.distanceTo(finalPosition),
        timeTaken: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(startPosition, startTime, errorMessage);
    }
  }

  private async moveBedrockBot(bot: UnifiedBot, target: Vec3, options: Required<MovementOptions>): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = this.getPosition(bot);
    const bedrockBot = bot as any;

    try {
      // Use direct movement for Bedrock bots
      if (bedrockBot.moveTo) {
        await bedrockBot.moveTo(target);
      } else if (bedrockBot.navigateTo) {
        await bedrockBot.navigateTo(target);
      } else {
        // Fallback to smooth interpolation
        return await this.smoothMove(bot, startPosition, target, Math.min(3000, options.timeout));
      }

      const finalPosition = this.getPosition(bot);
      return {
        success: finalPosition.distanceTo(target) <= options.tolerance,
        finalPosition,
        distanceTraveled: startPosition.distanceTo(finalPosition),
        timeTaken: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createFailureResult(startPosition, startTime, errorMessage);
    }
  }

  private async jumpJavaBot(bot: UnifiedBot, height?: number): Promise<void> {
    const javaBot = bot as any;
    if (javaBot._bot?.setControlState) {
      javaBot._bot.setControlState('jump', true);
      await new Promise(resolve => setTimeout(resolve, 100));
      javaBot._bot.setControlState('jump', false);
    }
  }

  private async jumpBedrockBot(bot: UnifiedBot, height?: number): Promise<void> {
    // For Bedrock bots, jumping is typically part of movement
    const currentPos = this.getPosition(bot);
    const jumpTarget = new Vec3(currentPos.x, currentPos.y + (height || 1.2), currentPos.z);
    
    const bedrockBot = bot as any;
    if (bedrockBot.moveTo) {
      await bedrockBot.moveTo(jumpTarget);
    }
  }

  private async sprintJavaBot(bot: UnifiedBot, sprint: boolean): Promise<boolean> {
    try {
      const javaBot = bot as any;
      if (javaBot._bot?.setControlState) {
        javaBot._bot.setControlState('sprint', sprint);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  private async sprintBedrockBot(bot: UnifiedBot, sprint: boolean): Promise<boolean> {
    // Bedrock bots don't have direct sprint control
    // This would be handled by increasing movement speed
    return true;
  }

  private async sneakJavaBot(bot: UnifiedBot, sneak: boolean): Promise<boolean> {
    try {
      const javaBot = bot as any;
      if (javaBot._bot?.setControlState) {
        javaBot._bot.setControlState('sneak', sneak);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  private async sneakBedrockBot(bot: UnifiedBot, sneak: boolean): Promise<boolean> {
    // Bedrock bots don't have direct sneak control  
    // This would be handled by movement speed reduction
    return true;
  }

  private async flyJavaBot(bot: UnifiedBot, target: Vec3, options: MovementOptions): Promise<MovementResult> {
    // Flying in Java edition requires creative mode
    return await this.moveJavaBot(bot, target, {
      speed: options.speed ?? 1.5,
      sprint: false,
      sneak: false,
      allowJump: true,
      timeout: options.timeout ?? 30000,
      tolerance: options.tolerance ?? 1.0,
      avoidObstacles: false, // Flying can go through some obstacles
      smoothPath: true,
      validateMovement: options.validateMovement ?? false
    });
  }

  private async flyBedrockBot(bot: UnifiedBot, target: Vec3, options: MovementOptions): Promise<MovementResult> {
    const startTime = Date.now();
    const startPosition = this.getPosition(bot);

    // For Bedrock, flying is direct 3D movement
    const result = await this.smoothMove(bot, startPosition, target, options.timeout ?? 5000);
    return result;
  }

  private async stopJavaBot(bot: UnifiedBot): Promise<void> {
    const javaBot = bot as any;
    
    if (javaBot.pathfinder?.stop) {
      javaBot.pathfinder.stop();
    }
    
    if (javaBot.navigate?.stop) {
      javaBot.navigate.stop();
    }
    
    if (javaBot._bot?.clearControlStates) {
      javaBot._bot.clearControlStates();
    }
  }

  private async stopBedrockBot(bot: UnifiedBot): Promise<void> {
    // For Bedrock bots, stopping is implicit when no movement commands are sent
    // We can try to move to current position to "stop"
    const currentPos = this.getPosition(bot);
    const bedrockBot = bot as any;
    
    if (bedrockBot.moveTo) {
      await bedrockBot.moveTo(currentPos);
    }
  }

  private getPosition(bot: UnifiedBot): Vec3 {
    const pos = bot.getPosition();
    return new Vec3(pos.x, pos.y, pos.z);
  }

  private isInWater(bot: UnifiedBot): boolean {
    try {
      const position = this.getPosition(bot);
      const block = bot.blockAt?.(position);
      return block ? this.blockRegistry.isLiquid(block.type) : false;
    } catch (error) {
      return false;
    }
  }

  private updateMovementState(bot: UnifiedBot, state: Partial<MovementState>): void {
    const currentState = this.movementStates.get(bot.username) || {
      isMoving: false,
      isSprinting: false,
      isSneaking: false,
      isJumping: false,
      isSwimming: false,
      isFlying: false
    };

    this.movementStates.set(bot.username, { ...currentState, ...state });
  }

  private createFailureResult(startPosition: Vec3, startTime: number, error: string): MovementResult {
    return {
      success: false,
      finalPosition: startPosition,
      distanceTraveled: 0,
      timeTaken: Date.now() - startTime,
      error
    };
  }

  private analyzeBlockObstacle(block: any, position: Vec3): Obstacle | null {
    if (!block || block.type === 0) {
      return null; // Air block
    }

    const isLiquid = this.blockRegistry.isLiquid(block.type);
    const hardness = this.blockRegistry.getHardness(block.type);

    let severity = 2; // Default severity
    let bypassable = true;

    if (isLiquid) {
      severity = 1; // Liquids are usually passable
    } else if (hardness > 10) {
      severity = 8; // Very hard blocks
      bypassable = false;
    } else if (hardness > 5) {
      severity = 5; // Moderately hard blocks
    }

    return {
      position,
      type: 'block',
      name: block.name || `block_${block.type}`,
      bypassable,
      severity
    };
  }

  private applyEasing(progress: number, easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'): number {
    switch (easing) {
      case 'linear':
        return progress;
      case 'ease-in':
        return progress * progress;
      case 'ease-out':
        return 1 - Math.pow(1 - progress, 2);
      case 'ease-in-out':
        return progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      default:
        return progress;
    }
  }
}