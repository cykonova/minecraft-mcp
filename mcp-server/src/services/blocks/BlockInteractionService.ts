import { injectable, singleton } from 'tsyringe';
import { Vec3 } from 'vec3';
import { 
  IBlockInteractionService, 
  BlockProperties, 
  MovementContext,
  BlockInteractionOptions,
  PlaceBlockOptions,
  BreakBlockOptions,
  BlockValidationResult,
  BlockSearchOptions
} from './IBlockInteractionService.js';
import { UnifiedBot } from '../../bots/UnifiedBot.js';

/**
 * Comprehensive block interaction service that handles all block-related operations
 * Combines block property lookups with actual block interaction logic
 */
@injectable()
@singleton()
export class BlockInteractionService implements IBlockInteractionService {
  private blocks: Map<number, BlockProperties> = new Map();
  private blocksByName: Map<string, BlockProperties> = new Map();
  private version: string;

  constructor() {
    this.version = '1.20'; // Default version
    this.loadBlockData().catch(error => {
      console.error('[BlockInteractionService] Failed to load block data:', error);
    });
  }

  private async loadBlockData(): Promise<void> {
    try {
      // Dynamic import to avoid require issues
      const { default: minecraftDataModule } = await import('minecraft-data');
      const minecraftData = minecraftDataModule(this.version);
      
      for (const block of Object.values(minecraftData.blocks) as any[]) {
        const properties: BlockProperties = {
          id: block.id,
          name: block.name,
          hardness: block.hardness ?? 0,
          material: block.material,
          boundingBox: block.boundingBox,
          transparent: block.transparent ?? false,
          liquid: block.liquid ?? false,
          climbable: block.climbable ?? false,
          replaceable: block.replaceable ?? false
        };
        
        this.blocks.set(block.id, properties);
        this.blocksByName.set(block.name, properties);
      }
    } catch (error) {
      console.error('Failed to load minecraft-data:', error);
      this.loadFallbackData();
    }
  }

  private loadFallbackData(): void {
    const fallbackBlocks: BlockProperties[] = [
      { id: 0, name: 'air', hardness: 0, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 1, name: 'stone', hardness: 1.5, boundingBox: 'block' },
      { id: 2, name: 'grass_block', hardness: 0.6, boundingBox: 'block' },
      { id: 3, name: 'dirt', hardness: 0.5, boundingBox: 'block' },
      { id: 4, name: 'cobblestone', hardness: 2.0, boundingBox: 'block' },
      { id: 5, name: 'oak_planks', hardness: 2.0, boundingBox: 'block' },
      { id: 8, name: 'water', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 9, name: 'stationary_water', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 10, name: 'lava', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 11, name: 'stationary_lava', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 12, name: 'sand', hardness: 0.5, boundingBox: 'block' },
      { id: 13, name: 'gravel', hardness: 0.6, boundingBox: 'block' },
      { id: 17, name: 'oak_log', hardness: 2.0, boundingBox: 'block' },
      { id: 18, name: 'oak_leaves', hardness: 0.2, boundingBox: 'block', transparent: true },
      { id: 20, name: 'glass', hardness: 0.3, boundingBox: 'block', transparent: true },
      { id: 30, name: 'cobweb', hardness: 4.0, boundingBox: 'empty', transparent: true },
      { id: 31, name: 'grass', hardness: 0, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 32, name: 'dead_bush', hardness: 0, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 50, name: 'torch', hardness: 0, boundingBox: 'empty', transparent: true },
      { id: 64, name: 'oak_door', hardness: 3.0, boundingBox: 'block', transparent: true },
      { id: 65, name: 'ladder', hardness: 0.4, boundingBox: 'block', transparent: true, climbable: true },
      { id: 78, name: 'snow', hardness: 0.1, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 106, name: 'vine', hardness: 0.2, boundingBox: 'empty', transparent: true, climbable: true }
    ];

    for (const block of fallbackBlocks) {
      this.blocks.set(block.id, block);
      this.blocksByName.set(block.name, block);
    }
  }

  // Block property methods (from original BlockRegistry)
  getBlock(id: number): BlockProperties | null {
    return this.blocks.get(id) ?? null;
  }

  getBlockByName(name: string): BlockProperties | null {
    return this.blocksByName.get(name) ?? null;
  }

  isPassable(blockId: number, context?: MovementContext): boolean {
    const block = this.getBlock(blockId);
    if (!block) return true;

    if (block.boundingBox === 'empty') return true;
    
    if (block.liquid) {
      return context?.canSwim ?? false;
    }

    if (block.name.includes('door') || block.name.includes('gate')) {
      return context?.canBreakDoors ?? false;
    }

    return false;
  }

  isLiquid(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.liquid ?? false;
  }

  isSafe(blockId: number): boolean {
    const block = this.getBlock(blockId);
    if (!block) return false;

    if (block.liquid) return false;
    if (block.name.includes('lava')) return false;
    if (block.name.includes('fire')) return false;
    if (block.name.includes('cactus')) return false;
    if (block.name === 'magma_block') return false;
    if (block.name === 'sweet_berry_bush') return false;
    
    return true;
  }

  getHardness(blockId: number): number {
    const block = this.getBlock(blockId);
    return block?.hardness ?? -1;
  }

  isClimbable(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.climbable ?? false;
  }

  isReplaceable(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.replaceable ?? false;
  }

  isTransparent(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.transparent ?? false;
  }

  isSolid(blockId: number): boolean {
    const block = this.getBlock(blockId);
    if (!block) return false;
    return block.boundingBox === 'block' && !block.liquid;
  }

  canStandOn(blockId: number): boolean {
    const block = this.getBlock(blockId);
    if (!block) return false;
    
    if (block.liquid) return false;
    if (block.boundingBox !== 'block') return false;
    if (block.name.includes('fence') && !block.name.includes('fence_gate')) return true;
    if (block.name.includes('wall')) return true;
    
    return this.isSolid(blockId);
  }

  // Block interaction methods
  async breakBlock(bot: UnifiedBot, position: Vec3, options?: BreakBlockOptions): Promise<void> {
    const defaultOptions: BreakBlockOptions = {
      ignoreReachability: false,
      ignoreNoPath: false,
      forceDig: false,
      timeout: 30000
    };
    const opts = { ...defaultOptions, ...options };

    // Validate the block operation
    const validation = this.validateBlockOperation(bot, position, 'break');
    if (!validation.isValid) {
      throw new Error(`Cannot break block: ${validation.reason}`);
    }

    if (!opts.ignoreReachability && !validation.isReachable) {
      throw new Error('Block is not reachable');
    }

    const block = bot.blockAt(position);
    if (!block || block.name === 'air') {
      throw new Error('No block to break at position');
    }

    // Edition-specific breaking logic
    if (bot.edition === 'java') {
      // Java Edition uses mineflayer's dig method
      if (bot._bot && typeof bot._bot.dig === 'function') {
        await bot._bot.dig(block);
      } else {
        throw new Error('Java bot does not support digging');
      }
    } else if (bot.edition === 'bedrock') {
      // Bedrock Edition uses our custom digBlock method
      if (bot.digBlock && typeof bot.digBlock === 'function') {
        await bot.digBlock(position);
      } else {
        throw new Error('Bedrock bot does not support digging');
      }
    } else {
      throw new Error(`Unsupported bot edition: ${bot.edition}`);
    }
  }

  async placeBlock(bot: UnifiedBot, position: Vec3, blockName: string, options?: PlaceBlockOptions): Promise<void> {
    const defaultOptions: PlaceBlockOptions = {
      ignoreReachability: false,
      ignoreNoPath: false,
      alwaysHaveItem: false,
      timeout: 30000
    };
    const opts = { ...defaultOptions, ...options };

    // Validate the block operation
    const validation = this.validateBlockOperation(bot, position, 'place');
    if (!validation.isValid) {
      throw new Error(`Cannot place block: ${validation.reason}`);
    }

    if (!opts.ignoreReachability && !validation.isReachable) {
      throw new Error('Position is not reachable');
    }

    // Check if bot has the item
    if (bot.inventory && bot.inventory.slots) {
      const hasItem = bot.inventory.slots.some((item: any) => item && item.name === blockName);
      if (!hasItem && !opts.alwaysHaveItem) {
        throw new Error(`Bot does not have ${blockName} in inventory`);
      }
    }

    // Find placement face if not provided
    let referenceBlock = opts.referenceBlock;
    let face = opts.face;
    
    if (!referenceBlock || !face) {
      const placementInfo = this.findPlacementFace(bot, position);
      if (!placementInfo) {
        throw new Error('Cannot find suitable placement face');
      }
      referenceBlock = placementInfo.referenceBlock;
      face = placementInfo.face;
    }

    // Edition-specific placing logic
    if (bot.edition === 'java') {
      // Java Edition uses mineflayer's placeBlock method
      if (bot._bot && typeof bot._bot.placeBlock === 'function') {
        await bot._bot.placeBlock(referenceBlock, face);
      } else {
        throw new Error('Java bot does not support placing blocks');
      }
    } else if (bot.edition === 'bedrock') {
      // Bedrock Edition uses our custom placeBlock method
      if (bot.placeBlock && typeof bot.placeBlock === 'function') {
        await bot.placeBlock(referenceBlock, face);
      } else {
        throw new Error('Bedrock bot does not support placing blocks');
      }
    } else {
      throw new Error(`Unsupported bot edition: ${bot.edition}`);
    }
  }

  async activateBlock(bot: UnifiedBot, position: Vec3, options?: BlockInteractionOptions): Promise<void> {
    const defaultOptions: BlockInteractionOptions = {
      ignoreReachability: false,
      ignoreNoPath: false,
      timeout: 30000
    };
    const opts = { ...defaultOptions, ...options };

    // Validate the block operation
    const validation = this.validateBlockOperation(bot, position, 'activate');
    if (!validation.isValid) {
      throw new Error(`Cannot activate block: ${validation.reason}`);
    }

    if (!opts.ignoreReachability && !validation.isReachable) {
      throw new Error('Block is not reachable');
    }

    const block = bot.blockAt(position);
    if (!block) {
      throw new Error('No block to activate at position');
    }

    // Edition-specific activation logic
    if (bot.edition === 'java') {
      // Java Edition uses mineflayer's activateBlock method
      if (bot._bot && typeof bot._bot.activateBlock === 'function') {
        await bot._bot.activateBlock(block);
      } else {
        throw new Error('Java bot does not support activating blocks');
      }
    } else if (bot.edition === 'bedrock') {
      // Bedrock Edition uses our custom activateBlock method
      if (bot.activateBlock && typeof bot.activateBlock === 'function') {
        await bot.activateBlock(block);
      } else {
        throw new Error('Bedrock bot does not support activating blocks');
      }
    } else {
      throw new Error(`Unsupported bot edition: ${bot.edition}`);
    }
  }

  // Block validation and utility methods
  validateBlockOperation(bot: UnifiedBot, position: Vec3, operation: 'break' | 'place' | 'activate'): BlockValidationResult {
    const result: BlockValidationResult = {
      isValid: true,
      canInteract: true,
      isReachable: true
    };

    try {
      const block = bot.blockAt(position);
      const botPosition = bot.getPosition();
      const distance = Math.sqrt(
        Math.pow(position.x - botPosition.x, 2) +
        Math.pow(position.y - botPosition.y, 2) +
        Math.pow(position.z - botPosition.z, 2)
      );

      // Check reach distance (typically 4.5 blocks for players)
      if (distance > 4.5) {
        result.isReachable = false;
        result.reason = 'Block is too far away';
      }

      switch (operation) {
        case 'break':
          if (!block || block.name === 'air') {
            result.isValid = false;
            result.reason = 'No block to break';
          } else if (block.name === 'bedrock') {
            result.isValid = false;
            result.reason = 'Cannot break bedrock';
          }
          break;

        case 'place':
          if (block && block.name !== 'air' && !this.isReplaceable(block.type)) {
            result.isValid = false;
            result.reason = 'Position is not empty and not replaceable';
          }
          break;

        case 'activate':
          if (!block || block.name === 'air') {
            result.isValid = false;
            result.reason = 'No block to activate';
          } else if (!this.isActivatable(block.name)) {
            result.canInteract = false;
            result.reason = 'Block is not activatable';
          }
          break;
      }

      if (!result.isValid) {
        result.canInteract = false;
        result.isReachable = false;
      }

    } catch (error) {
      result.isValid = false;
      result.canInteract = false;
      result.isReachable = false;
      result.reason = `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return result;
  }

  private isActivatable(blockName: string): boolean {
    const activatableBlocks = [
      'chest', 'trapped_chest', 'ender_chest',
      'furnace', 'blast_furnace', 'smoker',
      'crafting_table', 'anvil',
      'door', 'trapdoor', 'fence_gate',
      'button', 'lever',
      'bed', 'respawn_anchor',
      'brewing_stand', 'cauldron',
      'hopper', 'dispenser', 'dropper',
      'jukebox', 'note_block'
    ];

    return activatableBlocks.some(activatable => blockName.includes(activatable));
  }

  isBlockReachable(bot: UnifiedBot, position: Vec3): boolean {
    const botPosition = bot.getPosition();
    const distance = Math.sqrt(
      Math.pow(position.x - botPosition.x, 2) +
      Math.pow(position.y - botPosition.y, 2) +
      Math.pow(position.z - botPosition.z, 2)
    );

    return distance <= 4.5; // Standard reach distance
  }

  findNearestBlock(bot: UnifiedBot, blockName: string, options?: BlockSearchOptions): Vec3 | null {
    const defaultOptions: BlockSearchOptions = {
      maxDistance: 32,
      includeEmpty: false,
      onlyReachable: false
    };
    const opts = { ...defaultOptions, ...options };
    const botPosition = bot.getPosition();
    let closestBlock: Vec3 | null = null;
    let closestDistance = Infinity;

    // Search in a cubic area around the bot
    const searchRadius = opts.maxDistance || 32;
    for (let x = botPosition.x - searchRadius; x <= botPosition.x + searchRadius; x++) {
      for (let y = Math.max(0, botPosition.y - searchRadius); y <= Math.min(255, botPosition.y + searchRadius); y++) {
        for (let z = botPosition.z - searchRadius; z <= botPosition.z + searchRadius; z++) {
          const pos = new Vec3(x, y, z);
          const block = bot.blockAt(pos);
          
          if (block && block.name === blockName) {
            if (opts.filter && !opts.filter(block)) continue;
            
            const distance = Math.sqrt(
              Math.pow(pos.x - botPosition.x, 2) +
              Math.pow(pos.y - botPosition.y, 2) +
              Math.pow(pos.z - botPosition.z, 2)
            );

            if (opts.onlyReachable && !this.isBlockReachable(bot, pos)) continue;

            if (distance < closestDistance) {
              closestDistance = distance;
              closestBlock = pos;
            }
          }
        }
      }
    }

    return closestBlock;
  }

  findBlocksInRange(bot: UnifiedBot, blockName: string, options?: BlockSearchOptions): Vec3[] {
    const defaultOptions: BlockSearchOptions = {
      maxDistance: 32,
      includeEmpty: false,
      onlyReachable: false
    };
    const opts = { ...defaultOptions, ...options };
    const botPosition = bot.getPosition();
    const blocks: Vec3[] = [];

    // Search in a cubic area around the bot
    const searchRadius = opts.maxDistance || 32;
    for (let x = botPosition.x - searchRadius; x <= botPosition.x + searchRadius; x++) {
      for (let y = Math.max(0, botPosition.y - searchRadius); y <= Math.min(255, botPosition.y + searchRadius); y++) {
        for (let z = botPosition.z - searchRadius; z <= botPosition.z + searchRadius; z++) {
          const pos = new Vec3(x, y, z);
          const block = bot.blockAt(pos);
          
          if (block && block.name === blockName) {
            if (opts.filter && !opts.filter(block)) continue;
            if (opts.onlyReachable && !this.isBlockReachable(bot, pos)) continue;

            blocks.push(pos);
          }
        }
      }
    }

    return blocks;
  }

  isSafePosition(bot: UnifiedBot, position: Vec3): boolean {
    // Check the block at the position and blocks above
    const blockAt = bot.blockAt(position);
    const blockAbove = bot.blockAt(position.offset(0, 1, 0));
    const blockBelow = bot.blockAt(position.offset(0, -1, 0));

    if (!blockAt || !blockAbove || !blockBelow) return false;

    // Position should be empty (air or replaceable)
    if (blockAt.name !== 'air' && !this.isReplaceable(blockAt.type)) return false;

    // Space above should be empty
    if (blockAbove.name !== 'air' && !this.isReplaceable(blockAbove.type)) return false;

    // Should have solid ground below
    if (!this.canStandOn(blockBelow.type)) return false;

    // Check for hazards
    if (!this.isSafe(blockAt.type) || !this.isSafe(blockAbove.type) || !this.isSafe(blockBelow.type)) {
      return false;
    }

    return true;
  }

  findSafePosition(bot: UnifiedBot, targetPosition: Vec3, maxDistance: number = 5): Vec3 | null {
    const positions = this.getAdjacentPositions(targetPosition, true);
    
    // Sort positions by distance from target
    positions.sort((a, b) => {
      const distA = targetPosition.distanceTo(a);
      const distB = targetPosition.distanceTo(b);
      return distA - distB;
    });

    for (const pos of positions) {
      if (targetPosition.distanceTo(pos) > maxDistance) break;
      
      if (this.isSafePosition(bot, pos)) {
        return pos;
      }
    }

    return null;
  }

  getBestTool(bot: UnifiedBot, blockName: string): any | null {
    if (!bot.inventory || !bot.inventory.slots) return null;

    const block = this.getBlockByName(blockName);
    if (!block) return null;

    // Find the best tool based on block material and tool efficiency
    const tools = bot.inventory.slots.filter((item: any) => {
      if (!item) return false;
      
      // Check if it's a tool
      return item.name.includes('pickaxe') || 
             item.name.includes('axe') || 
             item.name.includes('shovel') || 
             item.name.includes('hoe') ||
             item.name.includes('sword');
    });

    if (tools.length === 0) return null;

    // Simple tool selection based on block material
    const materialToolMap: { [key: string]: string[] } = {
      'stone': ['pickaxe'],
      'wood': ['axe'],
      'dirt': ['shovel'],
      'sand': ['shovel'],
      'gravel': ['shovel']
    };

    const preferredTools = materialToolMap[block.material || ''] || [];
    
    for (const toolType of preferredTools) {
      const tool = tools.find((item: any) => item.name.includes(toolType));
      if (tool) return tool;
    }

    return tools[0]; // Return first available tool if no specific match
  }

  calculateBreakTime(bot: UnifiedBot, position: Vec3, tool?: any): number {
    const block = bot.blockAt(position);
    if (!block) return 0;

    const blockInfo = this.getBlockByName(block.name);
    if (!blockInfo) return 1000; // Default 1 second

    const hardness = blockInfo.hardness;
    if (hardness === 0) return 0; // Instant break

    // Base break time calculation (simplified)
    let breakTime = hardness * 1500; // Base time in milliseconds

    if (tool) {
      // Apply tool efficiency (simplified)
      if (tool.name.includes('diamond')) breakTime *= 0.2;
      else if (tool.name.includes('iron')) breakTime *= 0.4;
      else if (tool.name.includes('stone')) breakTime *= 0.6;
      else if (tool.name.includes('wooden')) breakTime *= 0.8;
    }

    return Math.max(50, breakTime); // Minimum 50ms
  }

  getAdjacentPositions(position: Vec3, includeDiagonals: boolean = false): Vec3[] {
    const positions: Vec3[] = [];
    
    // Cardinal directions
    const cardinalOffsets = [
      new Vec3(0, 1, 0),   // Up
      new Vec3(0, -1, 0),  // Down
      new Vec3(1, 0, 0),   // East
      new Vec3(-1, 0, 0),  // West
      new Vec3(0, 0, 1),   // South
      new Vec3(0, 0, -1)   // North
    ];

    for (const offset of cardinalOffsets) {
      positions.push(position.plus(offset));
    }

    if (includeDiagonals) {
      // Diagonal directions (horizontal plane)
      const diagonalOffsets = [
        new Vec3(1, 0, 1),   // Southeast
        new Vec3(1, 0, -1),  // Northeast
        new Vec3(-1, 0, 1),  // Southwest
        new Vec3(-1, 0, -1), // Northwest
        new Vec3(1, 1, 0),   // Up-East
        new Vec3(-1, 1, 0),  // Up-West
        new Vec3(0, 1, 1),   // Up-South
        new Vec3(0, 1, -1),  // Up-North
        new Vec3(1, -1, 0),  // Down-East
        new Vec3(-1, -1, 0), // Down-West
        new Vec3(0, -1, 1),  // Down-South
        new Vec3(0, -1, -1)  // Down-North
      ];

      for (const offset of diagonalOffsets) {
        positions.push(position.plus(offset));
      }
    }

    return positions;
  }

  findPlacementFace(bot: UnifiedBot, position: Vec3): { referenceBlock: any; face: Vec3 } | null {
    const adjacentPositions = this.getAdjacentPositions(position, false);
    
    for (const adjacentPos of adjacentPositions) {
      const adjacentBlock = bot.blockAt(adjacentPos);
      if (adjacentBlock && this.isSolid(adjacentBlock.type)) {
        // Calculate face vector (from adjacent block to target position)
        const face = position.minus(adjacentPos);
        return {
          referenceBlock: adjacentBlock,
          face: face
        };
      }
    }

    return null;
  }
}