import { injectable } from 'tsyringe';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IRestParams {
  restTime?: number;
}

/**
 * Atomic skill for making the bot rest/idle for a specified time
 * 
 * This skill makes the bot wait/rest for a certain duration, useful for:
 * - Pausing between actions
 * - Waiting for conditions to change
 * - Adding delays in sequences
 */
@injectable()
export class Rest extends AtomicSkill {
  readonly name = 'rest';
  readonly description = 'Makes the bot rest/idle for a specified amount of time';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      restTime: {
        type: 'number',
        description: 'The duration of time to rest for, in seconds (default: 4, max: 12)',
        default: 4,
        minimum: 1,
        maximum: 12
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    let { restTime = 4 } = params as IRestParams;
    
    const SECONDS_TO_TICKS = 20; // twenty ticks per second
    restTime = Math.min(restTime, 12); // Set max rest time to 12 seconds.
    const ticks_to_rest = restTime * SECONDS_TO_TICKS; // convert seconds to ticks
    const tick_interval = SECONDS_TO_TICKS * 2; // allow interrupting every 2 seconds
    let cur_sleep_ticks = 0;

    this.log('info', `Starting to rest for ${restTime} seconds...`);

    try {
      while (cur_sleep_ticks < ticks_to_rest) {
        // Check for cancellation
        if (signal?.aborted) {
          return SkillResults.success(
            null, 
            'You decided to do something else instead of resting.'
          );
        }

        await bot.waitForTicks(tick_interval);
        cur_sleep_ticks += tick_interval;
      }

      return SkillResults.success(null, `You finished resting for ${restTime} seconds.`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Rest was interrupted: ${errorMessage}`);
    }
  }

  /**
   * Estimate execution time based on rest duration
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const restTime = Math.min(params.restTime || 4, 12);
    return restTime * 1000; // Convert to milliseconds
  }

  /**
   * Rest is always cancellable
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation by stopping early
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    this.log('info', 'Rest cancelled - stopping early');
  }
}