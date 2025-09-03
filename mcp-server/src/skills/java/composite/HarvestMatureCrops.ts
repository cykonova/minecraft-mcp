import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';

import { CompositeSkill } from '../../CompositeSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../../ICompositeSkill.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../../decorators/skillDependency.js';
import { IAtomicSkill } from '../../IAtomicSkill.js';

export interface IHarvestMatureCropsParams {
  number?: number;
  radius?: number;
  cropTypes?: string[];
}

interface CropInfo {
  name: string;
  matureState: number;
  blockId?: number;
}

/**
 * Harvest mature crops around the bot
 * 
 * This composite skill handles the complete crop harvesting process:
 * 1. Scans the area for mature crops within the specified radius
 * 2. Creates an optimized harvesting plan to visit all mature crops
 * 3. Navigates to each crop location and breaks the mature crop blocks
 * 4. Collects any dropped items automatically
 * 
 * The skill supports multiple crop types including wheat, carrots, potatoes,
 * and beetroots, and can handle large farming areas efficiently.
 */
@autoResolveDependencies
@injectable()
export class HarvestMatureCrops extends CompositeSkill {
  readonly name = 'harvestMatureCrops';
  readonly description = 'Harvest mature crops in the surrounding area';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  readonly skillDependencies = ['moveToPosition', 'breakBlock', 'PickupItem'];

  // Dependencies injected via decorator
  @skillDependency({ name: 'moveToPosition' })
  private moveToPosition!: IAtomicSkill;

  @skillDependency({ name: 'breakBlock' })
  private breakBlock!: IAtomicSkill;

  @skillDependency({ name: 'PickupItem', optional: true })
  private pickupItem?: IAtomicSkill;

  readonly inputSchema = {
    type: 'object',
    properties: {
      number: {
        type: 'number',
        description: 'Maximum number of crops to harvest (default: 1000)',
        default: 1000,
        minimum: 1,
        maximum: 10000
      },
      radius: {
        type: 'number',
        description: 'Search radius around bot (default: 16)',
        default: 16,
        minimum: 1,
        maximum: 64
      },
      cropTypes: {
        type: 'array',
        description: 'Types of crops to harvest (default: all supported crops)',
        items: {
          type: 'string',
          enum: ['wheat', 'carrots', 'potatoes', 'beetroots']
        },
        default: ['wheat', 'carrots', 'potatoes', 'beetroots']
      }
    },
    required: []
  };

  private readonly defaultCropsInfo: CropInfo[] = [
    { name: 'wheat', matureState: 7 },
    { name: 'carrots', matureState: 7 },
    { name: 'potatoes', matureState: 7 },
    { name: 'beetroots', matureState: 3 }
  ];

  protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    const { number = 1000, radius = 16 } = params as IHarvestMatureCropsParams;
    
    const steps: Omit<ExecutionStep, 'id'>[] = [];

    // Step 1: Scan for mature crops
    steps.push({
      skillName: 'scanForCrops',
      description: `Scan for mature crops within ${radius} blocks`,
      params: { number, radius },
      estimatedTime: 3000, // 3 seconds to scan
      optional: false
    });

    // Step 2: Harvest all found crops (dynamic step count)
    steps.push({
      skillName: 'harvestAllCrops',
      description: 'Harvest all found mature crops',
      params: { number, radius },
      estimatedTime: Math.min(number * 2000, 300000), // 2s per crop, max 5 minutes
      optional: false
    });

    return steps;
  }

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    // Inject dependencies using the dependency injector
    const injector = require('../../decorators/skillDependency.js').SkillDependencyInjector.getInstance();
    injector.injectDependencies(this, dependencies);

    // Validate parameters
    const { number = 1000, radius = 16, cropTypes } = context.params as IHarvestMatureCropsParams;
    
    if (number < 1 || number > 10000) {
      return SkillResults.error('Number must be between 1 and 10000');
    }

    if (radius < 1 || radius > 64) {
      return SkillResults.error('Radius must be between 1 and 64');
    }

    this.log('info', `Starting to harvest crops within ${radius} blocks (max ${number} crops)`);

    // Custom execution instead of using base class steps
    return await this.executeHarvestProcess(context);
  }

  /**
   * Execute the harvest process directly
   */
  private async executeHarvestProcess(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { number = 1000, radius = 16, cropTypes } = params as IHarvestMatureCropsParams;

    try {
      // Step 1: Find mature crops
      const cropsInfo = this.getCropsInfo(bot, cropTypes);
      const matureCrops = await this.findMatureCrops(bot, cropsInfo, number, radius);

      if (matureCrops.length === 0) {
        return SkillResults.success(
          { harvestedCount: 0, cropsFound: 0 },
          'No mature crops found nearby'
        );
      }

      this.log('info', `Found ${matureCrops.length} mature crops to harvest`);

      if (signal?.aborted) {
        return SkillResults.error('Harvesting cancelled');
      }

      // Step 2: Harvest all crops
      const harvestResult = await this.harvestAllCrops(bot, matureCrops, signal, context);
      
      return harvestResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Harvesting failed: ${errorMessage}`);
    }
  }

  /**
   * Get crop information filtered by requested types
   */
  private getCropsInfo(bot: any, requestedTypes?: string[]): CropInfo[] {
    const cropsInfo = this.defaultCropsInfo.filter(crop => 
      !requestedTypes || requestedTypes.includes(crop.name)
    );

    // Add block IDs from bot registry
    return cropsInfo.map(crop => ({
      ...crop,
      blockId: bot.registry.blocksByName[crop.name]?.id
    })).filter(crop => crop.blockId); // Only include crops that exist in this version
  }

  /**
   * Find mature crops in the specified area
   */
  private async findMatureCrops(
    bot: any, 
    cropsInfo: CropInfo[], 
    maxNumber: number, 
    radius: number
  ): Promise<Vec3[]> {
    const matureCrops: Vec3[] = [];

    for (const cropInfo of cropsInfo) {
      if (!cropInfo.blockId) continue;

      const positions = bot.findBlocks({
        point: bot.entity.position,
        matching: (block: any) => 
          block.type === cropInfo.blockId && block.metadata === cropInfo.matureState,
        maxDistance: radius,
        count: maxNumber - matureCrops.length
      });

      matureCrops.push(...positions.map((pos: any) => new Vec3(pos.x, pos.y, pos.z)));

      if (matureCrops.length >= maxNumber) {
        break;
      }
    }

    // Sort by distance to optimize travel time
    const botPos = bot.entity.position;
    matureCrops.sort((a, b) => a.distanceTo(botPos) - b.distanceTo(botPos));

    return matureCrops.slice(0, maxNumber);
  }

  /**
   * Harvest all found crops
   */
  private async harvestAllCrops(bot: any, cropPositions: Vec3[], signal: AbortSignal | undefined, context: ISkillContext): Promise<SkillResult> {
    let harvestedCount = 0;
    let failedCount = 0;
    const harvestedCrops: { position: Vec3; cropType: string }[] = [];

    for (let i = 0; i < cropPositions.length; i++) {
      if (signal?.aborted) {
        return SkillResults.success(
          { 
            harvestedCount, 
            failedCount, 
            totalFound: cropPositions.length,
            cancelled: true
          },
          `Harvesting cancelled after ${harvestedCount} crops`
        );
      }

      const position = cropPositions[i];

      try {
        // Check if block still exists and is mature
        const block = bot.blockAt(position);
        if (!block || !this.isMatureCrop(block)) {
          this.log('debug', `Crop at ${position} is no longer mature, skipping`);
          continue;
        }

        // Move to the crop
        const moveResult = await this.moveToPosition.execute({
          bot,
          params: {
            x: position.x,
            y: position.y,
            z: position.z,
            range: 1
          },
          signal,
          metadata: { name: 'moveToPosition', edition: 'java' as const, category: 'verified' as const },
          serviceParams: context.serviceParams
        });

        if (!moveResult.success) {
          this.log('warn', `Failed to reach crop at ${position}: ${(moveResult as any).error}`);
          failedCount++;
          continue;
        }

        if (signal?.aborted) break;

        // Break the crop block
        const breakResult = await this.breakBlock.execute({
          bot,
          params: {
            x: position.x,
            y: position.y,
            z: position.z
          },
          signal,
          metadata: { name: 'breakBlock', edition: 'java' as const, category: 'verified' as const },
          serviceParams: context.serviceParams
        });

        if (breakResult.success) {
          harvestedCount++;
          harvestedCrops.push({
            position,
            cropType: block.name
          });

          this.log('debug', `Harvested ${block.name} at ${position} (${harvestedCount}/${cropPositions.length})`);

          // Brief pause to allow item drops
          await new Promise(resolve => setTimeout(resolve, 500));

          // Try to collect dropped items if skill is available
          if (this.pickupItem) {
            try {
              await this.pickupItem.execute({
                bot,
                params: {
                  itemName: this.getCropDropItems(block.name)[0] || 'wheat',
                  maxDistance: 3,
                  timeout: 2000
                },
                signal,
                metadata: { name: 'PickupItem', edition: 'java' as const, category: 'verified' as const },
                serviceParams: context.serviceParams
              });
            } catch (error) {
              // Don't fail the harvest if pickup fails
            }
          }
        } else {
          this.log('warn', `Failed to harvest crop at ${position}: ${(breakResult as any).error}`);
          failedCount++;
        }

      } catch (error) {
        this.log('warn', `Error harvesting crop at ${position}: ${error}`);
        failedCount++;
      }

      // Small delay between crops to avoid overwhelming the server
      if (i < cropPositions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const message = failedCount === 0 
      ? `Successfully harvested ${harvestedCount} crops`
      : `Harvested ${harvestedCount} crops with ${failedCount} failures`;

    return SkillResults.success(
      {
        harvestedCount,
        failedCount,
        totalFound: cropPositions.length,
        harvestedCrops: harvestedCrops.map(crop => ({
          x: crop.position.x,
          y: crop.position.y,
          z: crop.position.z,
          type: crop.cropType
        }))
      },
      message
    );
  }

  /**
   * Check if a block is a mature crop
   */
  private isMatureCrop(block: any): boolean {
    const cropInfo = this.defaultCropsInfo.find(crop => 
      block.name === crop.name && block.metadata === crop.matureState
    );
    return !!cropInfo;
  }

  /**
   * Get the items that drop from a specific crop type
   */
  private getCropDropItems(cropName: string): string[] {
    const dropMap: { [key: string]: string[] } = {
      wheat: ['wheat', 'wheat_seeds'],
      carrots: ['carrot'],
      potatoes: ['potato'],
      beetroots: ['beetroot', 'beetroot_seeds']
    };
    return dropMap[cropName] || [];
  }

  /**
   * Handle partial failure - continue if some crops fail
   */
  async handlePartialFailure(
    step: ExecutionStep,
    error: SkillResult,
    context: ISkillContext
  ): Promise<boolean> {
    // For harvesting, we want to continue even if individual crops fail
    if (step.skillName === 'harvestAllCrops') {
      this.log('warn', `Some crops failed to harvest, continuing with remainder`);
      return true;
    }

    // Default to parent behavior for other steps
    return await super.handlePartialFailure(step, error, context);
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      tools: ['hoe'], // Optional but helpful for farming
      environment: ['pathfinder'], // Need movement capability
      blocks: ['farmland', 'crops'] // Need access to farming area
    };
  }

  /**
   * Estimate execution time based on number of crops
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const { number = 1000, radius = 16 } = params as IHarvestMatureCropsParams;
    
    const scanTime = 3000; // 3 seconds to scan
    const harvestTime = Math.min(number * 2000, 300000); // 2s per crop, max 5 minutes
    const travelTime = radius * 100; // Rough estimate for travel
    
    return scanTime + harvestTime + travelTime;
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
    const { bot } = context;
    try {
      // Stop any active pathfinding
      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
      }
      this.log('info', 'Crop harvesting cancelled');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}