import { Vec3 } from 'vec3';

/**
 * Options for pathfinding operations
 */
export interface PathOptions {
  /** Maximum distance to search for a path */
  maxDistance?: number;
  /** Timeout in milliseconds for pathfinding */
  timeout?: number;
  /** Allow jumping during pathfinding */
  allowJump?: boolean;
  /** Allow digging blocks (not used in current implementation) */
  allowDig?: boolean;
  /** Allow placing blocks (not used in current implementation) */
  allowPlace?: boolean;
  /** Avoid water blocks */
  avoidWater?: boolean;
  /** Avoid lava blocks */
  avoidLava?: boolean;
}

/**
 * Represents a node in the pathfinding algorithm
 */
export interface PathNode {
  /** The position of this node */
  position: Vec3;
  /** Cost from start node (G cost in A*) */
  g: number;
  /** Heuristic cost to goal (H cost in A*) */
  h: number;
  /** Total cost (F = G + H in A*) */
  f: number;
  /** Parent node for path reconstruction */
  parent: PathNode | null;
}

/**
 * Function to get block information at a specific position
 */
export type BlockQueryFunction = (pos: Vec3) => { type: number } | null;

/**
 * Service interface for pathfinding operations
 * Provides edition-agnostic pathfinding capabilities using A* algorithm
 */
export interface IPathfindingService {
  /**
   * Calculate a path from one position to another
   * @param from Starting position
   * @param to Target position
   * @param getBlockAt Function to query blocks at positions
   * @param options Pathfinding options
   * @returns Array of Vec3 positions representing the path, or null if no path found
   */
  calculatePath(
    from: Vec3,
    to: Vec3,
    getBlockAt: BlockQueryFunction,
    options?: PathOptions
  ): Vec3[] | null;

  /**
   * Smooth a path by removing unnecessary waypoints
   * Uses line-of-sight checks to eliminate redundant points
   * @param path Array of positions representing the path
   * @returns Smoothed path with fewer waypoints
   */
  smoothPath(path: Vec3[]): Vec3[];

  /**
   * Check if movement from one position to another is possible
   * @param from Starting position
   * @param to Target position
   * @param getBlockAt Function to query blocks at positions
   * @param options Movement constraints
   * @returns True if movement is possible
   */
  canMoveTo(
    from: Vec3,
    to: Vec3,
    getBlockAt: BlockQueryFunction,
    options?: { avoidWater?: boolean; avoidLava?: boolean }
  ): boolean;

  /**
   * Calculate the movement cost between two adjacent positions
   * Takes into account terrain difficulty and elevation changes
   * @param from Starting position
   * @param to Target position
   * @param getBlockAt Function to query blocks at positions
   * @returns Movement cost as a number (higher = more expensive)
   */
  getMovementCost(
    from: Vec3,
    to: Vec3,
    getBlockAt: BlockQueryFunction
  ): number;

  /**
   * Get all valid neighbor positions from a given position
   * @param pos Current position
   * @param getBlockAt Function to query blocks at positions
   * @param options Movement options
   * @returns Array of accessible neighbor positions
   */
  getNeighbors(
    pos: Vec3,
    getBlockAt: BlockQueryFunction,
    options?: { allowJump?: boolean; avoidWater?: boolean; avoidLava?: boolean }
  ): Vec3[];
}