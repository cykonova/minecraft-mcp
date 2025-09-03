import { injectable } from 'tsyringe';

import { CompositeSkill } from '../../CompositeSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../../ICompositeSkill.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../../decorators/skillDependency.js';
import { IAtomicSkill } from '../../IAtomicSkill.js';

export interface IBuildSomethingParams {
  buildScript?: Array<BuildCommand>;
  code?: string;
}

export interface BuildCommand {
  command: 'setblock' | 'fill' | 'clone' | 'summon' | 'give' | 'raw';
  x?: number;
  y?: number;
  z?: number;
  x1?: number;
  y1?: number;
  z1?: number;
  x2?: number;
  y2?: number;
  z2?: number;
  dx?: number;
  dy?: number;
  dz?: number;
  block?: string;
  entity?: string;
  item?: string;
  count?: number;
  mode?: string;
  raw?: string;
}

/**
 * Build structures in Minecraft using either a JSON script with commands or arbitrary JavaScript code
 * 
 * Enhanced composite skill that provides two powerful building modes:
 * 
 * 1. Build Script Mode: Execute structured building commands
 *    - setblock: Place single blocks
 *    - fill: Fill regions with blocks
 *    - clone: Copy regions
 *    - summon: Spawn entities
 *    - give: Give items to the bot
 *    - raw: Execute arbitrary commands
 * 
 * 2. Code Mode: Execute JavaScript code with building functions
 *    - Full access to building functions and bot state
 *    - Loop and conditional building logic
 *    - Advanced procedural generation
 * 
 * The skill automatically checks for operator permissions and provides
 * detailed feedback on build progress and errors.
 */
@autoResolveDependencies
@injectable()
export class BuildSomething extends CompositeSkill {
  readonly name = 'buildSomething';
  readonly description = 'Build structures using commands or JavaScript code (requires operator permissions)';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  readonly skillDependencies = ['sendChat'];

  // Optional dependencies for enhanced building
  @skillDependency({ name: 'sendChat', optional: true })
  private sendChat?: IAtomicSkill;

  readonly inputSchema = {
    type: 'object',
    properties: {
      buildScript: {
        type: 'array',
        description: 'Array of building commands to execute (use this OR code, not both)',
        items: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              enum: ['setblock', 'fill', 'clone', 'summon', 'give', 'raw'],
              description: 'The command type to execute'
            }
          },
          required: ['command']
        },
        minItems: 1,
        maxItems: 1000
      },
      code: {
        type: 'string',
        description: 'JavaScript code to execute for building (use this OR buildScript, not both)',
        minLength: 1,
        maxLength: 10000
      }
    },
    required: [] // Either buildScript or code is required, validated in execution
  };

  protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    const { buildScript, code } = params as IBuildSomethingParams;
    
    const steps: Omit<ExecutionStep, 'id'>[] = [];

    // Step 1: Check permissions
    steps.push({
      skillName: 'checkPermissions',
      description: 'Check if bot has building permissions',
      params: {},
      estimatedTime: 2000, // 2 seconds
      optional: false
    });

    // Step 2: Execute building
    if (code) {
      steps.push({
        skillName: 'executeCode',
        description: 'Execute JavaScript building code',
        params: { code },
        estimatedTime: 10000, // 10 seconds (variable based on code)
        optional: false
      });
    } else if (buildScript) {
      steps.push({
        skillName: 'executeBuildScript',
        description: `Execute ${buildScript.length} building commands`,
        params: { buildScript },
        estimatedTime: Math.min(buildScript.length * 500, 30000), // 0.5s per command, max 30s
        optional: false
      });
    }

    return steps;
  }

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    // Inject dependencies using the dependency injector
    const injector = require('../../decorators/skillDependency.js').SkillDependencyInjector.getInstance();
    injector.injectDependencies(this, dependencies);

    // Validate parameters
    const { buildScript, code } = context.params as IBuildSomethingParams;
    
    if (!buildScript && !code) {
      return SkillResults.error('You must provide either buildScript (array of commands) or code (JavaScript string)');
    }

    if (buildScript && code) {
      return SkillResults.error('Provide either buildScript OR code, not both');
    }

    this.log('info', 'Starting building process...');

    // Custom execution instead of using base class (since this skill has complex logic)
    return await this.executeBuildProcess(context);
  }

  /**
   * Execute the building process directly
   */
  private async executeBuildProcess(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { buildScript, code } = params as IBuildSomethingParams;

    try {
      // Check permissions first
      const hasPermissions = await this.checkPermissions(bot);
      if (!hasPermissions) {
        return SkillResults.error(
          'Cheats are not enabled on this server. You need operator permissions to use build commands.'
        );
      }

      if (signal?.aborted) {
        return SkillResults.error('Building cancelled');
      }

      // Execute the appropriate building mode
      if (code) {
        return await this.executeCodeMode(bot, code, signal);
      } else if (buildScript) {
        return await this.executeBuildScript(bot, buildScript, signal);
      }

      return SkillResults.error('No build instructions provided');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Building failed: ${errorMessage}`);
    }
  }

  /**
   * Check if the bot has building permissions
   */
  private async checkPermissions(bot: any): Promise<boolean> {
    const pos = bot.entity.position;
    const testCommand = `/tp ${bot.username} ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`;

    return new Promise((resolve) => {
      let responded = false;

      const checkResponse = (message: any) => {
        const text = message.toString();

        if (text.includes('permission') || text.includes('allowed') || text.includes('operator')) {
          responded = true;
          bot.removeListener('message', checkResponse);
          resolve(false);
        } else if (text.includes('Teleported') || text.includes(bot.username)) {
          responded = true;
          bot.removeListener('message', checkResponse);
          resolve(true);
        }
      };

      bot.on('message', checkResponse);
      bot.chat(testCommand);

      setTimeout(() => {
        if (!responded) {
          bot.removeListener('message', checkResponse);
          resolve(true); // Assume success if no error message
        }
      }, 2000);
    });
  }

  /**
   * Execute JavaScript code building mode
   */
  private async executeCodeMode(bot: any, code: string, signal?: AbortSignal): Promise<SkillResult> {
    this.log('info', 'Executing custom building code...');

    const pos = bot.entity.position;
    let commandsExecuted = 0;

    const context = {
      bot,
      pos,
      
      setBlock: (x: number, y: number, z: number, block: string) => {
        const command = `/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${block}`;
        bot.chat(command);
        commandsExecuted++;
        return command;
      },

      fill: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string, mode?: string) => {
        let command = `/fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${block}`;
        if (mode) command += ` ${mode}`;
        bot.chat(command);
        commandsExecuted++;
        return command;
      },

      clone: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, dx: number, dy: number, dz: number, mode?: string) => {
        let command = `/clone ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${Math.floor(dx)} ${Math.floor(dy)} ${Math.floor(dz)}`;
        if (mode) command += ` ${mode}`;
        bot.chat(command);
        commandsExecuted++;
        return command;
      },

      summon: (entity: string, x?: number, y?: number, z?: number) => {
        let command = `/summon ${entity}`;
        if (x !== undefined && y !== undefined && z !== undefined) {
          command += ` ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
        }
        bot.chat(command);
        commandsExecuted++;
        return command;
      },

      give: (item: string, count: number = 1) => {
        const command = `/give ${bot.username} ${item} ${count}`;
        bot.chat(command);
        commandsExecuted++;
        return command;
      },

      execute: (command: string) => {
        bot.chat(command);
        commandsExecuted++;
        return command;
      },

      wait: async (ticks: number) => {
        await bot.waitForTicks(ticks);
      },

      Math,
      
      shouldStop: () => signal?.aborted || false,
      
      log: (message: string) => {
        this.log('info', message);
      }
    };

    try {
      const buildFunction = new Function(
        ...Object.keys(context),
        `
        // User building code starts here
        ${code}
        // User building code ends here
        `
      );

      await buildFunction(...Object.values(context));

      return SkillResults.success(
        { commandsExecuted },
        `Successfully executed building code with ${commandsExecuted} commands`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to execute building code: ${errorMessage}`);
    }
  }

  /**
   * Execute build script mode
   */
  private async executeBuildScript(bot: any, buildScript: BuildCommand[], signal?: AbortSignal): Promise<SkillResult> {
    this.log('info', `Executing build script with ${buildScript.length} commands...`);

    let successCount = 0;
    let failCount = 0;
    const results: string[] = [];

    for (let i = 0; i < buildScript.length; i++) {
      if (signal?.aborted) {
        return SkillResults.success(
          { successCount, failCount, totalCommands: i },
          `Building interrupted. Completed ${successCount} commands successfully.`
        );
      }

      const cmd = buildScript[i];

      try {
        const result = await this.executeCommand(bot, cmd);
        if (result.success) {
          successCount++;
          results.push(`✓ Command ${i + 1}: ${result.message}`);
        } else {
          failCount++;
          results.push(`✗ Command ${i + 1}: ${result.message}`);
        }
      } catch (error) {
        failCount++;
        results.push(`✗ Command ${i + 1}: Error - ${error}`);
      }

      // Small delay between commands
      await bot.waitForTicks(2);
    }

    const success = failCount === 0;
    const message = `Build script completed. Success: ${successCount}, Failed: ${failCount}`;

    return success 
      ? SkillResults.success({ successCount, failCount, results }, message)
      : SkillResults.error(message, 'PARTIAL_FAILURE', { successCount, failCount, results });
  }

  /**
   * Execute a single build command
   */
  private async executeCommand(bot: any, cmd: BuildCommand): Promise<{ success: boolean; message: string }> {
    const command = cmd.command?.toLowerCase();

    switch (command) {
      case 'setblock':
        return this.executeSetBlock(bot, cmd);
      case 'fill':
        return this.executeFill(bot, cmd);
      case 'clone':
        return this.executeClone(bot, cmd);
      case 'summon':
        return this.executeSummon(bot, cmd);
      case 'give':
        return this.executeGive(bot, cmd);
      case 'raw':
        if (cmd.raw) {
          bot.chat(cmd.raw);
          return { success: true, message: `Executed: ${cmd.raw}` };
        }
        return { success: false, message: 'Missing raw command' };
      default:
        return { success: false, message: `Unknown command: ${command}` };
    }
  }

  private async executeSetBlock(bot: any, cmd: BuildCommand): Promise<{ success: boolean; message: string }> {
    const { x, y, z, block } = cmd;
    if (x === undefined || y === undefined || z === undefined || !block) {
      return { success: false, message: 'setblock requires x, y, z, and block' };
    }
    const command = `/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${block}`;
    bot.chat(command);
    return { success: true, message: `Placed ${block} at ${x}, ${y}, ${z}` };
  }

  private async executeFill(bot: any, cmd: BuildCommand): Promise<{ success: boolean; message: string }> {
    const { x1, y1, z1, x2, y2, z2, block, mode } = cmd;
    if (x1 === undefined || y1 === undefined || z1 === undefined ||
        x2 === undefined || y2 === undefined || z2 === undefined || !block) {
      return { success: false, message: 'fill requires x1, y1, z1, x2, y2, z2, and block' };
    }
    let command = `/fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${block}`;
    if (mode) command += ` ${mode}`;
    bot.chat(command);
    const volume = Math.abs((x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1));
    return { success: true, message: `Filled ${volume} blocks with ${block}` };
  }

  private async executeClone(bot: any, cmd: BuildCommand): Promise<{ success: boolean; message: string }> {
    const { x1, y1, z1, x2, y2, z2, dx, dy, dz, mode } = cmd;
    if (x1 === undefined || y1 === undefined || z1 === undefined ||
        x2 === undefined || y2 === undefined || z2 === undefined ||
        dx === undefined || dy === undefined || dz === undefined) {
      return { success: false, message: 'clone requires x1, y1, z1, x2, y2, z2, dx, dy, dz' };
    }
    let command = `/clone ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${Math.floor(dx)} ${Math.floor(dy)} ${Math.floor(dz)}`;
    if (mode) command += ` ${mode}`;
    bot.chat(command);
    return { success: true, message: `Cloned region to ${dx}, ${dy}, ${dz}` };
  }

  private async executeSummon(bot: any, cmd: BuildCommand): Promise<{ success: boolean; message: string }> {
    const { entity, x, y, z } = cmd;
    if (!entity) {
      return { success: false, message: 'summon requires entity type' };
    }
    let command = `/summon ${entity}`;
    if (x !== undefined && y !== undefined && z !== undefined) {
      command += ` ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
    }
    bot.chat(command);
    return { success: true, message: `Summoned ${entity}` };
  }

  private async executeGive(bot: any, cmd: BuildCommand): Promise<{ success: boolean; message: string }> {
    const { item, count = 1 } = cmd;
    if (!item) {
      return { success: false, message: 'give requires item name' };
    }
    const command = `/give ${bot.username} ${item} ${count}`;
    bot.chat(command);
    return { success: true, message: `Gave ${count} ${item}` };
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      permissions: ['operator'], // Need operator/cheats enabled
      environment: ['commands'] // Need command execution capability
    };
  }

  /**
   * Estimate execution time based on build complexity
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const { buildScript, code } = params as IBuildSomethingParams;
    
    if (code) {
      return 15000; // 15 seconds for code mode (variable)
    } else if (buildScript) {
      return Math.min(buildScript.length * 500 + 5000, 60000); // 0.5s per command + setup, max 1 minute
    }
    
    return 10000; // Default 10 seconds
  }

  /**
   * This skill can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    this.log('info', 'Building cancelled - stopping command execution');
  }
}