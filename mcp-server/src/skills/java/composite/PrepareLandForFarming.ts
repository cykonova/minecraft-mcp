import { injectable } from 'tsyringe';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';

import { CompositeSkill } from '../../CompositeSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../../ICompositeSkill.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../../decorators/skillDependency.js';
import { IAtomicSkill } from '../../IAtomicSkill.js';

export interface IPrepareLandForFarmingParams {
  waterRadius?: number;
  farmRadius?: number;
  maxBlocks?: number;
  plantSeeds?: boolean;
}

interface TillableBlock {
  position: Vec3;
  block: any;
  distanceFromWater: number;
}

/**
 * Prepare land for farming by tilling dirt/grass near water sources
 * 
 * This composite skill handles the complete land preparation process:
 * 1. Finds nearby water sources
 * 2. Identifies tillable blocks (dirt/grass) within 4 blocks of water
 * 3. Navigates to each tillable block and tills it with a hoe
 * 4. Optionally plants seeds on the prepared farmland
 * 
 * The skill uses a breadth-first search algorithm to efficiently find
 * all tillable blocks within the optimal distance from water sources,
 * ensuring crops will have proper irrigation.
 */
@autoResolveDependencies
@injectable()
export class PrepareLandForFarming extends CompositeSkill {
  readonly name = 'prepareLandForFarming';
  readonly description = 'Prepare land for farming by tilling soil near water sources';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  readonly skillDependencies = ['moveToPosition', 'equipItem', 'useItemOnBlockOrEntity', 'placeBlock'];

  // Dependencies injected via decorator
  @skillDependency({ name: 'moveToPosition' })
  private moveToPosition!: IAtomicSkill;

  @skillDependency({ name: 'equipItem' })
  private equipItem!: IAtomicSkill;

  @skillDependency({ name: 'useItemOnBlockOrEntity' })
  private useItemOnBlock!: IAtomicSkill;

  @skillDependency({ name: 'placeBlock', optional: true })
  private placeBlock?: IAtomicSkill;

  readonly inputSchema = {
    type: 'object',
    properties: {
      waterRadius: {
        type: 'number',
        description: 'Radius to search for water sources (default: 16)',
        default: 16,
        minimum: 1,
        maximum: 32
      },
      farmRadius: {
        type: 'number',
        description: 'Maximum distance from water to till (default: 4)',
        default: 4,
        minimum: 1,
        maximum: 8
      },
      maxBlocks: {
        type: 'number',
        description: 'Maximum number of blocks to till (default: 100)',
        default: 100,
        minimum: 1,
        maximum: 1000
      },
      plantSeeds: {
        type: 'boolean',
        description: 'Whether to plant seeds after tilling (default: true)',
        default: true
      }
    },
    required: []
  };

  protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    const { waterRadius = 16, farmRadius = 4, maxBlocks = 100, plantSeeds = true } = params as IPrepareLandForFarmingParams;
    
    const steps: Omit<ExecutionStep, 'id'>[] = [];

    // Step 1: Find water and identify tillable blocks
    steps.push({
      skillName: 'findTillableBlocks',
      description: `Find tillable blocks near water (radius: ${waterRadius})`,
      params: { waterRadius, farmRadius, maxBlocks },
      estimatedTime: 5000, // 5 seconds to scan
      optional: false
    });

    // Step 2: Equip a hoe for tilling
    steps.push({
      skillName: 'equipItem',
      description: 'Equip a hoe for tilling',
      params: { name: 'hoe' },
      estimatedTime: 2000, // 2 seconds
      optional: false
    });

    // Step 3: Till all identified blocks
    steps.push({
      skillName: 'tillAllBlocks',
      description: 'Till all identified farmable blocks',
      params: { maxBlocks },
      estimatedTime: Math.min(maxBlocks * 3000, 300000), // 3s per block, max 5 minutes
      optional: false
    });

    // Step 4: Plant seeds (optional)
    if (plantSeeds) {
      steps.push({
        skillName: 'plantSeeds',
        description: 'Plant seeds on tilled farmland',
        params: { farmRadius },
        estimatedTime: 10000, // 10 seconds
        optional: true, // Don't fail if no seeds available
      });
    }

    return steps;
  }

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    // Inject dependencies using the dependency injector
    const injector = require('../../decorators/skillDependency.js').SkillDependencyInjector.getInstance();
    injector.injectDependencies(this, dependencies);

    // Validate parameters
    const { waterRadius = 16, farmRadius = 4, maxBlocks = 100, plantSeeds = true } = context.params as IPrepareLandForFarmingParams;
    
    if (waterRadius < 1 || waterRadius > 32) {
      return SkillResults.error('Water radius must be between 1 and 32');
    }

    if (farmRadius < 1 || farmRadius > 8) {
      return SkillResults.error('Farm radius must be between 1 and 8');
    }

    this.log('info', `Preparing farmland within ${farmRadius} blocks of water (search radius: ${waterRadius})`);

    // Custom execution instead of using base class steps
    return await this.executeFarmingPreparation(context);
  }

  /**
   * Execute the farming preparation process directly
   */
  private async executeFarmingPreparation(context: ISkillContext): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { waterRadius = 16, farmRadius = 4, maxBlocks = 100, plantSeeds = true } = params as IPrepareLandForFarmingParams;

    try {
      // Step 1: Find tillable blocks
      const tillableBlocks = this.findTillableBlocks(bot, waterRadius, farmRadius, maxBlocks);
      
      if (tillableBlocks.length === 0) {
        return SkillResults.success(
          { tilledCount: 0, blocksFound: 0 },
          'No suitable blocks found for farming near water sources'
        );
      }

      this.log('info', `Found ${tillableBlocks.length} blocks suitable for farming`);

      if (signal?.aborted) {
        return SkillResults.error('Land preparation cancelled');
      }

      // Step 2: Equip a hoe
      const hoeResult = await this.equipItem.execute({
        bot,
        params: { name: 'hoe' },
        signal,
        metadata: { name: 'equipItem', edition: 'java' as const, category: 'verified' as const },
        serviceParams: context.serviceParams
      });

      if (!hoeResult.success) {
        return SkillResults.error(`Failed to equip hoe: ${(hoeResult as any).error}`);
      }

      if (signal?.aborted) {
        return SkillResults.error('Land preparation cancelled');
      }

      // Step 3: Till all blocks
      const tillingResult = await this.tillAllBlocks(bot, tillableBlocks, signal, context);
      
      if (!tillingResult.success) {
        return tillingResult;
      }

      // Step 4: Plant seeds if requested
      let seedsPlanted = 0;
      if (plantSeeds) {
        try {
          seedsPlanted = await this.plantSeedsOnFarmland(bot, farmRadius, signal, context);
        } catch (error) {
          // Don't fail the whole operation if seeding fails
          this.log('warn', `Failed to plant seeds: ${error}`);
        }
      }

      const tilledCount = (tillingResult.data as any).tilledCount || 0;
      const failedCount = (tillingResult.data as any).failedCount || 0;

      const message = plantSeeds 
        ? `Prepared ${tilledCount} farmland blocks and planted ${seedsPlanted} seeds${failedCount > 0 ? ` (${failedCount} failures)` : ''}`
        : `Prepared ${tilledCount} farmland blocks${failedCount > 0 ? ` (${failedCount} failures)` : ''}`;

      return SkillResults.success(
        {
          tilledCount,
          failedCount,
          seedsPlanted,
          totalFound: tillableBlocks.length
        },
        message
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Land preparation failed: ${errorMessage}`);
    }
  }

  /**
   * Find tillable blocks near water sources using breadth-first search
   */
  private findTillableBlocks(bot: any, waterRadius: number, farmRadius: number, maxBlocks: number): TillableBlock[] {
    const mcData = minecraftData(bot.version);
    
    // Find water blocks
    const waterBlocks = bot.findBlocks({
      matching: mcData.blocksByName.water.id,
      maxDistance: waterRadius,
      count: 100
    }).map((pos: any) => bot.blockAt(pos)).filter(Boolean);

    if (waterBlocks.length === 0) {
      this.log('warn', 'No water sources found nearby');
      return [];
    }

    this.log('debug', `Found ${waterBlocks.length} water blocks`);

    // Filter water blocks that have adjacent land
    const adjacentWaterBlocks = waterBlocks.filter((waterBlock: any) => 
      this.hasAdjacentLand(bot, waterBlock.position)
    );

    this.log('debug', `Found ${adjacentWaterBlocks.length} water blocks with adjacent land`);

    // Use breadth-first search to find tillable blocks
    const queue: { block: any; distance: number }[] = adjacentWaterBlocks.map((block: any) => ({
      block,
      distance: 0
    }));

    const visited = new Set<string>();
    const tillableBlocks: TillableBlock[] = [];

    const airId = mcData.blocksByName.air.id;
    const grassId = mcData.blocksByName.grass?.id;
    const shortGrassId = mcData.blocksByName.short_grass?.id;
    const tallGrassId = mcData.blocksByName.tall_grass?.id;

    while (queue.length > 0 && tillableBlocks.length < maxBlocks) {
      const { block, distance } = queue.shift()!;
      const blockKey = block.position.toString();

      if (visited.has(blockKey)) continue;
      visited.add(blockKey);

      // If it's a dirt or grass block within farm radius of water, it's tillable
      if (
        distance > 0 &&
        distance <= farmRadius &&
        (block.type === mcData.blocksByName.dirt.id || block.type === mcData.blocksByName.grass_block.id)
      ) {
        const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
        
        // Check if there's space above for crops
        if (blockAbove && (
          blockAbove.type === airId ||
          blockAbove.type === grassId ||
          blockAbove.type === shortGrassId ||
          blockAbove.type === tallGrassId
        )) {
          tillableBlocks.push({
            position: block.position,
            block,
            distanceFromWater: distance
          });
        }
      }

      // Add neighbors to queue if within range
      if (distance < farmRadius) {
        const neighbors = this.getNeighborBlocks(bot, block.position);
        for (const neighbor of neighbors) {
          const neighborKey = neighbor.position.toString();
          if (!visited.has(neighborKey)) {
            queue.push({ block: neighbor, distance: distance + 1 });
          }
        }
      }
    }

    // Sort by distance from water (closer blocks first)
    tillableBlocks.sort((a, b) => a.distanceFromWater - b.distanceFromWater);

    return tillableBlocks;
  }

  /**
   * Check if a block has adjacent land (dirt or grass)
   */
  private hasAdjacentLand(bot: any, position: Vec3): boolean {
    const mcData = minecraftData(bot.version);
    const offsets = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 }
    ];

    return offsets.some(offset => {
      const newPos = position.plus(new Vec3(offset.x, offset.y, offset.z));
      const block = bot.blockAt(newPos);
      return block && (
        block.type === mcData.blocksByName.dirt.id ||
        block.type === mcData.blocksByName.grass_block.id
      );
    });
  }

  /**
   * Get neighboring blocks (only horizontal neighbors)
   */
  private getNeighborBlocks(bot: any, position: Vec3): any[] {
    const offsets = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 }
    ];

    return offsets
      .map(offset => {
        const newPos = position.plus(new Vec3(offset.x, offset.y, offset.z));
        return bot.blockAt(newPos);
      })
      .filter(block => block && block.position.y === position.y);
  }

  /**
   * Till all identified blocks
   */
  private async tillAllBlocks(bot: any, tillableBlocks: TillableBlock[], signal: AbortSignal | undefined, context: ISkillContext): Promise<SkillResult> {
    let tilledCount = 0;
    let failedCount = 0;

    for (let i = 0; i < tillableBlocks.length; i++) {
      if (signal?.aborted) {
        return SkillResults.success(
          { tilledCount, failedCount, cancelled: true },
          `Land preparation cancelled after tilling ${tilledCount} blocks`
        );
      }

      const { position } = tillableBlocks[i];

      try {
        // Move to the block
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
          this.log('warn', `Failed to reach block at ${position}: ${(moveResult as any).error}`);
          failedCount++;
          continue;
        }

        if (signal?.aborted) break;

        // Use hoe on the block to till it
        const tillResult = await this.useItemOnBlock.execute({
          bot,
          params: {
            item: 'hoe',
            target: 'dirt' // Will match dirt or grass
          },
          signal,
          metadata: { name: 'useItemOnBlockOrEntity', edition: 'java' as const, category: 'verified' as const },
          serviceParams: context.serviceParams
        });

        if (tillResult.success) {
          tilledCount++;
          this.log('debug', `Tilled block at ${position} (${tilledCount}/${tillableBlocks.length})`);
        } else {
          failedCount++;
          this.log('warn', `Failed to till block at ${position}: ${(tillResult as any).error}`);
        }

      } catch (error) {
        failedCount++;
        this.log('warn', `Error tilling block at ${position}: ${error}`);
      }

      // Small delay between tilling operations
      if (i < tillableBlocks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const message = failedCount === 0
      ? `Successfully tilled ${tilledCount} blocks`
      : `Tilled ${tilledCount} blocks with ${failedCount} failures`;

    return SkillResults.success({ tilledCount, failedCount }, message);
  }

  /**
   * Plant seeds on farmland blocks
   */
  private async plantSeedsOnFarmland(bot: any, searchRadius: number, signal: AbortSignal | undefined, context: ISkillContext): Promise<number> {
    const mcData = minecraftData(bot.version);
    const farmlandId = mcData.blocksByName.farmland.id;
    const airId = mcData.blocksByName.air.id;

    // Find farmland blocks
    const farmlandPositions = bot.findBlocks({
      point: bot.entity.position,
      matching: farmlandId,
      maxDistance: searchRadius,
      count: 100
    });

    if (farmlandPositions.length === 0) {
      this.log('debug', 'No farmland blocks found for planting');
      return 0;
    }

    // Check if we have seeds
    const seedTypes = ['wheat_seeds', 'carrot', 'potato', 'beetroot_seeds'];
    const availableSeeds = seedTypes.find(seedType => {
      const item = bot.inventory.items().find((item: any) => item.name === seedType);
      return item && item.count > 0;
    });

    if (!availableSeeds) {
      this.log('debug', 'No seeds available for planting');
      return 0;
    }

    let seedsPlanted = 0;

    for (const position of farmlandPositions.slice(0, 50)) { // Limit to 50 blocks
      if (signal?.aborted) break;

      try {
        const farmlandBlock = bot.blockAt(position);
        const blockAbove = bot.blockAt(position.offset(0, 1, 0));

        // Check if there's air above and farmland is not already planted
        if (blockAbove && blockAbove.type === airId) {
          // Place seed on the farmland
          if (this.placeBlock) {
            const plantResult = await this.placeBlock.execute({
              bot,
              params: {
                x: position.x,
                y: position.y + 1,
                z: position.z,
                blockName: availableSeeds
              },
              signal,
              metadata: { name: 'placeBlock', edition: 'java' as const, category: 'verified' as const },
              serviceParams: context.serviceParams
            });

            if (plantResult.success) {
              seedsPlanted++;
            }
          }
        }
      } catch (error) {
        // Continue with other blocks if one fails
      }
    }

    return seedsPlanted;
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      tools: ['hoe'], // Need a hoe for tilling
      items: ['wheat_seeds'], // Optional seeds for planting
      environment: ['pathfinder'], // Need movement capability
      blocks: ['water', 'dirt', 'grass_block'] // Need water and tillable blocks
    };
  }

  /**
   * Estimate execution time based on maximum blocks
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const { maxBlocks = 100, plantSeeds = true } = params as IPrepareLandForFarmingParams;
    
    const scanTime = 5000; // 5 seconds to scan
    const equipTime = 2000; // 2 seconds to equip hoe
    const tillingTime = Math.min(maxBlocks * 3000, 300000); // 3s per block, max 5 minutes
    const plantingTime = plantSeeds ? 10000 : 0; // 10 seconds for planting
    
    return scanTime + equipTime + tillingTime + plantingTime;
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
      this.log('info', 'Land preparation cancelled');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}