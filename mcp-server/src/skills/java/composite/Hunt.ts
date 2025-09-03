import { injectable } from 'tsyringe';

import { CompositeSkill } from '../../CompositeSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../../ICompositeSkill.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../../decorators/skillDependency.js';
import { IAtomicSkill } from '../../IAtomicSkill.js';

export interface IHuntParams {
  targetType?: 'player' | 'mob' | 'animal';
  targetName?: string;
  amount?: number;
  duration?: number;
}

/**
 * Hunt mobs/animals for their items and resources
 * 
 * This composite skill handles the complete hunting process:
 * 1. Equips a weapon if available (sword preferred)
 * 2. Attacks the specified targets until the goal is met
 * 3. Collects any dropped items/loot
 * 
 * The skill supports both kill-count based hunting (amount) and
 * time-based hunting (duration), with smart weapon selection
 * and loot collection.
 */
@autoResolveDependencies
@injectable()
export class Hunt extends CompositeSkill {
  readonly name = 'hunt';
  readonly description = 'Hunt mobs/animals for their items and resources';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  readonly skillDependencies = ['equipItem', 'attackSomeone', 'PickupItem'];

  // Dependencies injected via decorator
  @skillDependency({ name: 'equipItem', optional: true })
  private equipItem?: IAtomicSkill;

  @skillDependency({ name: 'attackSomeone' })
  private attackSomeone!: IAtomicSkill;

  @skillDependency({ name: 'PickupItem', optional: true })
  private pickupItem?: IAtomicSkill;

  readonly inputSchema = {
    type: 'object',
    properties: {
      targetType: {
        type: 'string',
        enum: ['player', 'mob', 'animal'],
        description: 'The type of target to hunt',
        default: 'animal'
      },
      targetName: {
        type: 'string',
        description: 'Optional: Specific name/type of entity to hunt (e.g., "Zombie", "Cow")',
        maxLength: 50
      },
      amount: {
        type: 'number',
        description: 'Number of entities to hunt (default: 4, max: 5)',
        default: 4,
        minimum: 1,
        maximum: 5
      },
      duration: {
        type: 'number',
        description: 'Duration in seconds to hunt for (default: 30, max: 60)',
        default: 30,
        minimum: 5,
        maximum: 60
      }
    },
    required: []
  };

  protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    const { targetType = 'animal', targetName, amount = 4, duration = 30 } = params as IHuntParams;
    
    const steps: Omit<ExecutionStep, 'id'>[] = [];

    // Step 1: Try to equip a weapon (optional)
    steps.push({
      skillName: 'equipItem',
      description: 'Equip a weapon for hunting',
      params: {
        name: 'sword' // Will try to equip any sword
      },
      estimatedTime: 2000, // 2 seconds
      optional: true, // Don't fail if no weapon available
    });

    // Step 2: Attack the targets
    steps.push({
      skillName: 'attackSomeone',
      description: `Hunt ${amount} ${targetType}${targetName ? ` (${targetName})` : ''}`,
      params: {
        targetType,
        targetName,
        count: amount,
        duration: Math.min(duration, 60) // Enforce max duration
      },
      estimatedTime: Math.min(amount * 10000, duration * 1000), // Estimate based on targets or duration
      optional: false
    });

    return steps;
  }

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    // Inject dependencies using the dependency injector
    const injector = require('../../decorators/skillDependency.js').SkillDependencyInjector.getInstance();
    injector.injectDependencies(this, dependencies);

    // Validate parameters
    const { targetType = 'animal', targetName, amount = 4, duration = 30 } = context.params as IHuntParams;
    
    // Validate target type
    if (!['player', 'mob', 'animal'].includes(targetType)) {
      return SkillResults.error('targetType must be one of: player, mob, animal');
    }

    // Validate and cap values
    const cappedAmount = Math.min(Math.max(amount, 1), 5);
    const cappedDuration = Math.min(Math.max(duration, 5), 60);

    if (cappedAmount !== amount) {
      this.log('warn', `Amount capped from ${amount} to ${cappedAmount}`);
    }
    if (cappedDuration !== duration) {
      this.log('warn', `Duration capped from ${duration} to ${cappedDuration}`);
    }

    // Update params with capped values
    context.params = {
      ...context.params,
      amount: cappedAmount,
      duration: cappedDuration
    };

    this.log('info', `Starting hunt: ${cappedAmount} ${targetType}${targetName ? ` (${targetName})` : ''} over ${cappedDuration}s`);

    // Execute the composite skill using the base class orchestration
    const result = await this.executeCompositeSkill(context, dependencies);

    // After hunting, try to collect any dropped items if we have the skill
    if (result.success && this.pickupItem && (targetType === 'mob' || targetType === 'animal')) {
      await this.collectLoot(context);
    }

    return result;
  }

  /**
   * Try to collect loot after hunting
   */
  private async collectLoot(context: ISkillContext): Promise<void> {
    if (!this.pickupItem) return;

    const commonLoot = [
      'raw_beef', 'raw_porkchop', 'raw_chicken', 'raw_mutton',
      'leather', 'wool', 'feather', 'bone', 'rotten_flesh',
      'gunpowder', 'string', 'spider_eye', 'ender_pearl'
    ];

    this.log('debug', 'Attempting to collect loot...');

    // Try to collect a few common loot items
    for (const lootItem of commonLoot.slice(0, 3)) { // Only try first 3 to avoid spending too much time
      try {
        const lootContext = {
          ...context,
          params: { itemName: lootItem, maxDistance: 16, timeout: 5000 }
        };
        await this.pickupItem.execute(lootContext);
        // Don't fail if we can't pick up specific items
      } catch (error) {
        // Ignore loot collection errors
      }
    }
  }

  /**
   * Handle partial failure with recovery options
   */
  async handlePartialFailure(
    step: ExecutionStep,
    error: SkillResult,
    context: ISkillContext
  ): Promise<boolean> {
    const errorCode = (error as any).code;

    // If weapon equip fails, continue anyway - we can hunt without weapons
    if (step.skillName === 'equipItem') {
      this.log('warn', 'Could not equip weapon, continuing with bare hands');
      return true;
    }

    // If no targets found initially, this is a hard failure
    if (step.skillName === 'attackSomeone' && errorCode === 'TARGET_NOT_FOUND') {
      const { targetType, targetName } = context.params as IHuntParams;
      return this.createErrorResult(
        `No ${targetType}${targetName ? ` (${targetName})` : ''} found to hunt`,
        'NO_TARGETS_AVAILABLE'
      ) as any;
    }

    // Default to parent behavior
    return await super.handlePartialFailure(step, error, context);
  }

  /**
   * Enhanced rollback - try to stop any ongoing combat
   */
  protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
    const { bot } = context;
    
    if (stepId.includes('attackSomeone')) {
      try {
        // Stop any PvP combat if the plugin is available
        if ((bot as any).pvp) {
          (bot as any).pvp.forceStop();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * This skill supports rollback for stopping combat
   */
  protected supportsRollback(): boolean {
    return true;
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    const { targetType } = params as IHuntParams;
    return {
      tools: ['sword', 'axe'], // Prefer weapons for hunting
      environment: ['combat'], // Need combat capabilities
      targets: [targetType] // Need the target type to be available
    };
  }

  /**
   * Estimate total execution time
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const { amount = 4, duration = 30 } = params as IHuntParams;
    
    // Weapon equip (2s) + hunting time + buffer
    const equipTime = 2000;
    const huntingTime = Math.min(amount * 10000, duration * 1000);
    const buffer = 5000;
    
    return equipTime + huntingTime + buffer;
  }

  /**
   * This skill can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation by stopping combat
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    const { bot } = context;
    try {
      // Stop any active combat
      if ((bot as any).pvp) {
        (bot as any).pvp.forceStop();
      }
      this.log('info', 'Hunt cancelled - stopped combat');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}