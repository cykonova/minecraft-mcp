import { Vec3 } from 'vec3';
import { BlockRegistry, MovementContext } from './BlockRegistry.js';

export interface PathNode {
  position: Vec3;
  g: number; // Cost from start
  h: number; // Heuristic cost to goal
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

export interface PathOptions {
  maxDistance?: number;
  timeout?: number;
  allowJump?: boolean;
  allowDig?: boolean;
  allowPlace?: boolean;
  avoidWater?: boolean;
  avoidLava?: boolean;
}

export class PathCalculator {
  private blockRegistry: BlockRegistry;
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

  constructor(blockRegistry: BlockRegistry) {
    this.blockRegistry = blockRegistry;
  }

  calculatePath(
    from: Vec3,
    to: Vec3,
    getBlockAt: (pos: Vec3) => { type: number } | null,
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

    if (start.distanceTo(goal) > maxDistance) {
      return null;
    }

    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, PathNode>();

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

    while (openSet.length > 0) {
      if (Date.now() - startTime > timeout) {
        console.warn('Pathfinding timeout');
        return this.reconstructPath(this.findClosestNode(nodeMap, goal));
      }

      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = this.posToKey(current.position);

      if (current.position.equals(goal)) {
        return this.reconstructPath(current);
      }

      closedSet.add(currentKey);

      const neighbors = this.getNeighbors(current.position, getBlockAt, {
        allowJump,
        avoidWater,
        avoidLava
      });

      for (const neighborPos of neighbors) {
        const neighborKey = this.posToKey(neighborPos);

        if (closedSet.has(neighborKey)) continue;

        const tentativeG = current.g + this.movementCost(current.position, neighborPos, getBlockAt);

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

    const closest = this.findClosestNode(nodeMap, goal);
    if (closest && closest.position.distanceTo(goal) < 5) {
      return this.reconstructPath(closest);
    }

    return null;
  }

  private getNeighbors(
    pos: Vec3,
    getBlockAt: (pos: Vec3) => { type: number } | null,
    options: { allowJump?: boolean; avoidWater?: boolean; avoidLava?: boolean }
  ): Vec3[] {
    const neighbors: Vec3[] = [];

    for (const offset of this.NEIGHBOR_OFFSETS) {
      const neighborPos = pos.plus(offset);
      
      if (this.canMoveTo(pos, neighborPos, getBlockAt, options)) {
        neighbors.push(neighborPos);
      }

      if (options.allowJump) {
        const jumpPos = neighborPos.offset(0, 1, 0);
        if (this.canMoveTo(pos, jumpPos, getBlockAt, options)) {
          neighbors.push(jumpPos);
        }
      }

      const fallPos = neighborPos.offset(0, -1, 0);
      if (this.canMoveTo(pos, fallPos, getBlockAt, options)) {
        neighbors.push(fallPos);
      }
    }

    return neighbors;
  }

  private canMoveTo(
    from: Vec3,
    to: Vec3,
    getBlockAt: (pos: Vec3) => { type: number } | null,
    options: { avoidWater?: boolean; avoidLava?: boolean }
  ): boolean {
    const blockAtTo = getBlockAt(to);
    const blockAboveTo = getBlockAt(to.offset(0, 1, 0));
    const blockBelowTo = getBlockAt(to.offset(0, -1, 0));

    if (!blockAtTo || !blockAboveTo) return false;

    const toBlockId = blockAtTo.type;
    const aboveBlockId = blockAboveTo.type;
    const belowBlockId = blockBelowTo?.type ?? 0;

    if (!this.blockRegistry.isPassable(toBlockId)) return false;
    if (!this.blockRegistry.isPassable(aboveBlockId)) return false;

    if (!this.blockRegistry.canStandOn(belowBlockId) && !this.blockRegistry.isLiquid(belowBlockId)) {
      if (belowBlockId !== 0) return false;
    }

    if (options.avoidWater && this.blockRegistry.isLiquid(toBlockId)) {
      const block = this.blockRegistry.getBlock(toBlockId);
      if (block?.name.includes('water')) return false;
    }

    if (options.avoidLava && this.blockRegistry.isLiquid(toBlockId)) {
      const block = this.blockRegistry.getBlock(toBlockId);
      if (block?.name.includes('lava')) return false;
    }

    const heightDiff = Math.abs(to.y - from.y);
    if (heightDiff > 1) {
      const blockAboveFrom = getBlockAt(from.offset(0, 1, 0));
      if (blockAboveFrom && !this.blockRegistry.isPassable(blockAboveFrom.type)) {
        return false;
      }
    }

    return true;
  }

  private movementCost(
    from: Vec3,
    to: Vec3,
    getBlockAt: (pos: Vec3) => { type: number } | null
  ): number {
    const distance = from.distanceTo(to);
    let cost = distance;

    const blockAtTo = getBlockAt(to);
    if (blockAtTo) {
      if (this.blockRegistry.isLiquid(blockAtTo.type)) {
        cost *= 2;
      }

      const blockBelowTo = getBlockAt(to.offset(0, -1, 0));
      if (blockBelowTo) {
        const hardness = this.blockRegistry.getHardness(blockBelowTo.type);
        if (hardness > 5) {
          cost *= 1.5;
        }
      }
    }

    const heightDiff = to.y - from.y;
    if (heightDiff > 0) {
      cost += heightDiff * 2;
    } else if (heightDiff < 0) {
      cost += Math.abs(heightDiff) * 0.5;
    }

    return cost;
  }

  private heuristic(pos: Vec3, goal: Vec3): number {
    return pos.distanceTo(goal);
  }

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

  private posToKey(pos: Vec3): string {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
  }

  smoothPath(path: Vec3[]): Vec3[] {
    if (path.length <= 2) return path;

    const smoothed: Vec3[] = [path[0]];

    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const current = path[i];
      const next = path[i + 1];

      const dir1 = current.minus(prev).normalize();
      const dir2 = next.minus(current).normalize();

      if (Math.abs(dir1.dot(dir2) - 1) > 0.01) {
        smoothed.push(current);
      }
    }

    smoothed.push(path[path.length - 1]);
    return smoothed;
  }
}