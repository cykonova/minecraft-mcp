/**
 * Pathfinding services module
 * 
 * This module provides edition-agnostic pathfinding capabilities for Minecraft bots.
 * It uses the A* algorithm to find optimal paths between positions while considering
 * block types, terrain difficulty, and movement constraints.
 * 
 * @example
 * ```typescript
 * import { IPathfindingService, PathfindingService } from './services/pathfinding';
 * 
 * // Via dependency injection (recommended)
 * const pathfinder = container.resolve<IPathfindingService>('PathfindingService');
 * 
 * // Calculate a path
 * const path = pathfinder.calculatePath(start, goal, getBlockAt, {
 *   allowJump: true,
 *   avoidLava: true,
 *   maxDistance: 100
 * });
 * ```
 */

export { IPathfindingService } from './IPathfindingService.js';
export { PathfindingService } from './PathfindingService.js';
export type { 
  PathOptions, 
  PathNode, 
  BlockQueryFunction 
} from './IPathfindingService.js';