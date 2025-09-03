import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Vec3 } from 'vec3';
import { MovementService } from './MovementService.js';
import { IPathfindingService } from '../pathfinding/IPathfindingService.js';
import { BlockRegistry } from '../BlockRegistry.js';
import { UnifiedBot } from '../../bots/UnifiedBot.js';
import { MovementType, MovementOptions } from './IMovementService.js';

// Mock dependencies
const mockPathfindingService: jest.Mocked<IPathfindingService> = {
  calculatePath: jest.fn(),
  smoothPath: jest.fn(),
  canMoveTo: jest.fn(),
  getMovementCost: jest.fn(),
  getNeighbors: jest.fn()
};

const mockBlockRegistry: jest.Mocked<BlockRegistry> = {
  isLiquid: jest.fn(),
  getHardness: jest.fn(),
  getBlockName: jest.fn(),
  isPassable: jest.fn(),
  getBlockProperties: jest.fn()
} as any;

const mockJavaBot: jest.Mocked<Partial<UnifiedBot>> = {
  username: 'TestJavaBot',
  edition: 'java',
  getPosition: jest.fn(),
  blockAt: jest.fn(),
  nearestEntity: jest.fn(),
  pathfinder: {
    stop: jest.fn(),
    setGoal: jest.fn()
  } as any,
  navigate: {
    to: jest.fn(),
    stop: jest.fn()
  } as any,
  _bot: {
    setControlState: jest.fn(),
    clearControlStates: jest.fn()
  } as any,
  lookAt: jest.fn()
};

const mockBedrockBot: jest.Mocked<Partial<UnifiedBot>> = {
  username: 'TestBedrockBot',
  edition: 'bedrock',
  getPosition: jest.fn(),
  blockAt: jest.fn(),
  nearestEntity: jest.fn(),
  moveTo: jest.fn(),
  navigateTo: jest.fn(),
  lookAt: jest.fn()
};

describe('MovementService', () => {
  let movementService: MovementService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize service with mocked dependencies
    movementService = new MovementService(mockPathfindingService, mockBlockRegistry);

    // Setup common mock implementations
    mockJavaBot.getPosition?.mockReturnValue({ x: 0, y: 64, z: 0 });
    mockBedrockBot.getPosition?.mockReturnValue({ x: 0, y: 64, z: 0 });
    mockBlockRegistry.isLiquid.mockReturnValue(false);
    mockBlockRegistry.getHardness.mockReturnValue(2);
    mockPathfindingService.calculatePath.mockReturnValue([
      new Vec3(0, 64, 0),
      new Vec3(5, 64, 0),
      new Vec3(10, 64, 0)
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('moveTo', () => {
    it('should successfully move Java bot to target position', async () => {
      const target = new Vec3(10, 64, 0);
      const options: MovementOptions = { timeout: 5000, tolerance: 1.0 };

      // Mock successful pathfinding
      mockPathfindingService.calculatePath.mockReturnValue([target]);
      (mockJavaBot.navigate!.to as jest.Mock).mockResolvedValue(undefined);

      const result = await movementService.moveTo(mockJavaBot as UnifiedBot, target, options);

      expect(result.success).toBe(true);
      expect(mockPathfindingService.calculatePath).toHaveBeenCalled();
      expect(mockJavaBot.navigate!.to).toHaveBeenCalledWith(target);
    });

    it('should successfully move Bedrock bot to target position', async () => {
      const target = new Vec3(10, 64, 0);
      const options: MovementOptions = { timeout: 5000 };

      (mockBedrockBot.moveTo as jest.Mock).mockResolvedValue(undefined);
      mockBedrockBot.getPosition!.mockReturnValueOnce({ x: 0, y: 64, z: 0 })
                                  .mockReturnValueOnce({ x: 10, y: 64, z: 0 });

      const result = await movementService.moveTo(mockBedrockBot as UnifiedBot, target, options);

      expect(result.success).toBe(true);
      expect(mockBedrockBot.moveTo).toHaveBeenCalledWith(target);
    });

    it('should handle failed pathfinding for Java bot', async () => {
      const target = new Vec3(10, 64, 0);
      
      // Mock failed pathfinding
      mockPathfindingService.calculatePath.mockReturnValue(null);

      const result = await movementService.moveTo(mockJavaBot as UnifiedBot, target);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No path found');
    });

    it('should respect movement options', async () => {
      const target = new Vec3(5, 64, 0);
      const options: MovementOptions = {
        sprint: true,
        sneak: false,
        allowJump: true,
        speed: 1.5
      };

      mockPathfindingService.calculatePath.mockReturnValue([target]);
      (mockJavaBot.navigate!.to as jest.Mock).mockResolvedValue(undefined);

      await movementService.moveTo(mockJavaBot as UnifiedBot, target, options);

      // Check that movement state was updated correctly
      const state = movementService.getMovementState(mockJavaBot as UnifiedBot);
      expect(state.isSprinting).toBe(false); // State should be reset after movement
    });

    it('should validate movement when requested', async () => {
      const target = new Vec3(1000, 64, 0); // Very far target
      const options: MovementOptions = { validateMovement: true };

      const result = await movementService.moveTo(mockJavaBot as UnifiedBot, target, options);

      // Should succeed despite warning about distance
      expect(result).toBeDefined();
    });
  });

  describe('jump', () => {
    it('should make Java bot jump', async () => {
      mockJavaBot.getPosition!.mockReturnValueOnce({ x: 0, y: 64, z: 0 })
                               .mockReturnValueOnce({ x: 0, y: 65, z: 0 });

      const result = await movementService.jump(mockJavaBot as UnifiedBot);

      expect(result.success).toBe(true);
      expect(mockJavaBot._bot!.setControlState).toHaveBeenCalledWith('jump', true);
      expect(mockJavaBot._bot!.setControlState).toHaveBeenCalledWith('jump', false);
    });

    it('should make Bedrock bot jump', async () => {
      const height = 1.5;
      (mockBedrockBot.moveTo as jest.Mock).mockResolvedValue(undefined);
      mockBedrockBot.getPosition!.mockReturnValueOnce({ x: 0, y: 64, z: 0 })
                                  .mockReturnValueOnce({ x: 0, y: 65.5, z: 0 });

      const result = await movementService.jump(mockBedrockBot as UnifiedBot, height);

      expect(result.success).toBe(true);
      expect(mockBedrockBot.moveTo).toHaveBeenCalledWith(
        expect.objectContaining({ y: 64 + height })
      );
    });
  });

  describe('sprint', () => {
    it('should enable sprinting for Java bot', async () => {
      const result = await movementService.sprint(mockJavaBot as UnifiedBot, true);

      expect(result).toBe(true);
      expect(mockJavaBot._bot!.setControlState).toHaveBeenCalledWith('sprint', true);
      
      const state = movementService.getMovementState(mockJavaBot as UnifiedBot);
      expect(state.isSprinting).toBe(true);
    });

    it('should disable sprinting for Java bot', async () => {
      const result = await movementService.sprint(mockJavaBot as UnifiedBot, false);

      expect(result).toBe(true);
      expect(mockJavaBot._bot!.setControlState).toHaveBeenCalledWith('sprint', false);
      
      const state = movementService.getMovementState(mockJavaBot as UnifiedBot);
      expect(state.isSprinting).toBe(false);
    });

    it('should handle sprinting for Bedrock bot', async () => {
      const result = await movementService.sprint(mockBedrockBot as UnifiedBot, true);

      // Bedrock bots don't have direct sprint control but should return success
      expect(result).toBe(true);
      
      const state = movementService.getMovementState(mockBedrockBot as UnifiedBot);
      expect(state.isSprinting).toBe(true);
    });
  });

  describe('sneak', () => {
    it('should enable sneaking for Java bot', async () => {
      const result = await movementService.sneak(mockJavaBot as UnifiedBot, true);

      expect(result).toBe(true);
      expect(mockJavaBot._bot!.setControlState).toHaveBeenCalledWith('sneak', true);
      
      const state = movementService.getMovementState(mockJavaBot as UnifiedBot);
      expect(state.isSneaking).toBe(true);
    });

    it('should disable sneaking for Java bot', async () => {
      const result = await movementService.sneak(mockJavaBot as UnifiedBot, false);

      expect(result).toBe(true);
      expect(mockJavaBot._bot!.setControlState).toHaveBeenCalledWith('sneak', false);
    });
  });

  describe('swim', () => {
    it('should swim to target position', async () => {
      const target = new Vec3(10, 64, 0);
      
      // Mock being in water
      mockBlockRegistry.isLiquid.mockReturnValue(true);
      mockJavaBot.blockAt!.mockReturnValue({ type: 8, name: 'water' }); // Water block
      
      mockPathfindingService.calculatePath.mockReturnValue([target]);
      (mockJavaBot.navigate!.to as jest.Mock).mockResolvedValue(undefined);

      const result = await movementService.swim(mockJavaBot as UnifiedBot, target);

      expect(result.success).toBe(true);
      const state = movementService.getMovementState(mockJavaBot as UnifiedBot);
      expect(state.isSwimming).toBe(false); // Should be reset after movement
    });
  });

  describe('stop', () => {
    it('should stop Java bot movement', async () => {
      const result = await movementService.stop(mockJavaBot as UnifiedBot);

      expect(result).toBe(true);
      expect(mockJavaBot.pathfinder!.stop).toHaveBeenCalled();
      expect(mockJavaBot.navigate!.stop).toHaveBeenCalled();
      expect(mockJavaBot._bot!.clearControlStates).toHaveBeenCalled();
    });

    it('should stop Bedrock bot movement', async () => {
      (mockBedrockBot.moveTo as jest.Mock).mockResolvedValue(undefined);

      const result = await movementService.stop(mockBedrockBot as UnifiedBot);

      expect(result).toBe(true);
      expect(mockBedrockBot.moveTo).toHaveBeenCalled();
    });
  });

  describe('validateMovement', () => {
    it('should validate successful movement', async () => {
      const target = new Vec3(5, 64, 0);

      const validation = await movementService.validateMovement(mockJavaBot as UnifiedBot, target);

      expect(validation.canMove).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect distance warnings', async () => {
      const target = new Vec3(1500, 64, 0); // Very far target

      const validation = await movementService.validateMovement(mockJavaBot as UnifiedBot, target);

      expect(validation.warnings.some(w => w.includes('very far'))).toBe(true);
    });

    it('should detect pathfinding issues', async () => {
      // Mock bot without pathfinder
      const botWithoutPathfinder = { ...mockJavaBot, pathfinder: undefined };

      const validation = await movementService.validateMovement(
        botWithoutPathfinder as UnifiedBot, 
        new Vec3(10, 64, 0)
      );

      expect(validation.canMove).toBe(false);
      expect(validation.errors.some(e => e.includes('pathfinder'))).toBe(true);
    });
  });

  describe('detectObstacles', () => {
    it('should detect block obstacles', async () => {
      const target = new Vec3(5, 64, 0);
      
      // Mock obstacle block
      mockJavaBot.blockAt!.mockImplementation((pos: Vec3) => {
        if (pos.x === 2 || pos.x === 3) {
          return { type: 1, name: 'stone' }; // Solid block
        }
        return { type: 0, name: 'air' }; // Air
      });
      
      mockBlockRegistry.getHardness.mockReturnValue(5);

      const obstacles = await movementService.detectObstacles(mockJavaBot as UnifiedBot, target);

      expect(obstacles.length).toBeGreaterThan(0);
      expect(obstacles.some(obs => obs.name === 'stone')).toBe(true);
    });

    it('should detect entity obstacles', async () => {
      const target = new Vec3(5, 64, 0);
      
      // Mock nearby entity
      mockJavaBot.nearestEntity!.mockReturnValue({
        position: new Vec3(3, 64, 0),
        type: 'zombie',
        username: undefined
      });

      const obstacles = await movementService.detectObstacles(mockJavaBot as UnifiedBot, target);

      expect(obstacles.some(obs => obs.type === 'entity' && obs.name === 'zombie')).toBe(true);
    });
  });

  describe('findAlternativePosition', () => {
    it('should find alternative position when direct path is blocked', async () => {
      const target = new Vec3(10, 64, 0);
      const radius = 3;

      // Mock successful alternative validation
      mockPathfindingService.calculatePath.mockImplementation((from, to) => {
        // Fail for direct target, succeed for alternatives
        if (to.equals(target)) {
          return null;
        }
        return [from, to];
      });

      const alternative = await movementService.findAlternativePosition(
        mockJavaBot as UnifiedBot, 
        target, 
        radius
      );

      expect(alternative).not.toBeNull();
      expect(alternative!.distanceTo(target)).toBeLessThanOrEqual(radius);
    });

    it('should return null when no alternative found', async () => {
      const target = new Vec3(10, 64, 0);
      const radius = 2;

      // Mock all paths failing
      mockPathfindingService.calculatePath.mockReturnValue(null);

      const alternative = await movementService.findAlternativePosition(
        mockJavaBot as UnifiedBot, 
        target, 
        radius
      );

      expect(alternative).toBeNull();
    });
  });

  describe('smoothMove', () => {
    it('should perform smooth movement interpolation', async () => {
      const from = new Vec3(0, 64, 0);
      const to = new Vec3(10, 64, 0);
      const duration = 1000;

      (mockBedrockBot.moveTo as jest.Mock).mockResolvedValue(undefined);
      mockBedrockBot.getPosition!.mockReturnValue({ x: 10, y: 64, z: 0 });

      const result = await movementService.smoothMove(
        mockBedrockBot as UnifiedBot, 
        from, 
        to, 
        duration, 
        'ease-out'
      );

      expect(result.success).toBe(true);
      expect(mockBedrockBot.moveTo).toHaveBeenCalled();
      expect(result.timeTaken).toBeGreaterThan(duration * 0.8); // Should take roughly the expected time
    });
  });

  describe('followPath', () => {
    it('should follow a path of waypoints', async () => {
      const path = [
        new Vec3(2, 64, 0),
        new Vec3(5, 64, 0),
        new Vec3(10, 64, 0)
      ];

      mockPathfindingService.calculatePath.mockImplementation((from, to) => [to]);
      (mockJavaBot.navigate!.to as jest.Mock).mockResolvedValue(undefined);

      const result = await movementService.followPath(mockJavaBot as UnifiedBot, path);

      expect(result.success).toBe(true);
      expect(mockJavaBot.navigate!.to).toHaveBeenCalledTimes(path.length);
    });

    it('should handle empty path', async () => {
      const result = await movementService.followPath(mockJavaBot as UnifiedBot, []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty path');
    });
  });

  describe('emergencyStop', () => {
    it('should perform emergency stop for Java bot', async () => {
      const result = await movementService.emergencyStop(mockJavaBot as UnifiedBot);

      expect(result).toBe(true);
      expect(mockJavaBot.pathfinder!.stop).toHaveBeenCalled();
    });

    it('should perform emergency stop for Bedrock bot', async () => {
      (mockBedrockBot.moveTo as jest.Mock).mockResolvedValue(undefined);

      const result = await movementService.emergencyStop(mockBedrockBot as UnifiedBot);

      expect(result).toBe(true);
    });
  });

  describe('canReach', () => {
    it('should return true for reachable position with Java bot', async () => {
      const target = new Vec3(10, 64, 0);
      
      mockPathfindingService.calculatePath.mockReturnValue([target]);

      const canReach = await movementService.canReach(mockJavaBot as UnifiedBot, target);

      expect(canReach).toBe(true);
    });

    it('should return false for unreachable position', async () => {
      const target = new Vec3(10, 64, 0);
      
      mockPathfindingService.calculatePath.mockReturnValue(null);

      const canReach = await movementService.canReach(mockJavaBot as UnifiedBot, target);

      expect(canReach).toBe(false);
    });

    it('should use distance check for Bedrock bot', async () => {
      const target = new Vec3(10, 64, 0);

      const canReach = await movementService.canReach(mockBedrockBot as UnifiedBot, target);

      expect(canReach).toBe(true); // Within reasonable distance
    });
  });

  describe('calculateOptimalSpeed', () => {
    it('should calculate base speed for normal terrain', () => {
      const target = new Vec3(10, 64, 0);

      const speed = movementService.calculateOptimalSpeed(mockJavaBot as UnifiedBot, target);

      expect(speed).toBe(1.0);
    });

    it('should reduce speed for water terrain', () => {
      const target = new Vec3(10, 64, 0);

      const speed = movementService.calculateOptimalSpeed(mockJavaBot as UnifiedBot, target, 'water');

      expect(speed).toBe(0.6);
    });

    it('should increase speed for ice terrain', () => {
      const target = new Vec3(10, 64, 0);

      const speed = movementService.calculateOptimalSpeed(mockJavaBot as UnifiedBot, target, 'ice');

      expect(speed).toBe(1.2);
    });

    it('should reduce speed for elevation changes', () => {
      const target = new Vec3(10, 80, 0); // 16 blocks higher
      mockJavaBot.getPosition!.mockReturnValue({ x: 0, y: 64, z: 0 });

      const speed = movementService.calculateOptimalSpeed(mockJavaBot as UnifiedBot, target);

      expect(speed).toBeLessThan(1.0);
    });
  });

  describe('recoverFromStuck', () => {
    it('should attempt recovery movements', async () => {
      mockJavaBot.getPosition!.mockReturnValue({ x: 0, y: 64, z: 0 });
      
      // Mock first few attempts failing, last one succeeding
      let callCount = 0;
      mockPathfindingService.calculatePath.mockImplementation(() => {
        callCount++;
        return callCount > 3 ? [new Vec3(1, 64, 0)] : null;
      });

      (mockJavaBot.navigate!.to as jest.Mock).mockResolvedValue(undefined);

      const result = await movementService.recoverFromStuck(mockJavaBot as UnifiedBot, 3);

      expect(result).toBe(true);
      expect(mockJavaBot.pathfinder!.stop).toHaveBeenCalled();
    });

    it('should fail after max attempts', async () => {
      // Mock all recovery attempts failing
      mockPathfindingService.calculatePath.mockReturnValue(null);

      const result = await movementService.recoverFromStuck(mockJavaBot as UnifiedBot, 2);

      expect(result).toBe(false);
    });
  });

  describe('getMovementState', () => {
    it('should return default state for new bot', () => {
      const state = movementService.getMovementState(mockJavaBot as UnifiedBot);

      expect(state).toEqual({
        isMoving: false,
        isSprinting: false,
        isSneaking: false,
        isJumping: false,
        isSwimming: false,
        isFlying: false
      });
    });

    it('should return updated state after movement operations', async () => {
      await movementService.sprint(mockJavaBot as UnifiedBot, true);
      await movementService.sneak(mockJavaBot as UnifiedBot, true);

      const state = movementService.getMovementState(mockJavaBot as UnifiedBot);

      expect(state.isSprinting).toBe(true);
      expect(state.isSneaking).toBe(true);
    });
  });
});