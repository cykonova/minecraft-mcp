import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const { GoalFollow, GoalNear } = mineflayer_pathfinder.goals;
const { Movements } = mineflayer_pathfinder;

export interface IGoToPlayerParams {
  userName: string;
  distance?: number;
  keepFollowing?: boolean;
  timeout?: number;
}

/**
 * Atomic skill for moving to a specific player
 * 
 * This skill locates a player by name and moves the bot to them:
 * - Finds the closest player with the specified name
 * - Uses pathfinding to navigate to them
 * - Optionally follows them continuously
 * - Handles player not found scenarios
 */
@injectable()
export class GoToPlayer extends AtomicSkill {
  readonly name = 'goToSomeone';
  readonly description = 'Goes to someone to get near them or follow them';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['userName'],
    properties: {
      userName: {
        type: 'string',
        description: 'The name of the person to go to or follow',
        minLength: 1,
        maxLength: 16
      },
      distance: {
        type: 'number',
        description: 'The desired distance to get within the person (default: 3)',
        default: 3,
        minimum: 1,
        maximum: 10
      },
      keepFollowing: {
        type: 'boolean',
        description: 'Whether to keep following the person after reaching them (default: false)',
        default: false
      },
      timeout: {
        type: 'number',
        description: 'Maximum time in milliseconds to spend following (default: 300000)',
        default: 300000,
        minimum: 5000,
        maximum: 600000
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { userName, distance = 3, keepFollowing = false, timeout = 300000 } = params as IGoToPlayerParams;

    // Check if pathfinder is available
    if (!(bot as any).pathfinder) {
      return SkillResults.error('Pathfinder plugin not available');
    }

    // Find the target player
    const targetPlayer = this.findPlayerByName(bot, userName);
    if (!targetPlayer) {
      return SkillResults.error(`Player '${userName}' not found in the world`);
    }

    const targetDistance = Math.max(1, distance); // Ensure distance is at least 1
    this.log('info', `Moving to player '${userName}' (distance: ${targetDistance})`);

    try {
      if (keepFollowing) {
        // Continuous following mode
        return await this.followPlayer(bot, targetPlayer, targetDistance, timeout, signal);
      } else {
        // One-time movement to player
        return await this.moveToPlayer(bot, targetPlayer, targetDistance, signal);
      }

    } catch (error) {
      // Stop any ongoing pathfinding
      try {
        (bot as any).pathfinder.setGoal(null);
      } catch (stopError) {
        // Ignore stop errors
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to go to player: ${errorMessage}`);
    }
  }

  /**
   * Find a player by name in the world
   */
  private findPlayerByName(bot: any, name: string): any {
    const players = Object.values(bot.players).filter((player: any) => 
      player && player.entity && player.username.toLowerCase() === name.toLowerCase()
    );
    
    if (players.length === 0) {
      return null;
    }

    // If multiple players with same name (unlikely), find closest
    if (players.length > 1) {
      const botPos = bot.entity.position;
      return players.reduce((closest: any, player: any) => {
        const playerDist = botPos.distanceTo(player.entity.position);
        const closestDist = botPos.distanceTo(closest.entity.position);
        return playerDist < closestDist ? player : closest;
      });
    }

    return players[0];
  }

  /**
   * Move to a player once
   */
  private async moveToPlayer(bot: any, targetPlayer: any, distance: number, signal?: AbortSignal): Promise<SkillResult> {
    const targetPos = targetPlayer.entity.position;
    const currentDistance = bot.entity.position.distanceTo(targetPos);

    // Check if already within range
    if (currentDistance <= distance) {
      return SkillResults.success(
        null, 
        `Already within range of ${targetPlayer.username} (distance: ${currentDistance.toFixed(2)})`
      );
    }

    // Set up pathfinding goal
    const goal = new GoalNear(targetPos.x, targetPos.y, targetPos.z, distance);
    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);

    // Execute movement with signal checking
    const movePromise = bot.pathfinder.goto(goal);
    
    // Check for cancellation while moving
    const checkCancellation = async () => {
      while (bot.pathfinder.isMoving()) {
        if (signal?.aborted) {
          bot.pathfinder.setGoal(null);
          throw new Error('Movement cancelled');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    await Promise.race([movePromise, checkCancellation()]);

    // Check final distance
    const finalDistance = bot.entity.position.distanceTo(targetPlayer.entity.position);
    if (finalDistance <= distance) {
      return SkillResults.success(
        null, 
        `Successfully moved to ${targetPlayer.username} (final distance: ${finalDistance.toFixed(2)})`
      );
    } else {
      return SkillResults.error(
        `Movement completed but not within range (distance: ${finalDistance.toFixed(2)}, required: ${distance})`
      );
    }
  }

  /**
   * Follow a player continuously
   */
  private async followPlayer(
    bot: any, 
    targetPlayer: any, 
    distance: number, 
    timeout: number, 
    signal?: AbortSignal
  ): Promise<SkillResult> {
    // Set up follow goal
    const goal = new GoalFollow(targetPlayer.entity, distance);
    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);
    
    this.log('info', `Starting to follow ${targetPlayer.username} at distance ${distance}`);
    bot.pathfinder.setGoal(goal);

    const startTime = Date.now();
    let lastUpdateTime = startTime;
    let lastPlayerPosition = targetPlayer.entity.position.clone();

    while (Date.now() - startTime < timeout) {
      // Check for cancellation
      if (signal?.aborted) {
        bot.pathfinder.setGoal(null);
        return SkillResults.success(null, 'Following cancelled');
      }

      // Check if player still exists
      const currentPlayer = this.findPlayerByName(bot, targetPlayer.username);
      if (!currentPlayer) {
        bot.pathfinder.setGoal(null);
        return SkillResults.error(`Player ${targetPlayer.username} left the world`);
      }

      // Update follow goal if player moved significantly
      const currentPlayerPos = currentPlayer.entity.position;
      if (lastPlayerPosition.distanceTo(currentPlayerPos) > 5) {
        const newGoal = new GoalFollow(currentPlayer.entity, distance);
        bot.pathfinder.setGoal(newGoal);
        lastPlayerPosition = currentPlayerPos.clone();
      }

      // Emit periodic updates
      if (Date.now() - lastUpdateTime > 5000) { // Every 5 seconds
        const currentDistance = bot.entity.position.distanceTo(currentPlayerPos);
        this.log('debug', `Following ${targetPlayer.username} (distance: ${currentDistance.toFixed(2)})`);
        lastUpdateTime = Date.now();
      }

      await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
    }

    // Following timed out
    bot.pathfinder.setGoal(null);
    return SkillResults.success(
      null, 
      `Finished following ${targetPlayer.username} after ${Math.round(timeout / 1000)} seconds`
    );
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      environment: ['pathfinder'],
      permissions: [] // No special permissions needed
    };
  }

  /**
   * Estimate execution time based on following mode
   */
  estimateExecutionTime(params: Record<string, any>): number {
    if (params.keepFollowing) {
      return Math.min(params.timeout || 300000, 600000); // Following duration
    } else {
      return 15000; // 15 seconds for one-time movement
    }
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