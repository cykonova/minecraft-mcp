import { Vec3 } from 'vec3';
import { UnifiedBot } from '../../bots/UnifiedBot.js';

export interface BlockProperties {
  id: number;
  name: string;
  hardness: number;
  material?: string;
  boundingBox?: 'block' | 'empty';
  transparent?: boolean;
  liquid?: boolean;
  climbable?: boolean;
  replaceable?: boolean;
}

export interface MovementContext {
  canSwim?: boolean;
  canBreakDoors?: boolean;
  preferSafePath?: boolean;
}

export interface BlockInteractionOptions {
  ignoreReachability?: boolean;
  ignoreNoPath?: boolean;
  forceDig?: boolean;
  timeout?: number;
}

export interface PlaceBlockOptions extends BlockInteractionOptions {
  face?: Vec3;
  referenceBlock?: any;
  alwaysHaveItem?: boolean;
}

export interface BreakBlockOptions extends BlockInteractionOptions {
  forceTool?: boolean;
  digUntilDone?: boolean;
}

export interface BlockValidationResult {
  isValid: boolean;
  reason?: string;
  canInteract: boolean;
  isReachable: boolean;
}

export interface BlockSearchOptions {
  maxDistance?: number;
  includeEmpty?: boolean;
  onlyReachable?: boolean;
  filter?: (block: any) => boolean;
}

/**
 * Comprehensive block interaction service interface
 * Handles all block-related operations including properties, validation, and interaction
 */
export interface IBlockInteractionService {
  // Block property methods (from original BlockRegistry)
  getBlock(id: number): BlockProperties | null;
  getBlockByName(name: string): BlockProperties | null;
  isPassable(blockId: number, context?: MovementContext): boolean;
  isLiquid(blockId: number): boolean;
  isSafe(blockId: number): boolean;
  getHardness(blockId: number): number;
  isClimbable(blockId: number): boolean;
  isReplaceable(blockId: number): boolean;
  isTransparent(blockId: number): boolean;
  isSolid(blockId: number): boolean;
  canStandOn(blockId: number): boolean;

  // Block interaction methods
  /**
   * Break a block at the specified position
   * @param bot The unified bot instance
   * @param position Position of the block to break
   * @param options Options for breaking the block
   * @returns Promise that resolves when the block is broken
   */
  breakBlock(bot: UnifiedBot, position: Vec3, options?: BreakBlockOptions): Promise<void>;

  /**
   * Place a block at the specified position
   * @param bot The unified bot instance
   * @param position Position where to place the block
   * @param blockName Name of the block to place
   * @param options Options for placing the block
   * @returns Promise that resolves when the block is placed
   */
  placeBlock(bot: UnifiedBot, position: Vec3, blockName: string, options?: PlaceBlockOptions): Promise<void>;

  /**
   * Activate/interact with a block (open doors, chests, etc.)
   * @param bot The unified bot instance
   * @param position Position of the block to activate
   * @param options Options for activation
   * @returns Promise that resolves when the block is activated
   */
  activateBlock(bot: UnifiedBot, position: Vec3, options?: BlockInteractionOptions): Promise<void>;

  // Block validation and utility methods
  /**
   * Validate if a block operation is possible
   * @param bot The unified bot instance
   * @param position Position of the block
   * @param operation Type of operation (break, place, activate)
   * @returns Validation result with details
   */
  validateBlockOperation(
    bot: UnifiedBot, 
    position: Vec3, 
    operation: 'break' | 'place' | 'activate'
  ): BlockValidationResult;

  /**
   * Check if a block is reachable by the bot
   * @param bot The unified bot instance
   * @param position Position of the block
   * @returns True if the block is reachable
   */
  isBlockReachable(bot: UnifiedBot, position: Vec3): boolean;

  /**
   * Get the closest block of a specific type
   * @param bot The unified bot instance
   * @param blockName Name of the block to find
   * @param options Search options
   * @returns Position of the closest block or null if not found
   */
  findNearestBlock(bot: UnifiedBot, blockName: string, options?: BlockSearchOptions): Vec3 | null;

  /**
   * Get all blocks of a specific type within range
   * @param bot The unified bot instance
   * @param blockName Name of the block to find
   * @param options Search options
   * @returns Array of block positions
   */
  findBlocksInRange(bot: UnifiedBot, blockName: string, options?: BlockSearchOptions): Vec3[];

  /**
   * Check if a position is safe to stand on
   * @param bot The unified bot instance
   * @param position Position to check
   * @returns True if the position is safe
   */
  isSafePosition(bot: UnifiedBot, position: Vec3): boolean;

  /**
   * Find a safe position near a target location
   * @param bot The unified bot instance
   * @param targetPosition Target position
   * @param maxDistance Maximum distance to search
   * @returns Safe position or null if none found
   */
  findSafePosition(bot: UnifiedBot, targetPosition: Vec3, maxDistance?: number): Vec3 | null;

  /**
   * Get the best tool for breaking a block
   * @param bot The unified bot instance
   * @param blockName Name of the block to break
   * @returns Best tool item or null if no suitable tool
   */
  getBestTool(bot: UnifiedBot, blockName: string): any | null;

  /**
   * Calculate the time required to break a block
   * @param bot The unified bot instance
   * @param position Position of the block
   * @param tool Optional tool to use
   * @returns Break time in milliseconds
   */
  calculateBreakTime(bot: UnifiedBot, position: Vec3, tool?: any): number;

  /**
   * Get adjacent positions to a block
   * @param position Center position
   * @param includeDiagonals Whether to include diagonal positions
   * @returns Array of adjacent positions
   */
  getAdjacentPositions(position: Vec3, includeDiagonals?: boolean): Vec3[];

  /**
   * Find the best face to place a block against
   * @param bot The unified bot instance
   * @param position Target position for placement
   * @returns Reference block and face vector, or null if no suitable face
   */
  findPlacementFace(bot: UnifiedBot, position: Vec3): { referenceBlock: any; face: Vec3 } | null;
}