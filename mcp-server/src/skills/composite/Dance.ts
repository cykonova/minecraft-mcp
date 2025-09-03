import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillResult, SkillResults } from '../SkillResult.js';
import { ExecutionStep, SkillDependencyMap } from '../ICompositeSkill.js';

const { GoalXZ } = mineflayer_pathfinder.goals;
const { Movements } = mineflayer_pathfinder;

export interface IDanceParams {
  time?: number;
  name?: string;
}

/**
 * Composite skill for making the bot dance with various movements
 * 
 * This skill performs a sequence of dance moves including:
 * - Arm swinging and waving
 * - Spinning and turning
 * - Jumping and crouching
 * - Movement patterns
 * - Optional dancing with another player
 */
@injectable()
export class Dance extends CompositeSkill {
  readonly name = 'dance';
  readonly description = 'Dance around for a specific amount of time with various moves';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  readonly skillDependencies: string[] = []; // No dependencies needed
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      time: {
        type: 'number',
        description: 'The number of seconds to dance for (default: 10, max: 60)',
        default: 10,
        minimum: 1,
        maximum: 60
      },
      name: {
        type: 'string',
        description: 'Optional: The name of the person to dance with',
        maxLength: 16
      }
    },
    required: []
  };

  private static readonly DANCE_INTERVAL = 180000; // 3 minutes cooldown
  private static lastDanceTime = new Map<any, number>();

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    const { bot, params } = context;
    const { time = 10, name } = params as IDanceParams;

    const danceTime = Math.min(60, time); // Ensure time is at most 60 seconds
    const botLastDance = Dance.lastDanceTime.get(bot) || 0;

    // Check dance cooldown
    if (Date.now() - botLastDance < Dance.DANCE_INTERVAL) {
      return SkillResults.success(
        null,
        'You\'ve danced recently and are too tired to dance right now. You might want to comment on this.'
      );
    }

    // Record dance time
    Dance.lastDanceTime.set(bot, Date.now());

    this.log('info', `Starting dance performance for ${danceTime} seconds`);

    return await this.executeCompositeSkill(context, dependencies);
  }

  protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    const { time = 10, name } = params as IDanceParams;
    const danceTime = Math.min(60, time);

    const steps: Omit<ExecutionStep, 'id'>[] = [];

    // If dancing with someone, first move towards them (optional step)
    if (name) {
      steps.push({
        skillName: 'prepareDancePartner',
        params: { name },
        description: `Move towards dance partner: ${name}`,
        estimatedTime: 3000,
        optional: true
      });
    }

    // Add the main dance performance step
    steps.push({
      skillName: 'performDance',
      params: { time: danceTime },
      description: `Perform dance moves for ${danceTime} seconds`,
      estimatedTime: danceTime * 1000,
      optional: false
    });

    return steps;
  }

  protected async executeStep(
    step: ExecutionStep,
    context: ISkillContext,
    dependencies: SkillDependencyMap
  ): Promise<SkillResult> {
    switch (step.skillName) {
      case 'prepareDancePartner':
        return await this.prepareDancePartner(context, step.params.name);
      case 'performDance':
        return await this.performDance(context, step.params.time);
      default:
        return SkillResults.error(`Unknown dance step: ${step.skillName}`);
    }
  }

  /**
   * Prepare to dance with a partner (move towards them and look at them)
   */
  private async prepareDancePartner(context: ISkillContext, partnerName: string): Promise<SkillResult> {
    const { bot } = context;

    try {
      // Find the dance partner
      const partner = this.findPlayerByName(bot, partnerName);
      if (!partner) {
        return SkillResults.success(null, `Dance partner '${partnerName}' not found, dancing solo`);
      }

      // Look towards the partner
      const partnerPos = partner.entity.position;
      await bot.lookAt(partnerPos);

      return SkillResults.success(null, `Ready to dance with ${partnerName}`);
    } catch (error) {
      // Non-critical error, can still dance
      return SkillResults.success(null, `Could not prepare for partner dance, dancing solo`);
    }
  }

  /**
   * Perform the actual dance with various moves
   */
  private async performDance(context: ISkillContext, danceTime: number): Promise<SkillResult> {
    const { bot, signal } = context;
    const startPosition = bot.entity.position.clone();

    // Array of dance moves
    const moves = [
      () => this.swingArmsMove(bot),
      () => this.spinMove(bot),
      () => this.turnAroundMove(bot),
      () => this.jumpMove(bot),
      () => this.crouchMove(bot, 'fast'),
      () => this.crouchMove(bot, 'slow'),
    ];

    let dancing = true;
    const startTime = Date.now();
    const endTime = startTime + (danceTime * 1000);

    try {
      while (dancing && Date.now() < endTime) {
        // Check for cancellation
        if (signal?.aborted) {
          dancing = false;
          break;
        }

        // Pick a random dance move
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        await randomMove();

        // Small pause between moves
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const actualDanceTime = Math.round((Date.now() - startTime) / 1000);
      const message = signal?.aborted 
        ? `You decided to do something else and stopped dancing after ${actualDanceTime} seconds.`
        : `You finished dancing for ${actualDanceTime} seconds.`;

      return SkillResults.success(
        { 
          danceTime: actualDanceTime,
          cancelled: signal?.aborted || false
        },
        message
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Dance was interrupted: ${errorMessage}`);
    }
  }

  /**
   * Arm swinging dance move
   */
  private async swingArmsMove(bot: any): Promise<void> {
    this.log('debug', 'Dance move: Swinging arms');
    
    // Wave hands (look up and down rapidly while swinging)
    for (let i = 0; i < 5; i++) {
      bot.swingArm('right');
      await bot.look(0, Math.PI / 4, false); // Look up
      bot.swingArm('left');
      await bot.look(0, -Math.PI / 4, false); // Look down
      bot.swingArm('right');
      bot.swingArm('left');
    }

    await bot.look(0, 0, false); // Return to normal
  }

  /**
   * Spinning dance move
   */
  private async spinMove(bot: any): Promise<void> {
    this.log('debug', 'Dance move: Spinning moonwalk');
    
    // Spin while moving backwards
    for (let i = 0; i < 4; i++) {
      await bot.look((Math.PI / 2) * i, 0, false);
      await bot.setControlState('back', true);
      bot.swingArm('right');
      await new Promise(resolve => setTimeout(resolve, 200));
      await bot.setControlState('back', false);
      bot.swingArm('left');
    }
  }

  /**
   * Turn around dance move
   */
  private async turnAroundMove(bot: any): Promise<void> {
    this.log('debug', 'Dance move: Turning around');
    
    await bot.look(Math.PI, 0, false); // 180 degree turn
    await new Promise(resolve => setTimeout(resolve, 300));
    await bot.look(0, 0, false); // Turn back
  }

  /**
   * Jumping dance move
   */
  private async jumpMove(bot: any): Promise<void> {
    this.log('debug', 'Dance move: Jumping');
    
    await bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 200));
    await bot.setControlState('jump', false);
  }

  /**
   * Crouching dance move
   */
  private async crouchMove(bot: any, style: 'fast' | 'slow'): Promise<void> {
    this.log('debug', `Dance move: Crouching (${style})`);
    
    const timing = style === 'fast' ? [200, 300, 200] : [300, 100, 300];
    
    for (let i = 0; i < 3; i++) {
      await bot.setControlState('sneak', true);
      await new Promise(resolve => setTimeout(resolve, timing[0]));
      await bot.setControlState('sneak', false);
      await new Promise(resolve => setTimeout(resolve, timing[1]));
    }
  }

  /**
   * Find a player by name in the world
   */
  private findPlayerByName(bot: any, name: string): any {
    const players = Object.values(bot.players).filter((player: any) => 
      player && player.entity && player.username.toLowerCase() === name.toLowerCase()
    );
    
    return players.length > 0 ? players[0] : null;
  }

  /**
   * Handle partial failure - dance can continue even if some moves fail
   */
  async handlePartialFailure(
    step: ExecutionStep,
    error: SkillResult,
    context: ISkillContext
  ): Promise<boolean> {
    // If dance partner preparation fails, continue with solo dance
    if (step.skillName === 'prepareDancePartner') {
      this.log('info', 'Dance partner preparation failed, continuing with solo dance');
      return true;
    }

    // For main dance performance, abort on failure
    return false;
  }

  /**
   * Estimate execution time based on dance duration
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const danceTime = Math.min(params.time || 10, 60);
    const baseTime = 2000; // Setup time
    const partnerTime = params.name ? 3000 : 0; // Time to find partner
    
    return baseTime + partnerTime + (danceTime * 1000);
  }

  /**
   * Dance is always cancellable
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation by stopping all dance moves
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    const { bot } = context;
    try {
      // Stop any ongoing control states if using Java edition
      if ((bot as any).edition === 'java' && (bot as any)._bot) {
        const mineflayerBot = (bot as any)._bot;
        if (mineflayerBot.setControlState) {
          mineflayerBot.setControlState('back', false);
          mineflayerBot.setControlState('jump', false);
          mineflayerBot.setControlState('sneak', false);
        }
        
        // Return to normal look direction
        if (mineflayerBot.look) {
          await mineflayerBot.look(0, 0, false);
        }
      }
      
      this.log('info', 'Dance cancelled - stopped all movements');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}