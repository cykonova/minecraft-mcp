import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Vec3 } from 'vec3';
import { BlockInteractionService } from './BlockInteractionService.js';
import { UnifiedBot } from '../../bots/UnifiedBot.js';

// Mock UnifiedBot
const createMockBot = (edition: 'java' | 'bedrock' = 'java'): jest.Mocked<UnifiedBot> => {
  const mockBot = {
    username: 'testbot',
    edition: edition,
    _bot: edition === 'java' ? {
      dig: jest.fn().mockResolvedValue(undefined),
      placeBlock: jest.fn().mockResolvedValue(undefined),
      activateBlock: jest.fn().mockResolvedValue(undefined)
    } : undefined,
    digBlock: edition === 'bedrock' ? jest.fn().mockResolvedValue(undefined) : undefined,
    placeBlock: edition === 'bedrock' ? jest.fn().mockResolvedValue(undefined) : undefined,
    activateBlock: edition === 'bedrock' ? jest.fn().mockResolvedValue(undefined) : undefined,
    getPosition: jest.fn().mockReturnValue({ x: 0, y: 64, z: 0 }),
    blockAt: jest.fn().mockReturnValue({
      name: 'stone',
      type: 1,
      position: new Vec3(0, 63, 0)
    }),
    inventory: {
      slots: [
        { name: 'diamond_pickaxe', count: 1 },
        { name: 'stone', count: 64 }
      ]
    }
  } as any;

  return mockBot;
};

describe('BlockInteractionService', () => {
  let service: BlockInteractionService;
  let mockJavaBot: jest.Mocked<UnifiedBot>;
  let mockBedrockBot: jest.Mocked<UnifiedBot>;

  beforeEach(() => {
    service = new BlockInteractionService('1.20');
    mockJavaBot = createMockBot('java');
    mockBedrockBot = createMockBot('bedrock');
  });

  describe('Block Properties', () => {
    it('should get block properties by ID', () => {
      const block = service.getBlock(1);
      expect(block).toBeTruthy();
      expect(block?.name).toBe('stone');
    });

    it('should get block properties by name', () => {
      const block = service.getBlockByName('stone');
      expect(block).toBeTruthy();
      expect(block?.id).toBe(1);
    });

    it('should return null for invalid block ID', () => {
      const block = service.getBlock(999999);
      expect(block).toBeNull();
    });

    it('should return null for invalid block name', () => {
      const block = service.getBlockByName('nonexistent_block');
      expect(block).toBeNull();
    });

    it('should correctly identify liquid blocks', () => {
      expect(service.isLiquid(8)).toBe(true);  // water
      expect(service.isLiquid(10)).toBe(true); // lava
      expect(service.isLiquid(1)).toBe(false); // stone
    });

    it('should correctly identify safe blocks', () => {
      expect(service.isSafe(1)).toBe(true);   // stone
      expect(service.isSafe(8)).toBe(false);  // water
      expect(service.isSafe(10)).toBe(false); // lava
    });

    it('should correctly identify solid blocks', () => {
      expect(service.isSolid(1)).toBe(true);  // stone
      expect(service.isSolid(0)).toBe(false); // air
      expect(service.isSolid(8)).toBe(false); // water
    });

    it('should correctly identify climbable blocks', () => {
      expect(service.isClimbable(65)).toBe(true);  // ladder
      expect(service.isClimbable(106)).toBe(true); // vine
      expect(service.isClimbable(1)).toBe(false);  // stone
    });

    it('should correctly identify replaceable blocks', () => {
      expect(service.isReplaceable(0)).toBe(true);  // air
      expect(service.isReplaceable(31)).toBe(true); // grass
      expect(service.isReplaceable(1)).toBe(false); // stone
    });

    it('should correctly identify transparent blocks', () => {
      expect(service.isTransparent(0)).toBe(true);  // air
      expect(service.isTransparent(20)).toBe(true); // glass
      expect(service.isTransparent(1)).toBe(false); // stone
    });

    it('should correctly identify blocks that can be stood on', () => {
      expect(service.canStandOn(1)).toBe(true);  // stone
      expect(service.canStandOn(0)).toBe(false); // air
      expect(service.canStandOn(8)).toBe(false); // water
    });
  });

  describe('Block Interaction - Java Edition', () => {
    beforeEach(() => {
      // Setup Java bot mock responses
      mockJavaBot.blockAt.mockReturnValue({
        name: 'stone',
        type: 1,
        position: new Vec3(1, 64, 1)
      });
    });

    it('should break a block using Java bot', async () => {
      const position = new Vec3(1, 64, 1);
      
      await service.breakBlock(mockJavaBot, position);
      
      expect(mockJavaBot._bot?.dig).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'stone',
          type: 1,
          position: position
        })
      );
    });

    it('should place a block using Java bot', async () => {
      const position = new Vec3(1, 65, 1);
      const referenceBlock = { name: 'stone', type: 1, position: new Vec3(1, 64, 1) };
      const face = new Vec3(0, 1, 0);
      
      // Mock finding placement face
      mockJavaBot.blockAt.mockImplementation((pos: Vec3) => {
        if (pos.equals(position)) return { name: 'air', type: 0 };
        if (pos.equals(new Vec3(1, 64, 1))) return referenceBlock;
        return { name: 'air', type: 0 };
      });

      await service.placeBlock(mockJavaBot, position, 'stone', {
        referenceBlock,
        face
      });
      
      expect(mockJavaBot._bot?.placeBlock).toHaveBeenCalledWith(referenceBlock, face);
    });

    it('should activate a block using Java bot', async () => {
      const position = new Vec3(1, 64, 1);
      const block = { name: 'chest', type: 54, position };
      
      mockJavaBot.blockAt.mockReturnValue(block);
      
      await service.activateBlock(mockJavaBot, position);
      
      expect(mockJavaBot._bot?.activateBlock).toHaveBeenCalledWith(block);
    });

    it('should throw error when trying to break air', async () => {
      const position = new Vec3(1, 64, 1);
      mockJavaBot.blockAt.mockReturnValue({ name: 'air', type: 0 });
      
      await expect(service.breakBlock(mockJavaBot, position))
        .rejects.toThrow('No block to break at position');
    });

    it('should throw error when bot lacks Java dig capability', async () => {
      const position = new Vec3(1, 64, 1);
      mockJavaBot._bot = undefined;
      
      await expect(service.breakBlock(mockJavaBot, position))
        .rejects.toThrow('Java bot does not support digging');
    });
  });

  describe('Block Interaction - Bedrock Edition', () => {
    beforeEach(() => {
      // Setup Bedrock bot mock responses
      mockBedrockBot.blockAt.mockReturnValue({
        name: 'stone',
        type: 1,
        position: new Vec3(1, 64, 1)
      });
    });

    it('should break a block using Bedrock bot', async () => {
      const position = new Vec3(1, 64, 1);
      
      await service.breakBlock(mockBedrockBot, position);
      
      expect(mockBedrockBot.digBlock).toHaveBeenCalledWith(position);
    });

    it('should place a block using Bedrock bot', async () => {
      const position = new Vec3(1, 65, 1);
      const referenceBlock = { name: 'stone', type: 1, position: new Vec3(1, 64, 1) };
      const face = new Vec3(0, 1, 0);
      
      // Mock finding placement face
      mockBedrockBot.blockAt.mockImplementation((pos: Vec3) => {
        if (pos.equals(position)) return { name: 'air', type: 0 };
        if (pos.equals(new Vec3(1, 64, 1))) return referenceBlock;
        return { name: 'air', type: 0 };
      });

      await service.placeBlock(mockBedrockBot, position, 'stone', {
        referenceBlock,
        face
      });
      
      expect(mockBedrockBot.placeBlock).toHaveBeenCalledWith(referenceBlock, face);
    });

    it('should activate a block using Bedrock bot', async () => {
      const position = new Vec3(1, 64, 1);
      const block = { name: 'chest', type: 54, position };
      
      mockBedrockBot.blockAt.mockReturnValue(block);
      
      await service.activateBlock(mockBedrockBot, position);
      
      expect(mockBedrockBot.activateBlock).toHaveBeenCalledWith(block);
    });

    it('should throw error when bot lacks Bedrock dig capability', async () => {
      const position = new Vec3(1, 64, 1);
      mockBedrockBot.digBlock = undefined;
      
      await expect(service.breakBlock(mockBedrockBot, position))
        .rejects.toThrow('Bedrock bot does not support digging');
    });
  });

  describe('Block Validation', () => {
    it('should validate block operations correctly', () => {
      const position = new Vec3(1, 64, 1);
      mockJavaBot.getPosition.mockReturnValue({ x: 0, y: 64, z: 0 });
      
      const breakValidation = service.validateBlockOperation(mockJavaBot, position, 'break');
      expect(breakValidation.isValid).toBe(true);
      expect(breakValidation.isReachable).toBe(true);
    });

    it('should detect unreachable blocks', () => {
      const position = new Vec3(100, 64, 100);
      mockJavaBot.getPosition.mockReturnValue({ x: 0, y: 64, z: 0 });
      
      const validation = service.validateBlockOperation(mockJavaBot, position, 'break');
      expect(validation.isReachable).toBe(false);
      expect(validation.reason).toBe('Block is too far away');
    });

    it('should detect bedrock as unbreakable', () => {
      const position = new Vec3(1, 0, 1);
      mockJavaBot.blockAt.mockReturnValue({ name: 'bedrock', type: 7 });
      
      const validation = service.validateBlockOperation(mockJavaBot, position, 'break');
      expect(validation.isValid).toBe(false);
      expect(validation.reason).toBe('Cannot break bedrock');
    });

    it('should validate placement in empty space', () => {
      const position = new Vec3(1, 65, 1);
      mockJavaBot.blockAt.mockReturnValue({ name: 'air', type: 0 });
      
      const validation = service.validateBlockOperation(mockJavaBot, position, 'place');
      expect(validation.isValid).toBe(true);
    });

    it('should reject placement in occupied space', () => {
      const position = new Vec3(1, 64, 1);
      mockJavaBot.blockAt.mockReturnValue({ name: 'stone', type: 1 });
      
      const validation = service.validateBlockOperation(mockJavaBot, position, 'place');
      expect(validation.isValid).toBe(false);
      expect(validation.reason).toBe('Position is not empty and not replaceable');
    });
  });

  describe('Block Utilities', () => {
    it('should check block reachability', () => {
      mockJavaBot.getPosition.mockReturnValue({ x: 0, y: 64, z: 0 });
      
      expect(service.isBlockReachable(mockJavaBot, new Vec3(4, 64, 0))).toBe(true);
      expect(service.isBlockReachable(mockJavaBot, new Vec3(10, 64, 0))).toBe(false);
    });

    it('should find nearest block', () => {
      mockJavaBot.getPosition.mockReturnValue({ x: 0, y: 64, z: 0 });
      mockJavaBot.blockAt.mockImplementation((pos: Vec3) => {
        if (pos.equals(new Vec3(2, 64, 0))) return { name: 'diamond_ore', type: 56 };
        if (pos.equals(new Vec3(5, 64, 0))) return { name: 'diamond_ore', type: 56 };
        return { name: 'stone', type: 1 };
      });
      
      const nearest = service.findNearestBlock(mockJavaBot, 'diamond_ore', { maxDistance: 10 });
      expect(nearest).toEqual(new Vec3(2, 64, 0));
    });

    it('should find blocks in range', () => {
      mockJavaBot.getPosition.mockReturnValue({ x: 0, y: 64, z: 0 });
      mockJavaBot.blockAt.mockImplementation((pos: Vec3) => {
        if (pos.x >= 1 && pos.x <= 3 && pos.y === 64 && pos.z === 0) {
          return { name: 'coal_ore', type: 16 };
        }
        return { name: 'stone', type: 1 };
      });
      
      const blocks = service.findBlocksInRange(mockJavaBot, 'coal_ore', { maxDistance: 5 });
      expect(blocks.length).toBe(3);
    });

    it('should identify safe positions', () => {
      const position = new Vec3(0, 65, 0);
      mockJavaBot.blockAt.mockImplementation((pos: Vec3) => {
        if (pos.equals(position)) return { name: 'air', type: 0 };
        if (pos.equals(position.offset(0, 1, 0))) return { name: 'air', type: 0 };
        if (pos.equals(position.offset(0, -1, 0))) return { name: 'stone', type: 1 };
        return { name: 'air', type: 0 };
      });
      
      expect(service.isSafePosition(mockJavaBot, position)).toBe(true);
    });

    it('should find safe positions near target', () => {
      const target = new Vec3(0, 64, 0);
      mockJavaBot.blockAt.mockImplementation((pos: Vec3) => {
        // Safe position at (1, 65, 0)
        if (pos.equals(new Vec3(1, 65, 0))) return { name: 'air', type: 0 };
        if (pos.equals(new Vec3(1, 66, 0))) return { name: 'air', type: 0 };
        if (pos.equals(new Vec3(1, 64, 0))) return { name: 'stone', type: 1 };
        return { name: 'air', type: 0 };
      });
      
      const safePos = service.findSafePosition(mockJavaBot, target);
      expect(safePos).toBeTruthy();
    });

    it('should get best tool for block', () => {
      mockJavaBot.inventory = {
        slots: [
          { name: 'diamond_pickaxe', count: 1 },
          { name: 'wooden_axe', count: 1 },
          { name: 'iron_shovel', count: 1 }
        ]
      };
      
      const tool = service.getBestTool(mockJavaBot, 'stone');
      expect(tool?.name).toBe('diamond_pickaxe');
    });

    it('should calculate break time', () => {
      const position = new Vec3(1, 64, 1);
      mockJavaBot.blockAt.mockReturnValue({ name: 'stone', type: 1 });
      
      const breakTime = service.calculateBreakTime(mockJavaBot, position);
      expect(breakTime).toBeGreaterThan(0);
      
      const tool = { name: 'diamond_pickaxe' };
      const toolBreakTime = service.calculateBreakTime(mockJavaBot, position, tool);
      expect(toolBreakTime).toBeLessThan(breakTime);
    });

    it('should get adjacent positions', () => {
      const center = new Vec3(0, 0, 0);
      const adjacent = service.getAdjacentPositions(center, false);
      
      expect(adjacent).toHaveLength(6);
      expect(adjacent).toContainEqual(new Vec3(0, 1, 0));
      expect(adjacent).toContainEqual(new Vec3(0, -1, 0));
      expect(adjacent).toContainEqual(new Vec3(1, 0, 0));
      expect(adjacent).toContainEqual(new Vec3(-1, 0, 0));
      expect(adjacent).toContainEqual(new Vec3(0, 0, 1));
      expect(adjacent).toContainEqual(new Vec3(0, 0, -1));
    });

    it('should get adjacent positions including diagonals', () => {
      const center = new Vec3(0, 0, 0);
      const adjacent = service.getAdjacentPositions(center, true);
      
      expect(adjacent.length).toBeGreaterThan(6);
    });

    it('should find placement face', () => {
      const position = new Vec3(0, 65, 0);
      mockJavaBot.blockAt.mockImplementation((pos: Vec3) => {
        if (pos.equals(new Vec3(0, 64, 0))) {
          return { name: 'stone', type: 1 };
        }
        return { name: 'air', type: 0 };
      });
      
      const placementInfo = service.findPlacementFace(mockJavaBot, position);
      expect(placementInfo).toBeTruthy();
      expect(placementInfo?.face).toEqual(new Vec3(0, 1, 0));
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported bot edition', async () => {
      const invalidBot = { ...mockJavaBot, edition: 'invalid' as any };
      const position = new Vec3(1, 64, 1);
      
      await expect(service.breakBlock(invalidBot, position))
        .rejects.toThrow('Unsupported bot edition: invalid');
    });

    it('should handle validation errors gracefully', () => {
      const position = new Vec3(1, 64, 1);
      mockJavaBot.blockAt.mockImplementation(() => {
        throw new Error('Mock error');
      });
      
      const validation = service.validateBlockOperation(mockJavaBot, position, 'break');
      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('Validation error');
    });

    it('should handle missing inventory gracefully', () => {
      mockJavaBot.inventory = undefined;
      const tool = service.getBestTool(mockJavaBot, 'stone');
      expect(tool).toBeNull();
    });
  });
});