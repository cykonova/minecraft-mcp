import { Vec3 } from 'vec3';
import { injectable, singleton, inject } from 'tsyringe';
import { BlockRegistry } from '../BlockRegistry.js';
import { 
  IPathfindingService, 
  PathNode, 
  PathOptions, 
  BlockQueryFunction 
} from './IPathfindingService.js';

/**
 * Injectable pathfinding service that provides edition-agnostic pathfinding capabilities
 * Uses A* algorithm to find optimal paths between positions
 */
@injectable()
@singleton()
export class PathfindingService implements IPathfindingService {
  private readonly NEIGHBOR_OFFSETS: Vec3[] = [
    new Vec3(1, 0, 0),   // East
    new Vec3(-1, 0, 0),  // West
    new Vec3(0, 0, 1),   // South
    new Vec3(0, 0, -1),  // North
    new Vec3(1, 0, 1),   // Southeast
    new Vec3(-1, 0, 1),  // Southwest
    new Vec3(1, 0, -1),  // Northeast
    new Vec3(-1, 0, -1), // Northwest
  ];

  constructor(
    @inject(BlockRegistry) private blockRegistry: BlockRegistry
  ) {
    console.error('[PathfindingService] Initialized with BlockRegistry');
  }

  /**
   * Calculate a path from one position to another using A* algorithm
   */
  calculatePath(
    from: Vec3,
    to: Vec3,
    getBlockAt: BlockQueryFunction,
    options: PathOptions = {}
  ): Vec3[] | null {
    const {
      maxDistance = 256,
      timeout = 5000,
      allowJump = true,
      avoidWater = false,
      avoidLava = true
    } = options;

    const startTime = Date.now();
    const start = from.floored();
    const goal = to.floored();

    // Early exit if goal is too far
    if (start.distanceTo(goal) > maxDistance) {
      console.warn(`[PathfindingService] Goal too far: ${start.distanceTo(goal)} > ${maxDistance}`);
      return null;
    }

    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, PathNode>();

    // Initialize start node
    const startNode: PathNode = {
      position: start,
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
      parent: null
    };
    startNode.f = startNode.g + startNode.h;

    openSet.push(startNode);
    nodeMap.set(this.posToKey(start), startNode);

    let nodesExplored = 0;
    
    while (openSet.length > 0) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        console.warn(`[PathfindingService] Pathfinding timeout after ${timeout}ms, explored ${nodesExplored} nodes`);
        return this.reconstructPath(this.findClosestNode(nodeMap, goal));
      }

      // Get node with lowest f cost
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = this.posToKey(current.position);
      nodesExplored++;

      // Check if we reached the goal
      if (current.position.equals(goal)) {
        console.error(`[PathfindingService] Path found in ${Date.now() - startTime}ms, explored ${nodesExplored} nodes`);
        return this.reconstructPath(current);
      }

      closedSet.add(currentKey);

      // Explore neighbors
      const neighbors = this.getNeighbors(current.position, getBlockAt, {
        allowJump,
        avoidWater,
        avoidLava
      });

      for (const neighborPos of neighbors) {
        const neighborKey = this.posToKey(neighborPos);

        if (closedSet.has(neighborKey)) continue;

        const tentativeG = current.g + this.getMovementCost(current.position, neighborPos, getBlockAt);

        let neighbor = nodeMap.get(neighborKey);
        if (!neighbor) {
          neighbor = {
            position: neighborPos,
            g: Infinity,
            h: this.heuristic(neighborPos, goal),
            f: Infinity,
            parent: null
          };
          nodeMap.set(neighborKey, neighbor);
        }

        if (tentativeG < neighbor.g) {
          neighbor.parent = current;
          neighbor.g = tentativeG;
          neighbor.f = neighbor.g + neighbor.h;

          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    // No path found, try to return closest node if it's reasonably close
    const closest = this.findClosestNode(nodeMap, goal);
    if (closest && closest.position.distanceTo(goal) < 5) {
      console.warn(`[PathfindingService] No direct path found, returning path to closest position (${closest.position.distanceTo(goal)} blocks away)`);
      return this.reconstructPath(closest);
    }

    console.warn(`[PathfindingService] No path found after exploring ${nodesExplored} nodes`);
    return null;
  }

  /**
   * Get all valid neighbor positions from a given position
   */
  getNeighbors(
    pos: Vec3,
    getBlockAt: BlockQueryFunction,
    options: { allowJump?: boolean; avoidWater?: boolean; avoidLava?: boolean } = {}
  ): Vec3[] {
    const neighbors: Vec3[] = [];

    for (const offset of this.NEIGHBOR_OFFSETS) {
      const neighborPos = pos.plus(offset);
      
      // Check horizontal movement
      if (this.canMoveTo(pos, neighborPos, getBlockAt, options)) {
        neighbors.push(neighborPos);
      }

      // Check jumping (if allowed)
      if (options.allowJump) {
        const jumpPos = neighborPos.offset(0, 1, 0);
        if (this.canMoveTo(pos, jumpPos, getBlockAt, options)) {
          neighbors.push(jumpPos);
        }
      }

      // Check falling
      const fallPos = neighborPos.offset(0, -1, 0);
      if (this.canMoveTo(pos, fallPos, getBlockAt, options)) {
        neighbors.push(fallPos);
      }
    }

    return neighbors;
  }

  /**
   * Check if movement from one position to another is possible
   */
  canMoveTo(
    from: Vec3,
    to: Vec3,
    getBlockAt: BlockQueryFunction,
    options: { avoidWater?: boolean; avoidLava?: boolean } = {}
  ): boolean {
    try {
      const blockAtTo = getBlockAt(to);
      const blockAboveTo = getBlockAt(to.offset(0, 1, 0));
      const blockBelowTo = getBlockAt(to.offset(0, -1, 0));

      if (!blockAtTo || !blockAboveTo) return false;

      const toBlockId = blockAtTo.type;
      const aboveBlockId = blockAboveTo.type;
      const belowBlockId = blockBelowTo?.type ?? 0;

      // Must be able to pass through target position and space above
      if (!this.blockRegistry.isPassable(toBlockId)) return false;
      if (!this.blockRegistry.isPassable(aboveBlockId)) return false;

      // Must have something to stand on (or be in liquid/air)
      if (!this.blockRegistry.canStandOn(belowBlockId) && !this.blockRegistry.isLiquid(belowBlockId)) {
        if (belowBlockId !== 0) return false; // Can't move to position with non-passable block below
      }

      // Check liquid avoidance
      if (options.avoidWater && this.blockRegistry.isLiquid(toBlockId)) {
        const block = this.blockRegistry.getBlock(toBlockId);
        if (block?.name.includes('water')) return false;
      }

      if (options.avoidLava && this.blockRegistry.isLiquid(toBlockId)) {
        const block = this.blockRegistry.getBlock(toBlockId);
        if (block?.name.includes('lava')) return false;
      }

      // Check for jumping constraints
      const heightDiff = Math.abs(to.y - from.y);
      if (heightDiff > 1) {
        const blockAboveFrom = getBlockAt(from.offset(0, 1, 0));
        if (blockAboveFrom && !this.blockRegistry.isPassable(blockAboveFrom.type)) {
          return false; // Can't jump if there's a block above current position
        }
      }

      return true;
    } catch (error) {
      console.error(`[PathfindingService] Error checking movement from ${from} to ${to}:`, error);
      return false;
    }
  }

  /**
   * Calculate the movement cost between two adjacent positions
   */
  getMovementCost(
    from: Vec3,
    to: Vec3,
    getBlockAt: BlockQueryFunction
  ): number {
    const distance = from.distanceTo(to);
    let cost = distance;

    try {
      const blockAtTo = getBlockAt(to);
      if (blockAtTo) {
        // Increase cost for moving through liquids
        if (this.blockRegistry.isLiquid(blockAtTo.type)) {
          cost *= 2;
        }

        // Increase cost for moving over harder blocks (indicates difficult terrain)
        const blockBelowTo = getBlockAt(to.offset(0, -1, 0));
        if (blockBelowTo) {
          const hardness = this.blockRegistry.getHardness(blockBelowTo.type);
          if (hardness > 5) {
            cost *= 1.5;
          }
        }
      }

      // Adjust cost based on elevation change
      const heightDiff = to.y - from.y;
      if (heightDiff > 0) {
        // Going up is more expensive (jumping/climbing)
        cost += heightDiff * 2;
      } else if (heightDiff < 0) {
        // Going down is less expensive but still has some cost
        cost += Math.abs(heightDiff) * 0.5;
      }
    } catch (error) {
      console.error(`[PathfindingService] Error calculating movement cost from ${from} to ${to}:`, error);
      // Return base distance cost if there's an error
    }

    return cost;
  }

  /**
   * Smooth a path by removing unnecessary waypoints
   */
  smoothPath(path: Vec3[]): Vec3[] {
    if (path.length <= 2) return path;

    const smoothed: Vec3[] = [path[0]];

    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const current = path[i];
      const next = path[i + 1];

      // Calculate direction vectors
      const dir1 = current.minus(prev).normalize();
      const dir2 = next.minus(current).normalize();

      // If direction change is significant, keep this waypoint
      if (Math.abs(dir1.dot(dir2) - 1) > 0.01) {
        smoothed.push(current);
      }
    }

    smoothed.push(path[path.length - 1]);
    return smoothed;
  }

  /**
   * Calculate heuristic distance between two positions (Manhattan distance)
   */
  private heuristic(pos: Vec3, goal: Vec3): number {
    return pos.distanceTo(goal);
  }

  /**
   * Reconstruct path from goal node back to start
   */
  private reconstructPath(node: PathNode | null): Vec3[] {
    if (!node) return [];

    const path: Vec3[] = [];
    let current: PathNode | null = node;

    while (current) {
      path.unshift(current.position);
      current = current.parent;
    }

    return path;
  }

  /**
   * Find the node closest to the goal from all explored nodes
   */
  private findClosestNode(nodeMap: Map<string, PathNode>, goal: Vec3): PathNode | null {
    let closest: PathNode | null = null;
    let minDistance = Infinity;

    for (const node of nodeMap.values()) {
      const distance = node.position.distanceTo(goal);
      if (distance < minDistance) {
        minDistance = distance;
        closest = node;
      }
    }

    return closest;
  }

  /**
   * Convert position to string key for efficient map lookups
   */
  private posToKey(pos: Vec3): string {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
  }
}