import { injectable } from 'tsyringe';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

export interface ISleepInNearbyBedParams {
  maxDistance?: number;
  timeout?: number;
}

/**
 * Atomic skill for sleeping in a nearby bed
 * 
 * This skill handles:
 * - Finding nearby beds
 * - Time validation (nighttime only)
 * - Navigation to bed
 * - Sleep execution and monitoring
 * - Wake-up handling
 */
@injectable()
export class SleepInNearbyBed extends AtomicSkill {
  readonly name = 'SleepInNearbyBed';
  readonly description = 'Find and sleep in a nearby bed during nighttime';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      maxDistance: {
        type: 'number',
        description: 'Maximum distance to search for beds (default: 16)',
        default: 16,
        minimum: 3,
        maximum: 64
      },
      timeout: {
        type: 'number',
        description: 'Maximum time to wait for sleep in milliseconds (default: 15000)',
        default: 15000,
        minimum: 5000,
        maximum: 60000
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { maxDistance = 16, timeout = 15000 } = params as ISleepInNearbyBedParams;

    this.log('info', `Looking for bed within ${maxDistance} blocks`);

    try {
      // Check if it's nighttime
      if (!this.isNightTime(bot)) {
        return SkillResults.error("Cannot sleep during daytime - wait for nightfall");
      }

      // Find nearby bed
      const bed = this.findNearbyBed(bot, maxDistance);
      if (!bed) {
        return SkillResults.error(`No bed found within ${maxDistance} blocks`);
      }

      this.log('debug', `Found bed at ${bed.position.toString()}`);

      // Navigate to bed
      await this.navigateToBed(bot, bed);

      // Sleep in the bed
      const sleepResult = await this.sleepInBed(bot, bed, timeout);
      return sleepResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to sleep: ${errorMessage}`);
    }
  }

  private isNightTime(bot: any): boolean {
    if (!bot.time?.timeOfDay) return false;
    
    // Nighttime in Minecraft: 13000-23000 ticks (roughly 7 PM to 5 AM)
    const timeOfDay = bot.time.timeOfDay;
    return timeOfDay >= 12500 && timeOfDay <= 23500;
  }

  private findNearbyBed(bot: any, maxDistance: number): any | null {
    try {
      return bot.findBlock({
        matching: (block: any) => {
          if (!block || !block.name) return false;
          
          // Check if it's a bed block
          return block.name.includes('_bed') && !block.name.includes('bedrock');
        },
        maxDistance
      });
    } catch (error) {
      this.log('warn', `Error finding bed: ${error}`);
      return null;
    }
  }

  private async navigateToBed(bot: any, bed: any): Promise<void> {
    try {
      const goal = new GoalNear(bed.position.x, bed.position.y, bed.position.z, 2);
      await (bot as any).pathfinder.goto(goal);
      
      // Face the bed
      await bot.lookAt(bed.position.offset(0.5, 0.5, 0.5));
    } catch (error) {
      this.log('warn', `Navigation to bed failed: ${error}`);
      throw new Error(`Could not reach bed: ${error}`);
    }
  }

  private async sleepInBed(bot: any, bed: any, timeout: number): Promise<SkillResult> {
    try {
      this.log('debug', 'Attempting to sleep in bed');
      
      // Start sleeping
      await bot.sleep(bed);
      
      this.log('info', 'Successfully started sleeping');
      
      // Monitor sleep
      const sleepResult = await this.monitorSleep(bot, timeout);
      return sleepResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Common error cases
      if (errorMessage.includes('bed is occupied')) {
        return SkillResults.error('Bed is already occupied by another player');
      } else if (errorMessage.includes('too far away')) {
        return SkillResults.error('Too far from bed - try getting closer');
      } else if (errorMessage.includes('monsters nearby')) {
        return SkillResults.error('Cannot sleep - there are monsters nearby');
      } else if (errorMessage.includes('not night')) {
        return SkillResults.error('Cannot sleep - it is not nighttime');
      }
      
      return SkillResults.error(`Failed to sleep in bed: ${errorMessage}`);
    }
  }

  private async monitorSleep(bot: any, timeout: number): Promise<SkillResult> {
    return new Promise((resolve) => {
      let isResolved = false;
      const SLEEP_DURATION_TICKS = 200; // 10 seconds
      let sleepTicks = 0;
      let wokeUpNaturally = false;

      // Set up wake event listener
      const wakeHandler = () => {
        if (isResolved) return;
        
        wokeUpNaturally = true;
        this.log('debug', 'Bot woke up naturally');
        
        // Check if night was skipped
        setTimeout(() => {
          if (isResolved) return;
          isResolved = true;
          
          const isNowDay = !this.isNightTime(bot);
          if (isNowDay) {
            resolve(SkillResults.success(null, 'Slept through the night - it is now morning'));
          } else {
            const otherPlayersInfo = this.checkOtherPlayersSleep(bot);
            resolve(SkillResults.success(
              null, 
              `Woke up before dawn. ${otherPlayersInfo}`
            ));
          }
        }, 1000); // Wait a bit for time to update
      };

      bot.once('wake', wakeHandler);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        
        bot.removeListener('wake', wakeHandler);
        
        try {
          bot.wake(); // Force wake up
        } catch (error) {
          // Ignore wake errors
        }
        
        resolve(SkillResults.error('Sleep timeout - took too long to fall asleep'));
      }, timeout);

      // Monitor sleep ticks
      const tickMonitor = setInterval(async () => {
        if (isResolved || wokeUpNaturally) {
          clearInterval(tickMonitor);
          clearTimeout(timeoutId);
          return;
        }

        sleepTicks++;
        
        // Check if we've been sleeping long enough
        if (sleepTicks >= SLEEP_DURATION_TICKS) {
          clearInterval(tickMonitor);
          clearTimeout(timeoutId);
          bot.removeListener('wake', wakeHandler);
          
          if (!isResolved) {
            isResolved = true;
            
            try {
              bot.wake();
            } catch (error) {
              // Ignore wake errors
            }
            
            const isNowDay = !this.isNightTime(bot);
            if (isNowDay) {
              resolve(SkillResults.success(null, 'Slept successfully - it is now morning'));
            } else {
              resolve(SkillResults.success(null, 'Sleep completed but night was not skipped'));
            }
          }
        }
      }, 50); // Check every tick (50ms)
    });
  }

  private checkOtherPlayersSleep(bot: any): string {
    try {
      if (!bot.players) return 'Unable to check other players';
      
      const playerNames = Object.keys(bot.players);
      const awakePlayers: string[] = [];
      
      for (const name of playerNames) {
        if (name === bot.username) continue;
        
        const player = bot.players[name];
        const entity = player?.entity;
        
        if (entity && !(entity as any).isSleeping) {
          awakePlayers.push(name);
        }
      }
      
      if (awakePlayers.length > 0) {
        return `Players not sleeping: ${awakePlayers.join(', ')}`;
      } else {
        return 'All other players appear to be sleeping';
      }
    } catch (error) {
      return 'Unable to check other players sleep status';
    }
  }

  /**
   * Resource requirements for sleeping
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      environment: ['pathfinder'],
      blocks: ['bed'],
      conditions: ['Nighttime', 'No monsters nearby', 'Bed available']
    };
  }

  /**
   * Estimate execution time based on timeout
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const timeout = params.timeout || 15000;
    const navigationTime = 3000; // 3 seconds for navigation
    
    return navigationTime + timeout;
  }
}