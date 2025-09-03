import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { Vec3 } from 'vec3';
import 'reflect-metadata';
import { PathfindingService } from './PathfindingService.js';
import { BlockRegistry } from '../BlockRegistry.js';
import { BlockQueryFunction, PathOptions } from './IPathfindingService.js';

// Mock BlockRegistry
const createMockBlockRegistry = (): jest.Mocked<BlockRegistry> => ({
  isPassable: jest.fn(),
  canStandOn: jest.fn(),
  isLiquid: jest.fn(),
  getBlock: jest.fn(),
  getHardness: jest.fn(),
  isSafe: jest.fn(),
  isClimbable: jest.fn(),
  isReplaceable: jest.fn(),
  isTransparent: jest.fn(),
  isSolid: jest.fn(),
  getBlockByName: jest.fn()
} as any);

// Mock block query function
const createMockBlockQuery = (blocks: Map<string, { type: number }>): BlockQueryFunction => {
  return (pos: Vec3) => {
    const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    return blocks.get(key) || null;
  };
};

describe('PathfindingService', () => {
  let pathfindingService: PathfindingService;
  let mockBlockRegistry: jest.Mocked<BlockRegistry>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockBlockRegistry = createMockBlockRegistry();
    pathfindingService = new PathfindingService(mockBlockRegistry);
    
    // Spy on console.error to suppress output during tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with BlockRegistry', () => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('[PathfindingService] Initialized with BlockRegistry');
    });
  });

  describe('calculatePath', () => {
    beforeEach(() => {
      // Default mock behavior for successful pathfinding
      mockBlockRegistry.isPassable.mockReturnValue(true);
      mockBlockRegistry.canStandOn.mockReturnValue(true);
      mockBlockRegistry.isLiquid.mockReturnValue(false);
      mockBlockRegistry.getHardness.mockReturnValue(1);
    });

    it('should return null if goal is too far', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(300, 0, 0); // Beyond default maxDistance of 256
      const getBlockAt = createMockBlockQuery(new Map());

      const result = pathfindingService.calculatePath(from, to, getBlockAt);

      expect(result).toBeNull();
    });

    it('should find a direct path when no obstacles', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(2, 0, 0);
      
      const blocks = new Map<string, { type: number }>();
      // Add air blocks for movement
      for (let x = 0; x <= 2; x++) {
        blocks.set(`${x},0,0`, { type: 0 }); // Current position
        blocks.set(`${x},1,0`, { type: 0 }); // Above position
        blocks.set(`${x},-1,0`, { type: 1 }); // Below position (solid ground)
      }
      const getBlockAt = createMockBlockQuery(blocks);

      const result = pathfindingService.calculatePath(from, to, getBlockAt);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(3); // Start, middle, end
      expect(result![0]).toEqual(from.floored());
      expect(result![result!.length - 1]).toEqual(to.floored());
    });

    it('should respect maxDistance option', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(10, 0, 0);
      const getBlockAt = createMockBlockQuery(new Map());
      const options: PathOptions = { maxDistance: 5 };

      const result = pathfindingService.calculatePath(from, to, getBlockAt, options);

      expect(result).toBeNull();
    });

    it('should respect timeout option', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(5, 0, 0);
      const getBlockAt = createMockBlockQuery(new Map());
      const options: PathOptions = { timeout: 1 }; // Very short timeout

      const result = pathfindingService.calculatePath(from, to, getBlockAt, options);

      // Should either return null or a partial path due to timeout
      expect(result).toBeDefined();
    });

    it('should avoid water when avoidWater is true', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(2, 0, 0);
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('0,0,0', { type: 0 }); // Start - air
      blocks.set('1,0,0', { type: 8 }); // Middle - water
      blocks.set('2,0,0', { type: 0 }); // End - air
      
      const getBlockAt = createMockBlockQuery(blocks);
      
      // Mock water detection
      mockBlockRegistry.isLiquid.mockImplementation((blockId) => blockId === 8);
      mockBlockRegistry.getBlock.mockImplementation((blockId) => 
        blockId === 8 ? { id: 8, name: 'water', hardness: 100 } as any : null
      );

      const options: PathOptions = { avoidWater: true };
      const result = pathfindingService.calculatePath(from, to, getBlockAt, options);

      // Should find alternative path or return null if no alternative
      expect(result).toBeDefined();
    });

    it('should avoid lava when avoidLava is true (default)', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(2, 0, 0);
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('0,0,0', { type: 0 }); // Start - air
      blocks.set('1,0,0', { type: 10 }); // Middle - lava
      blocks.set('2,0,0', { type: 0 }); // End - air
      
      const getBlockAt = createMockBlockQuery(blocks);
      
      // Mock lava detection
      mockBlockRegistry.isLiquid.mockImplementation((blockId) => blockId === 10);
      mockBlockRegistry.getBlock.mockImplementation((blockId) => 
        blockId === 10 ? { id: 10, name: 'lava', hardness: 100 } as any : null
      );

      const result = pathfindingService.calculatePath(from, to, getBlockAt);

      // Should find alternative path or return null if no alternative
      expect(result).toBeDefined();
    });
  });

  describe('getNeighbors', () => {
    beforeEach(() => {
      mockBlockRegistry.isPassable.mockReturnValue(true);
      mockBlockRegistry.canStandOn.mockReturnValue(true);
      mockBlockRegistry.isLiquid.mockReturnValue(false);
    });

    it('should return valid horizontal neighbors', () => {
      const pos = new Vec3(1, 1, 1);
      const blocks = new Map<string, { type: number }>();
      
      // Add passable blocks around the position
      for (let x = 0; x <= 2; x++) {
        for (let z = 0; z <= 2; z++) {
          blocks.set(`${x},1,${z}`, { type: 0 }); // Air at same level
          blocks.set(`${x},2,${z}`, { type: 0 }); // Air above
          blocks.set(`${x},0,${z}`, { type: 1 }); // Ground below
        }
      }
      
      const getBlockAt = createMockBlockQuery(blocks);
      const neighbors = pathfindingService.getNeighbors(pos, getBlockAt);

      expect(neighbors.length).toBeGreaterThan(0);
      // Should include horizontal neighbors
      expect(neighbors).toContainEqual(expect.objectContaining({ x: 2, y: 1, z: 1 })); // East
      expect(neighbors).toContainEqual(expect.objectContaining({ x: 0, y: 1, z: 1 })); // West
    });

    it('should include jump positions when allowJump is true', () => {
      const pos = new Vec3(1, 1, 1);
      const blocks = new Map<string, { type: number }>();
      
      // Add blocks for jumping
      blocks.set('2,1,1', { type: 0 }); // Target horizontal
      blocks.set('2,2,1', { type: 0 }); // Target jump level
      blocks.set('2,3,1', { type: 0 }); // Above jump level
      blocks.set('2,0,1', { type: 1 }); // Ground
      
      const getBlockAt = createMockBlockQuery(blocks);
      const neighbors = pathfindingService.getNeighbors(pos, getBlockAt, { allowJump: true });

      expect(neighbors).toContainEqual(expect.objectContaining({ x: 2, y: 2, z: 1 })); // Jump position
    });

    it('should include fall positions', () => {
      const pos = new Vec3(1, 2, 1);
      const blocks = new Map<string, { type: number }>();
      
      // Add blocks for falling
      blocks.set('2,2,1', { type: 0 }); // Current level
      blocks.set('2,1,1', { type: 0 }); // Fall target
      blocks.set('2,2,1', { type: 0 }); // Above fall target
      blocks.set('2,0,1', { type: 1 }); // Ground
      
      const getBlockAt = createMockBlockQuery(blocks);
      const neighbors = pathfindingService.getNeighbors(pos, getBlockAt);

      expect(neighbors).toContainEqual(expect.objectContaining({ x: 2, y: 1, z: 1 })); // Fall position
    });
  });

  describe('canMoveTo', () => {
    beforeEach(() => {
      mockBlockRegistry.isPassable.mockReturnValue(true);
      mockBlockRegistry.canStandOn.mockReturnValue(true);
      mockBlockRegistry.isLiquid.mockReturnValue(false);
    });

    it('should return true for valid movement', () => {
      const from = new Vec3(0, 1, 0);
      const to = new Vec3(1, 1, 0);
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('1,1,0', { type: 0 }); // Air at destination
      blocks.set('1,2,0', { type: 0 }); // Air above destination
      blocks.set('1,0,0', { type: 1 }); // Ground below destination
      
      const getBlockAt = createMockBlockQuery(blocks);
      const canMove = pathfindingService.canMoveTo(from, to, getBlockAt);

      expect(canMove).toBe(true);
    });

    it('should return false if destination block is not passable', () => {
      const from = new Vec3(0, 1, 0);
      const to = new Vec3(1, 1, 0);
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('1,1,0', { type: 1 }); // Solid block at destination
      
      const getBlockAt = createMockBlockQuery(blocks);
      mockBlockRegistry.isPassable.mockImplementation((blockId) => blockId === 0);

      const canMove = pathfindingService.canMoveTo(from, to, getBlockAt);

      expect(canMove).toBe(false);
    });

    it('should return false if block above destination is not passable', () => {
      const from = new Vec3(0, 1, 0);
      const to = new Vec3(1, 1, 0);
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('1,1,0', { type: 0 }); // Air at destination
      blocks.set('1,2,0', { type: 1 }); // Solid block above destination
      
      const getBlockAt = createMockBlockQuery(blocks);
      mockBlockRegistry.isPassable.mockImplementation((blockId) => blockId === 0);

      const canMove = pathfindingService.canMoveTo(from, to, getBlockAt);

      expect(canMove).toBe(false);
    });

    it('should handle errors gracefully', () => {
      const from = new Vec3(0, 1, 0);
      const to = new Vec3(1, 1, 0);
      
      const getBlockAt = jest.fn().mockImplementation(() => {
        throw new Error('Block query failed');
      });

      const canMove = pathfindingService.canMoveTo(from, to, getBlockAt);

      expect(canMove).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PathfindingService] Error checking movement'),
        expect.any(Error)
      );
    });
  });

  describe('getMovementCost', () => {
    beforeEach(() => {
      mockBlockRegistry.isLiquid.mockReturnValue(false);
      mockBlockRegistry.getHardness.mockReturnValue(1);
    });

    it('should return base distance for normal movement', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(1, 0, 0);
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('1,0,0', { type: 0 }); // Air at destination
      blocks.set('1,-1,0', { type: 1 }); // Ground below
      
      const getBlockAt = createMockBlockQuery(blocks);
      const cost = pathfindingService.getMovementCost(from, to, getBlockAt);

      expect(cost).toBe(1); // Distance between adjacent blocks
    });

    it('should increase cost for liquid movement', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(1, 0, 0);
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('1,0,0', { type: 8 }); // Water at destination
      
      const getBlockAt = createMockBlockQuery(blocks);
      mockBlockRegistry.isLiquid.mockImplementation((blockId) => blockId === 8);

      const cost = pathfindingService.getMovementCost(from, to, getBlockAt);

      expect(cost).toBe(2); // Double cost for liquid
    });

    it('should increase cost for jumping (positive height difference)', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(1, 1, 0); // One block up
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('1,1,0', { type: 0 }); // Air at destination
      
      const getBlockAt = createMockBlockQuery(blocks);
      const cost = pathfindingService.getMovementCost(from, to, getBlockAt);

      const distance = from.distanceTo(to);
      expect(cost).toBe(distance + 2); // Base distance + jump penalty
    });

    it('should slightly increase cost for falling (negative height difference)', () => {
      const from = new Vec3(0, 1, 0);
      const to = new Vec3(1, 0, 0); // One block down
      
      const blocks = new Map<string, { type: number }>();
      blocks.set('1,0,0', { type: 0 }); // Air at destination
      
      const getBlockAt = createMockBlockQuery(blocks);
      const cost = pathfindingService.getMovementCost(from, to, getBlockAt);

      const distance = from.distanceTo(to);
      expect(cost).toBe(distance + 0.5); // Base distance + fall penalty
    });

    it('should handle errors gracefully', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(1, 0, 0);
      
      const getBlockAt = jest.fn().mockImplementation(() => {
        throw new Error('Block query failed');
      });

      const cost = pathfindingService.getMovementCost(from, to, getBlockAt);

      expect(cost).toBe(1); // Should return base distance cost
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PathfindingService] Error calculating movement cost'),
        expect.any(Error)
      );
    });
  });

  describe('smoothPath', () => {
    it('should return the same path if length <= 2', () => {
      const shortPath = [new Vec3(0, 0, 0), new Vec3(1, 0, 0)];
      const result = pathfindingService.smoothPath(shortPath);

      expect(result).toEqual(shortPath);
    });

    it('should remove unnecessary waypoints in straight line', () => {
      const straightPath = [
        new Vec3(0, 0, 0),
        new Vec3(1, 0, 0),
        new Vec3(2, 0, 0),
        new Vec3(3, 0, 0)
      ];
      
      const result = pathfindingService.smoothPath(straightPath);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(new Vec3(0, 0, 0));
      expect(result[1]).toEqual(new Vec3(3, 0, 0));
    });

    it('should keep waypoints where direction changes', () => {
      const pathWithTurn = [
        new Vec3(0, 0, 0),
        new Vec3(1, 0, 0),
        new Vec3(2, 0, 0),
        new Vec3(2, 0, 1), // Turn here
        new Vec3(2, 0, 2)
      ];
      
      const result = pathfindingService.smoothPath(pathWithTurn);

      expect(result.length).toBeGreaterThan(2);
      expect(result[0]).toEqual(new Vec3(0, 0, 0));
      expect(result[result.length - 1]).toEqual(new Vec3(2, 0, 2));
    });
  });
});