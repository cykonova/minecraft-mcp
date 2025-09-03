import { injectable } from 'tsyringe';
import { Entity } from 'prismarine-entity';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IAttackSomeoneParams {
  targetType: 'player' | 'mob' | 'animal';
  targetName?: string;
  duration?: number;
  count?: number;
}

/**
 * Atomic skill for attacking entities (players, mobs, animals)
 * 
 * This skill handles:
 * - Finding targets by type and optional name
 * - Combat mechanics and attacking
 * - Duration-based or kill-count based combat
 * - Target validation and safety checks
 */
@injectable()
export class AttackSomeone extends AtomicSkill {
  readonly name = 'attackSomeone';
  readonly description = 'Attack, kill, defend against, or initiate combat with someone';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['targetType'],
    properties: {
      targetType: {
        type: 'string',
        enum: ['player', 'mob', 'animal'],
        description: 'The type of target to attack'
      },
      targetName: {
        type: 'string',
        description: 'Optional: Specific name/type of entity to attack',
        maxLength: 50
      },
      duration: {
        type: 'number',
        description: 'Duration in seconds to attack for (default: 20, max: 120)',
        default: 20,
        minimum: 1,
        maximum: 120
      },
      count: {
        type: 'number',
        description: 'Number of kills to achieve (default: 1)',
        default: 1,
        minimum: 1,
        maximum: 50
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { 
      targetType, 
      targetName, 
      duration = 20,
      count = 1 
    } = params as IAttackSomeoneParams;

    this.log('info', `Starting combat: ${targetType}${targetName ? ` (${targetName})` : ''}`);

    try {
      // Find initial target
      const target = this.findTarget(bot, targetType, targetName);
      if (!target) {
        return SkillResults.error(
          `No ${targetType}${targetName ? ` named '${targetName}'` : ''} found nearby`
        );
      }

      // Execute combat based on parameters
      if (count > 1 || targetType !== 'player') {
        // Kill-based combat (for mobs/animals or multiple kills)
        return await this.executeKillBasedCombat(bot, targetType, targetName, count, signal);
      } else {
        // Duration-based combat (for players)
        return await this.executeDurationBasedCombat(bot, target, duration, signal);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Combat failed: ${errorMessage}`);
    }
  }

  /**
   * Find a target entity based on type and optional name
   */
  private findTarget(bot: any, targetType: string, targetName?: string): Entity | null {
    const entities = Object.values(bot.entities) as Entity[];

    switch (targetType) {
      case 'player':
        return this.findPlayer(bot, targetName);
      
      case 'mob':
        return this.findMob(entities, targetName);
      
      case 'animal':
        return this.findAnimal(entities, targetName);
      
      default:
        return null;
    }
  }

  /**
   * Find a player by name
   */
  private findPlayer(bot: any, playerName?: string): Entity | null {
    const players = Object.values(bot.players).filter((player: any) => 
      player && player.entity && player.username !== bot.username
    );

    if (!playerName) {
      // Return closest player if no name specified
      return players.length > 0 ? (players[0] as any).entity : null;
    }

    const targetPlayer = players.find((player: any) => 
      player.username.toLowerCase() === playerName.toLowerCase()
    );

    return targetPlayer ? (targetPlayer as any).entity : null;
  }

  /**
   * Find a hostile mob
   */
  private findMob(entities: Entity[], mobName?: string): Entity | null {
    const hostileMobs = [
      'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 
      'witch', 'slime', 'magma_cube', 'blaze', 'ghast',
      'piglin', 'hoglin', 'zoglin', 'pillager', 'vindicator',
      'evoker', 'vex', 'ravager', 'phantom', 'drowned'
    ];

    const mobs = entities.filter(entity => 
      hostileMobs.includes(entity.name?.toLowerCase() || '') ||
      entity.type === 'mob'
    );

    if (!mobName) {
      return mobs.length > 0 ? mobs[0] : null;
    }

    return mobs.find(mob => 
      mob.name?.toLowerCase().includes(mobName.toLowerCase()) ||
      mob.displayName?.toLowerCase().includes(mobName.toLowerCase())
    ) || null;
  }

  /**
   * Find an animal
   */
  private findAnimal(entities: Entity[], animalName?: string): Entity | null {
    const animals = [
      'cow', 'pig', 'sheep', 'chicken', 'rabbit', 'horse',
      'donkey', 'mule', 'llama', 'wolf', 'cat', 'ocelot',
      'fox', 'bee', 'turtle', 'panda', 'polar_bear'
    ];

    const animalEntities = entities.filter(entity => 
      animals.includes(entity.name?.toLowerCase() || '') ||
      (entity as any).type === 'animal'
    );

    if (!animalName) {
      return animalEntities.length > 0 ? animalEntities[0] : null;
    }

    return animalEntities.find(animal => 
      animal.name?.toLowerCase().includes(animalName.toLowerCase()) ||
      animal.displayName?.toLowerCase().includes(animalName.toLowerCase())
    ) || null;
  }

  /**
   * Execute duration-based combat (mainly for players)
   */
  private async executeDurationBasedCombat(
    bot: any, 
    target: Entity, 
    duration: number, 
    signal?: AbortSignal
  ): Promise<SkillResult> {
    const endTime = Date.now() + (duration * 1000);
    let attacks = 0;

    while (Date.now() < endTime) {
      // Check for cancellation
      if (signal?.aborted) {
        return SkillResults.success(
          { attacks, duration: Math.round((Date.now() - (endTime - duration * 1000)) / 1000) },
          'Combat cancelled'
        );
      }

      // Check if target still exists and is nearby
      if (!target || target.isValid === false) {
        return SkillResults.error('Target disappeared or became invalid');
      }

      const distance = bot.entity.position.distanceTo(target.position);
      if (distance > 6) {
        this.log('warn', 'Target moved too far away, ending combat');
        break;
      }

      // Attack the target
      try {
        await bot.attack(target);
        attacks++;
        this.log('debug', `Attacked target (${attacks} attacks so far)`);
      } catch (error) {
        // Continue even if individual attacks fail
        this.log('warn', `Attack failed: ${error}`);
      }

      // Wait before next attack (attack cooldown)
      await new Promise(resolve => setTimeout(resolve, 600)); // ~1.67 attacks per second
    }

    const actualDuration = Math.round((Date.now() - (endTime - duration * 1000)) / 1000);
    return SkillResults.success(
      { attacks, duration: actualDuration },
      `Fought for ${actualDuration} seconds with ${attacks} attacks`
    );
  }

  /**
   * Execute kill-based combat (for mobs/animals or multiple targets)
   */
  private async executeKillBasedCombat(
    bot: any, 
    targetType: string, 
    targetName: string | undefined, 
    count: number,
    signal?: AbortSignal
  ): Promise<SkillResult> {
    let kills = 0;
    let attacks = 0;
    const maxAttempts = count * 20; // Limit total attempts to prevent infinite loops

    while (kills < count && attacks < maxAttempts) {
      // Check for cancellation
      if (signal?.aborted) {
        return SkillResults.success(
          { kills, attacks },
          `Combat cancelled after ${kills} kills`
        );
      }

      // Find a new target
      const target = this.findTarget(bot, targetType, targetName);
      if (!target) {
        this.log('warn', 'No more targets found');
        break;
      }

      try {
        // Attack until target dies or escapes
        const result = await this.attackUntilDead(bot, target, signal);
        attacks += result.attacks;
        
        if (result.killed) {
          kills++;
          this.log('info', `Killed target (${kills}/${count})`);
        }
      } catch (error) {
        this.log('warn', `Failed to kill target: ${error}`);
      }

      // Small pause between targets
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const message = kills >= count 
      ? `Successfully killed ${kills} ${targetType}(s)`
      : `Killed ${kills}/${count} ${targetType}(s) before stopping`;

    return SkillResults.success({ kills, attacks }, message);
  }

  /**
   * Attack a single target until it dies
   */
  private async attackUntilDead(bot: any, target: Entity, signal?: AbortSignal): Promise<{ killed: boolean, attacks: number }> {
    let attacks = 0;
    const maxAttacks = 50; // Prevent infinite loops
    const startTime = Date.now();
    const maxTime = 30000; // 30 seconds max per target

    while (attacks < maxAttacks && Date.now() - startTime < maxTime) {
      if (signal?.aborted) {
        break;
      }

      // Check if target still exists
      if (!target || target.isValid === false) {
        return { killed: true, attacks };
      }

      const distance = bot.entity.position.distanceTo(target.position);
      if (distance > 8) {
        return { killed: false, attacks }; // Target escaped
      }

      try {
        await bot.attack(target);
        attacks++;
      } catch (error) {
        // Target might be dead or invalid
        return { killed: true, attacks };
      }

      // Wait for attack cooldown
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    return { killed: false, attacks };
  }

  /**
   * Resource requirements for combat
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      tools: ['sword', 'axe'], // Prefer weapons but not required
      permissions: [] // Combat doesn't need special permissions
    };
  }

  /**
   * Estimate execution time based on parameters
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const duration = params.duration || 20;
    const count = params.count || 1;
    
    if (params.targetType === 'player') {
      return duration * 1000; // Duration-based for players
    } else {
      return Math.min(count * 10000, 120000); // ~10 seconds per kill, max 2 minutes
    }
  }

  /**
   * Combat can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation by stopping attacks
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    this.log('info', 'Combat cancelled - stopping attacks');
  }
}