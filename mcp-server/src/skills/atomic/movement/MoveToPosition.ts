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

export interface IMoveToPositionParams {
  x: number;
  y: number;
  z: number;
  range?: number;
  timeout?: number;
  allowTeleport?: boolean;
}

/**
 * Atomic skill for moving the bot to a specific position
 * 
 * This is a fundamental movement skill that handles:
 * - Basic pathfinding to coordinates
 * - Range-based positioning
 * - Timeout handling
 * - Error recovery
 */
@injectable()
export class MoveToPosition extends AtomicSkill {
  readonly name = 'MoveToPosition';
  readonly description = 'Move the bot to a specific x,y,z position using pathfinding';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['x', 'y', 'z'],
    properties: {
      x: {
        type: 'number',
        description: 'X coordinate to move to'
      },
      y: {
        type: 'number',
        description: 'Y coordinate to move to'
      },
      z: {
        type: 'number',
        description: 'Z coordinate to move to'
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
        description: 'Maximum time in milliseconds to spend moving (default: 30000)',
        default: 30000,
        minimum: 1000,
        maximum: 120000
      },
      allowTeleport: {
        type: 'boolean',
        description: 'Allow teleportation if target is too far (requires cheats)',
        default: false
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { x, y, z, range = 1, timeout = 30000, allowTeleport = false } = params as IMoveToPositionParams;

    // Check if pathfinder is available
    if (!(bot as any).pathfinder) {
      return SkillResults.error('Pathfinder plugin not available');
    }

    const targetPos = new Vec3(x, y, z);
    const currentPos = bot.entity.position;
    const distance = currentPos.distanceTo(targetPos);

    // Check if we're already at the target
    if (distance <= range) {
      return SkillResults.success(null, `Already at target position (distance: ${distance.toFixed(2)})`);
    }

    this.log('info', `Moving from ${currentPos.toString()} to ${targetPos.toString()} (distance: ${distance.toFixed(2)})`);

    // If distance is very far and teleport is allowed, use teleport
    if (allowTeleport && distance > 500) {
      try {
        bot.chat(`/tp ${x} ${y} ${z}`);
        await bot.waitForTicks(10); // Wait for teleport
        
        const newDistance = bot.entity.position.distanceTo(targetPos);
        if (newDistance <= range) {
          return SkillResults.success(null, `Teleported to target position`);
        }
      } catch (error) {
        this.log('warn', 'Teleport failed, falling back to pathfinding');
      }
    }

    try {
      // Set up pathfinding goal
      const goal = range === 0 ? new GoalBlock(x, y, z) : new GoalNear(x, y, z, range);
      
      // Set up movements (don't break blocks during movement)
      const movements = new Movements(bot as any);
      movements.canDig = false;
      (bot as any).pathfinder.setMovements(movements);

      // Execute movement with timeout
      const movePromise = (bot as any).pathfinder.goto(goal);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Movement timeout')), timeout)
      );

      await Promise.race([movePromise, timeoutPromise]);

      // Check final position
      const finalDistance = bot.entity.position.distanceTo(targetPos);
      if (finalDistance <= range) {
        return SkillResults.success(
          null, `Successfully moved to target position (final distance: ${finalDistance.toFixed(2)})`
        );
      } else {
        return SkillResults.error(
          `Movement completed but not within range (distance: ${finalDistance.toFixed(2)}, required: ${range})`
        );
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Stop any ongoing movement
      try {
        (bot as any).pathfinder.setGoal(null);
      } catch (stopError) {
        // Ignore stop errors
      }

      if (errorMessage.includes('timeout')) {
        return SkillResults.error(`Movement timed out after ${timeout}ms`);
      } else if (errorMessage.includes('NoPath')) {
        return SkillResults.error(`No path found to target position`);
      } else {
        return SkillResults.error(`Movement failed: ${errorMessage}`);
      }
    } finally {
      // Reset to default movements
      try {
        (bot as any).pathfinder.setMovements(new Movements(bot as any));
      } catch (error) {
        // Ignore reset errors
      }
    }
  }

  /**
   * Resource requirements for movement
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      permissions: params.allowTeleport ? ['teleport'] : [],
      environment: ['pathfinder']
    };
  }

  /**
   * Estimate execution time based on distance
   */
  estimateExecutionTime(params: Record<string, any>): number {
    if (!params.x || !params.y || !params.z) {
      return 10000; // 10 seconds default
    }

    // Rough estimate: 1 second per 5 blocks + 5 second base
    const baseTime = 5000;
    const distance = Math.sqrt(params.x * params.x + params.z * params.z); // Rough distance estimation
    const movementTime = Math.min(distance * 200, 60000); // Max 1 minute for movement
    
    return baseTime + movementTime;
  }
}