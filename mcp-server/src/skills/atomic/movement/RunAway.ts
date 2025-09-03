import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import { Entity } from 'prismarine-entity';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalXZ },
} = mineflayer_pathfinder;

export interface IRunAwayParams {
  targetType?: string;
  targetName?: string;
  runDistance?: number;
  maxRadius?: number;
}

/**
 * Atomic skill for fleeing from hostile entities or players
 * 
 * This skill handles:
 * - Detecting nearby threats
 * - Calculating optimal escape direction
 * - Navigation away from threats
 * - Weighted vector calculation based on threat proximity
 */
@injectable()
export class RunAway extends AtomicSkill {
  readonly name = 'RunAway';
  readonly description = 'Run away from hostile mobs or specific players';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      targetType: {
        type: 'string',
        description: 'Type of target to flee from: "mob" (hostile mobs) or "player"',
        enum: ['mob', 'player'],
        default: 'mob'
      },
      targetName: {
        type: 'string',
        description: 'Specific entity name to flee from (optional). For players: username, for mobs: mob type (e.g., "Zombie")'
      },
      runDistance: {
        type: 'number',
        description: 'Distance to run away in blocks (default: 10)',
        default: 10,
        minimum: 5,
        maximum: 50
      },
      maxRadius: {
        type: 'number',
        description: 'Maximum radius to scan for threats (default: 16)',
        default: 16,
        minimum: 5,
        maximum: 32
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { 
      targetType = 'mob', 
      targetName, 
      runDistance = 10, 
      maxRadius = 16 
    } = params as IRunAwayParams;

    this.log('info', `Running away from ${targetName || targetType} (distance: ${runDistance})`);

    try {
      // Find threatening entities
      const threats = this.findThreats(bot, targetType, targetName, maxRadius);
      
      if (threats.length === 0) {
        return SkillResults.success(
          null,
          `No ${targetName || targetType}s found nearby to run away from`
        );
      }

      this.log('debug', `Found ${threats.length} threat(s), calculating escape route`);

      // Calculate escape direction
      const escapeDirection = this.calculateEscapeDirection(bot, threats);
      const destination = this.calculateDestination(bot, escapeDirection, runDistance);

      // Execute escape
      await this.executeEscape(bot, destination);

      const threatNames = threats.map(t => t.name || t.username || 'unknown').join(', ');
      return SkillResults.success(
        null,
        `Successfully ran away from: ${threatNames}`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to run away: ${errorMessage}`);
    }
  }

  private findThreats(bot: any, targetType: string, targetName?: string, maxRadius: number = 16): Entity[] {
    if (!bot.entities) return [];

    const allEntities = Object.values(bot.entities) as Entity[];
    const searchRadius = Math.min(maxRadius, (bot as any).nearbyEntityRadius || 32);
    
    // Normalize inputs
    const normalizedTargetType = targetType === 'mob' ? 'hostile' : targetType;
    const normalizedTargetName = targetName?.replace(/\s/g, '_').toLowerCase();

    return allEntities.filter((entity: Entity) => {
      // Distance check
      const distance = entity.position.distanceTo(bot.entity.position);
      if (distance > searchRadius) return false;

      // Don't target self
      if (entity.id === bot.entity.id) return false;

      // Specific name targeting
      if (normalizedTargetName) {
        if (targetType === 'player') {
          return entity.username && 
                 entity.username.toLowerCase() === normalizedTargetName;
        } else {
          return entity.name && 
                 entity.name.toLowerCase() === normalizedTargetName;
        }
      }

      // Type-based targeting
      if (normalizedTargetType === 'hostile') {
        return this.isHostileMob(bot, entity);
      } else if (normalizedTargetType === 'player') {
        return entity.type === 'player' && 
               entity.username !== bot.entity.username;
      }

      return false;
    });
  }

  private isHostileMob(bot: any, entity: Entity): boolean {
    // Check if entity has health metadata (indicates it's alive)
    const version = parseInt(bot.version.split('.')[1]);
    let healthMetadataIndex: number;
    
    if (version < 10) healthMetadataIndex = 6;
    else if (version < 14) healthMetadataIndex = 7;
    else if (version < 17) healthMetadataIndex = 8;
    else healthMetadataIndex = 9;

    const hasHealth = entity.metadata && entity.metadata[healthMetadataIndex];
    
    return entity.type === 'hostile' && 
           hasHealth && 
           entity.username !== bot.entity.username;
  }

  private calculateEscapeDirection(bot: any, threats: Entity[]): Vec3 {
    const runVector = new Vec3(0, 0, 0);
    const MIN_DISTANCE = 0.01;

    for (const threat of threats) {
      // Vector pointing away from threat
      const awayVector = bot.entity.position.minus(threat.position);
      const distance = awayVector.norm();
      
      // Weight by inverse distance (closer threats have more influence)
      const weight = 1 / Math.max(distance, MIN_DISTANCE);
      
      // Normalize the away vector
      if (distance > 0) {
        const normalizedAway = awayVector.scaled(1 / distance);
        runVector.add(normalizedAway.scaled(weight));
      }
    }

    // Normalize the final direction
    const vectorLength = runVector.norm();
    if (vectorLength > 0) {
      return runVector.scaled(1 / vectorLength);
    }

    // Fallback: random direction
    const randomAngle = Math.random() * 2 * Math.PI;
    return new Vec3(Math.cos(randomAngle), 0, Math.sin(randomAngle));
  }

  private calculateDestination(bot: any, direction: Vec3, runDistance: number): Vec3 {
    const currentPos = bot.entity.position;
    return new Vec3(
      currentPos.x + direction.x * runDistance,
      currentPos.y, // Keep same Y level for now
      currentPos.z + direction.z * runDistance
    );
  }

  private async executeEscape(bot: any, destination: Vec3): Promise<void> {
    // Stop current movement
    if (bot.pathfinder?.isMoving()) {
      bot.pathfinder.stop();
      await bot.waitForTicks(2);
    }

    // Create goal and navigate
    const goal = new GoalXZ(destination.x, destination.z);
    
    this.log('debug', `Escaping to position: ${destination.x.toFixed(1)}, ${destination.z.toFixed(1)}`);
    
    try {
      await (bot as any).pathfinder.goto(goal);
    } catch (error) {
      // Even if pathfinding fails partially, we might have moved some distance
      this.log('warn', `Pathfinding failed but might have escaped partially: ${error}`);
    }
  }

  /**
   * Resource requirements for running away
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      environment: ['pathfinder'],
      conditions: ['Can detect entities', 'Can move freely']
    };
  }

  /**
   * Estimate execution time based on run distance
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const runDistance = params.runDistance || 10;
    const baseTime = 2000; // 2 seconds base
    const movementTime = runDistance * 500; // 0.5 seconds per block
    
    return baseTime + movementTime;
  }
}