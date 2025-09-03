import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  Movements,
  goals: { GoalNear, GoalBlock },
} = mineflayer_pathfinder;

export interface IGoToLocationParams {
  x: number;
  y: number;
  z: number;
  range?: number;
  timeout?: number;
  allowTeleport?: boolean;
  verbose?: boolean;
}

/**
 * Atomic skill for moving the bot to a specific coordinate location
 * 
 * This skill handles:
 * - Navigation to specific x,y,z coordinates
 * - Range-based positioning (stop within range of target)
 * - Optional teleportation for distant locations
 * - Distance validation and warnings
 */
@injectable()
export class GoToLocation extends AtomicSkill {
  readonly name = 'goToKnownLocation';
  readonly description = 'Go to the specified coordinates';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['x', 'y', 'z'],
    properties: {
      x: {
        type: 'number',
        description: 'The x coordinate of the target location'
      },
      y: {
        type: 'number',
        description: 'The y coordinate of the target location'
      },
      z: {
        type: 'number',
        description: 'The z coordinate of the target location'
      },
      range: {
        type: 'number',
        description: 'Distance from target position to stop at (default: 1)',
        default: 1,
        minimum: 0,
        maximum: 10
      },
      timeout: {
        type: 'number',
        description: 'Maximum time in milliseconds to spend moving (default: 60000)',
        default: 60000,
        minimum: 5000,
        maximum: 300000
      },
      allowTeleport: {
        type: 'boolean',
        description: 'Allow teleportation if target is very far (requires cheats)',
        default: false
      },
      verbose: {
        type: 'boolean',
        description: 'Enable verbose logging during movement',
        default: true
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { 
      x, y, z, 
      range = 1, 
      timeout = 60000, 
      allowTeleport = false,
      verbose = true 
    } = params as IGoToLocationParams;

    // Check if pathfinder is available
    if (!(bot as any).pathfinder) {
      return SkillResults.error('Pathfinder plugin not available');
    }

    const targetPos = new Vec3(x, y, z);
    const currentPos = bot.entity.position;
    const distance = currentPos.distanceTo(targetPos);

    // Distance validation (warn about very far locations)
    const maxRecommendedDistance = 50; // blocks
    if (distance > maxRecommendedDistance && !allowTeleport) {
      this.log('warn', `Target location is very far (${distance.toFixed(2)} blocks). Consider setting allowTeleport=true.`);
    }

    // Check if we're already at the target
    if (distance <= range) {
      return SkillResults.success(
        null, 
        `Already at target location (distance: ${distance.toFixed(2)})`
      );
    }

    if (verbose) {
      this.log('info', `Moving from ${currentPos.toString()} to ${targetPos.toString()} (distance: ${distance.toFixed(2)})`);
    }

    try {
      // If distance is very far and teleport is allowed, try teleport first
      if (allowTeleport && distance > 100) {
        const teleportResult = await this.attemptTeleport(bot, x, y, z, range);
        if (teleportResult.success) {
          return teleportResult;
        } else {
          this.log('warn', 'Teleport failed, falling back to pathfinding');
        }
      }

      // Use pathfinding for movement
      return await this.moveToLocation(bot, targetPos, range, timeout, verbose, signal);

    } catch (error) {
      // Stop any ongoing movement
      try {
        (bot as any).pathfinder.setGoal(null);
      } catch (stopError) {
        // Ignore stop errors
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Movement failed: ${errorMessage}`);
    }
  }

  /**
   * Attempt to teleport to the location (requires cheats)
   */
  private async attemptTeleport(bot: any, x: number, y: number, z: number, range: number): Promise<SkillResult> {
    try {
      bot.chat(`/tp ${x} ${y} ${z}`);
      await bot.waitForTicks(10); // Wait for teleport to process
      
      const targetPos = new Vec3(x, y, z);
      const newDistance = bot.entity.position.distanceTo(targetPos);
      
      if (newDistance <= range) {
        return SkillResults.success(null, `Successfully teleported to target location`);
      } else {
        return SkillResults.error('Teleport command did not work (may not have permissions)');
      }
    } catch (error) {
      return SkillResults.error(`Teleport failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Move to location using pathfinding
   */
  private async moveToLocation(
    bot: any, 
    targetPos: Vec3, 
    range: number, 
    timeout: number,
    verbose: boolean,
    signal?: AbortSignal
  ): Promise<SkillResult> {
    // Set up pathfinding goal
    const goal = range === 0 ? new GoalBlock(targetPos.x, targetPos.y, targetPos.z) : new GoalNear(targetPos.x, targetPos.y, targetPos.z, range);
    
    // Set up movements (don't break blocks during movement)
    const movements = new Movements(bot);
    movements.canDig = false;
    bot.pathfinder.setMovements(movements);

    if (verbose) {
      this.log('info', 'Starting pathfinding to target location');
    }

    // Execute movement with timeout and cancellation checking
    const movePromise = bot.pathfinder.goto(goal);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Movement timeout')), timeout)
    );

    // Cancellation checker
    const checkCancellation = async () => {
      while (bot.pathfinder.isMoving()) {
        if (signal?.aborted) {
          bot.pathfinder.setGoal(null);
          throw new Error('Movement cancelled');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    await Promise.race([movePromise, timeoutPromise, checkCancellation()]);

    // Check final position
    const finalDistance = bot.entity.position.distanceTo(targetPos);
    if (finalDistance <= range) {
      const message = `Successfully moved to target location (final distance: ${finalDistance.toFixed(2)})`;
      if (verbose) {
        this.log('info', message);
      }
      return SkillResults.success(null, message);
    } else {
      return SkillResults.error(
        `Movement completed but not within range (distance: ${finalDistance.toFixed(2)}, required: ${range})`
      );
    }
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      permissions: params.allowTeleport ? ['teleport'] : [],
      environment: ['pathfinder']
    };
  }

  /**
   * Estimate execution time based on distance and teleport setting
   */
  estimateExecutionTime(params: Record<string, any>): number {
    if (!params.x || !params.y || !params.z) {
      return 30000; // 30 seconds default
    }

    const distance = Math.sqrt(params.x * params.x + params.z * params.z); // Rough distance estimation
    
    if (params.allowTeleport && distance > 100) {
      return 5000; // 5 seconds for teleport
    }

    // Estimate based on walking speed: ~4.3 blocks/second
    const baseTime = 5000; // 5 seconds base time
    const movementTime = Math.min(distance * 230, params.timeout || 60000); // ~230ms per block, cap at timeout
    
    return baseTime + movementTime;
  }

  /**
   * Always cancellable
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation by stopping pathfinding
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    const { bot } = context;
    try {
      (bot as any).pathfinder?.setGoal(null);
      this.log('info', 'Movement cancelled - stopped pathfinding');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}