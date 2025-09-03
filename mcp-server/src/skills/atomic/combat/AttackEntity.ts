import { injectable } from 'tsyringe';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

export interface IAttackEntityParams {
  targetType: 'player' | 'mob' | 'animal' | 'hostile' | 'passive';
  targetName?: string;
  maxDistance?: number;
  timeout?: number;
}

/**
 * Atomic skill for attacking a specific entity
 * 
 * This skill handles:
 * - Finding the target entity
 * - Navigation to attack range
 * - Performing the attack
 * - Basic combat mechanics
 */
@injectable()
export class AttackEntity extends AtomicSkill {
  readonly name = 'AttackEntity';
  readonly description = 'Attack a specific entity (player, mob, or animal)';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'library' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['targetType'],
    properties: {
      targetType: {
        type: 'string',
        enum: ['player', 'mob', 'animal', 'hostile', 'passive'],
        description: 'Type of entity to attack'
      },
      targetName: {
        type: 'string',
        description: 'Specific name of the entity to attack (optional, e.g., "Zombie", "Steve")'
      },
      maxDistance: {
        type: 'number',
        description: 'Maximum distance to search for targets (default: 16)',
        default: 16,
        minimum: 1,
        maximum: 64
      },
      timeout: {
        type: 'number',
        description: 'Maximum time in milliseconds to spend attacking (default: 5000)',
        default: 5000,
        minimum: 1000,
        maximum: 30000
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { targetType, targetName, maxDistance = 16, timeout = 5000 } = params as IAttackEntityParams;

    // Find the target entity
    const target = this.findTarget(bot, targetType, targetName, maxDistance);
    if (!target) {
      const nameSpec = targetName ? ` named "${targetName}"` : '';
      return SkillResults.error(`No ${targetType}${nameSpec} found within ${maxDistance} blocks`);
    }

    const targetDisplayName = target.username || target.displayName || target.name || targetType;
    const initialDistance = bot.entity.position.distanceTo(target.position);
    
    this.log('info', `Attacking ${targetDisplayName} at distance ${initialDistance.toFixed(2)}`);

    try {
      const startTime = Date.now();
      let lastAttackTime = 0;
      const attackCooldown = 600; // Minimum time between attacks (milliseconds)

      while (target.isValid && Date.now() - startTime < timeout) {
        const currentDistance = bot.entity.position.distanceTo(target.position);
        
        // Move closer if too far
        if (currentDistance > 4) {
          const goal = new GoalNear(target.position.x, target.position.y, target.position.z, 2);
          (bot as any).pathfinder.goto(goal);
        } else {
          // Stop pathfinding when close enough
          (bot as any).pathfinder.setGoal(null);
        }

        // Attack if within range and cooldown has passed
        if (currentDistance <= 4 && Date.now() - lastAttackTime > attackCooldown) {
          // Look at the target
          await bot.lookAt(target.position.offset(0, target.height / 2, 0));
          
          // Perform the attack
          (bot as any).attack(target);
          lastAttackTime = Date.now();
          
          this.log('debug', `Attacked ${targetDisplayName}`);
        }

        // Check if target is dead (for mobs/animals)
        if (target.health !== undefined && target.health <= 0) {
          break;
        }

        // Wait a tick before next iteration
        await bot.waitForTicks(1);
      }

      // Stop any ongoing pathfinding
      (bot as any).pathfinder.setGoal(null);

      // Determine result
      if (!target.isValid || (target.health !== undefined && target.health <= 0)) {
        return SkillResults.success(null, `Successfully defeated ${targetDisplayName}`);
      } else if (Date.now() - startTime >= timeout) {
        return SkillResults.success(null, `Attacked ${targetDisplayName} for ${timeout}ms (timeout reached)`);
      } else {
        return SkillResults.error(`Lost target ${targetDisplayName} during combat`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Stop pathfinding on error
      try {
        (bot as any).pathfinder.setGoal(null);
      } catch (stopError) {
        // Ignore
      }

      return SkillResults.error(`Combat failed: ${errorMessage}`);
    }
  }

  /**
   * Find a suitable target entity
   */
  private findTarget(bot: any, targetType: string, targetName: string | undefined, maxDistance: number): any | null {
    const entities = Object.values(bot.entities) as any[];
    
    let candidates = entities.filter(entity => {
      if (!entity || !entity.position || !entity.isValid) {
        return false;
      }

      // Distance check
      if (entity.position.distanceTo(bot.entity.position) > maxDistance) {
        return false;
      }

      // Don't attack self
      if (entity === bot.entity) {
        return false;
      }

      return this.matchesTargetCriteria(entity, targetType, targetName);
    });

    // Sort by distance, closest first
    candidates.sort((a, b) => {
      const distA = a.position.distanceTo(bot.entity.position);
      const distB = b.position.distanceTo(bot.entity.position);
      return distA - distB;
    });

    return candidates[0] || null;
  }

  /**
   * Check if an entity matches the target criteria
   */
  private matchesTargetCriteria(entity: any, targetType: string, targetName: string | undefined): boolean {
    // Specific name match
    if (targetName) {
      const entityName = entity.username || entity.displayName || entity.name || '';
      if (entityName.toLowerCase() !== targetName.toLowerCase()) {
        return false;
      }
    }

    // Type-based matching
    switch (targetType) {
      case 'player':
        return !!entity.username;
        
      case 'mob':
        return !entity.username && entity.type !== 'object' && entity.type !== 'other';
        
      case 'animal':
        return this.isAnimal(entity);
        
      case 'hostile':
        return this.isHostileMob(entity);
        
      case 'passive':
        return this.isPassiveMob(entity);
        
      default:
        return false;
    }
  }

  /**
   * Check if entity is an animal
   */
  private isAnimal(entity: any): boolean {
    const animalTypes = [
      'cow', 'pig', 'sheep', 'chicken', 'horse', 'donkey', 'mule', 
      'llama', 'rabbit', 'wolf', 'cat', 'ocelot', 'parrot', 'fox'
    ];
    
    const entityType = (entity.name || entity.type || '').toLowerCase();
    return animalTypes.some(animal => entityType.includes(animal));
  }

  /**
   * Check if entity is a hostile mob
   */
  private isHostileMob(entity: any): boolean {
    const hostileTypes = [
      'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
      'slime', 'magma_cube', 'blaze', 'ghast', 'wither', 'ender_dragon',
      'shulker', 'phantom', 'pillager', 'vindicator', 'evoker'
    ];
    
    const entityType = (entity.name || entity.type || '').toLowerCase();
    return hostileTypes.some(hostile => entityType.includes(hostile));
  }

  /**
   * Check if entity is a passive mob
   */
  private isPassiveMob(entity: any): boolean {
    const passiveTypes = [
      'villager', 'iron_golem', 'snow_golem', 'bat', 'squid', 
      'dolphin', 'turtle', 'panda', 'bee'
    ];
    
    const entityType = (entity.name || entity.type || '').toLowerCase();
    return passiveTypes.some(passive => entityType.includes(passive));
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      tools: ['sword', 'axe', 'bow'], // Might want weapons
      environment: ['pathfinder']
    };
  }

  /**
   * Estimate execution time based on timeout
   */
  estimateExecutionTime(params: Record<string, any>): number {
    return params.timeout || 5000;
  }
}