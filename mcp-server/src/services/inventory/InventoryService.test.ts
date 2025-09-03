/**
 * Unit tests for InventoryService
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { container, DependencyContainer } from 'tsyringe';
import { InventoryService } from './InventoryService.js';
import { JavaInventoryStrategy } from './strategies/JavaInventoryStrategy.js';
import { BedrockInventoryStrategy } from './strategies/BedrockInventoryStrategy.js';
import { UnifiedBot } from '../../bots/UnifiedBot.js';
import {
  InventoryItem,
  InventoryState,
  FindItemOptions,
  InventoryOperationResult
} from './IInventoryService.js';

// Mock the strategies
jest.mock('./strategies/JavaInventoryStrategy.js');
jest.mock('./strategies/BedrockInventoryStrategy.js');

describe('InventoryService', () => {
  let inventoryService: InventoryService;
  let mockJavaStrategy: jest.Mocked<JavaInventoryStrategy>;
  let mockBedrockStrategy: jest.Mocked<BedrockInventoryStrategy>;
  let mockJavaBot: UnifiedBot;
  let mockBedrockBot: UnifiedBot;
  let testContainer: DependencyContainer;

  beforeEach(() => {
    // Create a new container for each test
    testContainer = container.createChildContainer();

    // Create mock strategies
    mockJavaStrategy = {
      getEdition: jest.fn().mockReturnValue('java'),
      initialize: jest.fn().mockResolvedValue(undefined),
      getInventoryState: jest.fn(),
      findItems: jest.fn(),
      getItemBySlot: jest.fn(),
      moveItem: jest.fn(),
      equipItem: jest.fn(),
      unequipItem: jest.fn(),
      dropItem: jest.fn(),
      pickupNearbyItems: jest.fn(),
      getEquippedItems: jest.fn(),
      getHotbarItems: jest.fn(),
      setHotbarSlot: jest.fn(),
      getActiveHotbarSlot: jest.fn(),
      validateItemName: jest.fn(),
      getClosestItemName: jest.fn(),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockBedrockStrategy = {
      getEdition: jest.fn().mockReturnValue('bedrock'),
      initialize: jest.fn().mockResolvedValue(undefined),
      getInventoryState: jest.fn(),
      findItems: jest.fn(),
      getItemBySlot: jest.fn(),
      moveItem: jest.fn(),
      equipItem: jest.fn(),
      unequipItem: jest.fn(),
      dropItem: jest.fn(),
      pickupNearbyItems: jest.fn(),
      getEquippedItems: jest.fn(),
      getHotbarItems: jest.fn(),
      setHotbarSlot: jest.fn(),
      getActiveHotbarSlot: jest.fn(),
      validateItemName: jest.fn(),
      getClosestItemName: jest.fn(),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Register mocks in container
    testContainer.registerInstance('JavaInventoryStrategy', mockJavaStrategy);
    testContainer.registerInstance('BedrockInventoryStrategy', mockBedrockStrategy);
    testContainer.registerSingleton(InventoryService);

    // Create service instance
    inventoryService = testContainer.resolve(InventoryService);

    // Create mock bots
    mockJavaBot = createMockBot('TestJavaBot', 'java');
    mockBedrockBot = createMockBot('TestBedrockBot', 'bedrock');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockBot(username: string, edition: 'java' | 'bedrock'): UnifiedBot {
    return {
      username,
      edition,
      _bot: {},
      getPosition: jest.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
      lookAt: jest.fn().mockResolvedValue(undefined),
      chat: jest.fn().mockResolvedValue(undefined),
      whisper: jest.fn(),
      blockAt: jest.fn(),
      nearestEntity: jest.fn(),
      equip: jest.fn().mockResolvedValue(undefined),
      tossStack: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      quit: jest.fn(),
      end: jest.fn()
    } as any;
  }

  function createMockInventoryItem(name: string, count: number = 1, slot: number = 0): InventoryItem {
    return {
      id: 1,
      name,
      displayName: name,
      count,
      slot
    };
  }

  function createMockInventoryState(items: InventoryItem[] = []): InventoryState {
    return {
      items,
      totalSlots: 36,
      usedSlots: items.length,
      freeSlots: 36 - items.length,
      hotbarItems: items.filter(item => item.slot >= 0 && item.slot <= 8),
      armorItems: [],
      lastUpdated: new Date()
    };
  }

  describe('initialization', () => {
    it('should initialize Java bot with Java strategy', async () => {
      await inventoryService.initialize(mockJavaBot);

      expect(mockJavaStrategy.initialize).toHaveBeenCalledWith(mockJavaBot);
      expect(mockBedrockStrategy.initialize).not.toHaveBeenCalled();
    });

    it('should initialize Bedrock bot with Bedrock strategy', async () => {
      await inventoryService.initialize(mockBedrockBot);

      expect(mockBedrockStrategy.initialize).toHaveBeenCalledWith(mockBedrockBot);
      expect(mockJavaStrategy.initialize).not.toHaveBeenCalled();
    });

    it('should not reinitialize already initialized bot', async () => {
      await inventoryService.initialize(mockJavaBot);
      await inventoryService.initialize(mockJavaBot);

      expect(mockJavaStrategy.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('getInventoryState', () => {
    it('should return inventory state from Java strategy', async () => {
      const mockState = createMockInventoryState([
        createMockInventoryItem('stone', 64, 0),
        createMockInventoryItem('dirt', 32, 1)
      ]);

      mockJavaStrategy.getInventoryState.mockResolvedValue(mockState);

      const result = await inventoryService.getInventoryState(mockJavaBot);

      expect(result).toBe(mockState);
      expect(mockJavaStrategy.getInventoryState).toHaveBeenCalledWith(mockJavaBot);
    });

    it('should return inventory state from Bedrock strategy', async () => {
      const mockState = createMockInventoryState([
        createMockInventoryItem('cobblestone', 16, 0)
      ]);

      mockBedrockStrategy.getInventoryState.mockResolvedValue(mockState);

      const result = await inventoryService.getInventoryState(mockBedrockBot);

      expect(result).toBe(mockState);
      expect(mockBedrockStrategy.getInventoryState).toHaveBeenCalledWith(mockBedrockBot);
    });
  });

  describe('findItems', () => {
    it('should find items using Java strategy', async () => {
      const mockItems = [
        createMockInventoryItem('diamond', 5, 0),
        createMockInventoryItem('diamond', 3, 1)
      ];
      const findOptions: FindItemOptions = { name: 'diamond' };

      mockJavaStrategy.findItems.mockResolvedValue(mockItems);

      const result = await inventoryService.findItems(mockJavaBot, findOptions);

      expect(result).toBe(mockItems);
      expect(mockJavaStrategy.findItems).toHaveBeenCalledWith(mockJavaBot, findOptions);
    });
  });

  describe('findItem', () => {
    it('should return first item from findItems result', async () => {
      const mockItems = [
        createMockInventoryItem('iron_ingot', 10, 0),
        createMockInventoryItem('iron_ingot', 5, 1)
      ];

      mockJavaStrategy.findItems.mockResolvedValue(mockItems);

      const result = await inventoryService.findItem(mockJavaBot, { name: 'iron_ingot' });

      expect(result).toBe(mockItems[0]);
    });

    it('should return null when no items found', async () => {
      mockJavaStrategy.findItems.mockResolvedValue([]);

      const result = await inventoryService.findItem(mockJavaBot, { name: 'nonexistent' });

      expect(result).toBeNull();
    });
  });

  describe('getItemCount', () => {
    it('should sum up counts from all matching items', async () => {
      const mockItems = [
        createMockInventoryItem('coal', 15, 0),
        createMockInventoryItem('coal', 32, 1),
        createMockInventoryItem('coal', 8, 2)
      ];

      mockJavaStrategy.findItems.mockResolvedValue(mockItems);

      const result = await inventoryService.getItemCount(mockJavaBot, 'coal');

      expect(result).toBe(55); // 15 + 32 + 8
    });

    it('should return 0 when no items found', async () => {
      mockJavaStrategy.findItems.mockResolvedValue([]);

      const result = await inventoryService.getItemCount(mockJavaBot, 'gold_ingot');

      expect(result).toBe(0);
    });
  });

  describe('hasItem', () => {
    it('should return true when bot has enough items', async () => {
      const mockItems = [createMockInventoryItem('bread', 10, 0)];
      mockJavaStrategy.findItems.mockResolvedValue(mockItems);

      const result = await inventoryService.hasItem(mockJavaBot, 'bread', 5);

      expect(result).toBe(true);
    });

    it('should return false when bot does not have enough items', async () => {
      const mockItems = [createMockInventoryItem('bread', 3, 0)];
      mockJavaStrategy.findItems.mockResolvedValue(mockItems);

      const result = await inventoryService.hasItem(mockJavaBot, 'bread', 5);

      expect(result).toBe(false);
    });

    it('should default to checking for 1 item when count not specified', async () => {
      const mockItems = [createMockInventoryItem('apple', 1, 0)];
      mockJavaStrategy.findItems.mockResolvedValue(mockItems);

      const result = await inventoryService.hasItem(mockJavaBot, 'apple');

      expect(result).toBe(true);
    });
  });

  describe('isInventoryFull', () => {
    it('should return true when inventory is full', async () => {
      const mockState = createMockInventoryState();
      mockState.freeSlots = 0;
      mockJavaStrategy.getInventoryState.mockResolvedValue(mockState);

      const result = await inventoryService.isInventoryFull(mockJavaBot);

      expect(result).toBe(true);
    });

    it('should return false when inventory has free slots', async () => {
      const mockState = createMockInventoryState();
      mockState.freeSlots = 5;
      mockJavaStrategy.getInventoryState.mockResolvedValue(mockState);

      const result = await inventoryService.isInventoryFull(mockJavaBot);

      expect(result).toBe(false);
    });
  });

  describe('equipItem', () => {
    it('should delegate to strategy', async () => {
      const mockResult: InventoryOperationResult = {
        success: true,
        message: 'Equipped diamond_sword'
      };

      mockJavaStrategy.equipItem.mockResolvedValue(mockResult);

      const result = await inventoryService.equipItem(mockJavaBot, 'diamond_sword', 'hand');

      expect(result).toBe(mockResult);
      expect(mockJavaStrategy.equipItem).toHaveBeenCalledWith(mockJavaBot, 'diamond_sword', 'hand');
    });
  });

  describe('dropAllItems', () => {
    it('should drop all items of specified type', async () => {
      const mockItems = [
        createMockInventoryItem('dirt', 64, 0),
        createMockInventoryItem('dirt', 32, 1)
      ];

      mockJavaStrategy.findItems.mockResolvedValue(mockItems);
      mockJavaStrategy.dropItem.mockResolvedValue({
        success: true,
        message: 'Dropped item'
      });

      const result = await inventoryService.dropAllItems(mockJavaBot, 'dirt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Dropped all 96 dirt');
      expect(mockJavaStrategy.dropItem).toHaveBeenCalledTimes(2);
    });

    it('should return failure when no items found', async () => {
      mockJavaStrategy.findItems.mockResolvedValue([]);

      const result = await inventoryService.dropAllItems(mockJavaBot, 'emerald');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No emerald found');
    });
  });

  describe('getMissingItems', () => {
    it('should calculate missing items correctly', async () => {
      // Mock having 5 iron_ingot and 0 diamond
      mockJavaStrategy.findItems
        .mockResolvedValueOnce([createMockInventoryItem('iron_ingot', 5, 0)])
        .mockResolvedValueOnce([]);

      const requiredItems = {
        iron_ingot: 10,
        diamond: 3
      };

      const result = await inventoryService.getMissingItems(mockJavaBot, requiredItems);

      expect(result).toEqual({
        iron_ingot: 5, // Need 5 more
        diamond: 3    // Need 3 more
      });
    });

    it('should return empty object when all items available', async () => {
      mockJavaStrategy.findItems
        .mockResolvedValueOnce([createMockInventoryItem('stone', 20, 0)])
        .mockResolvedValueOnce([createMockInventoryItem('wood', 15, 1)]);

      const requiredItems = {
        stone: 10,
        wood: 5
      };

      const result = await inventoryService.getMissingItems(mockJavaBot, requiredItems);

      expect(result).toEqual({});
    });
  });

  describe('canAccommodateItems', () => {
    beforeEach(() => {
      // Mock inventory state with 5 free slots
      const mockState = createMockInventoryState();
      mockState.freeSlots = 5;
      mockJavaStrategy.getInventoryState.mockResolvedValue(mockState);
    });

    it('should return true when enough space available', async () => {
      // Mock no existing items of this type
      mockJavaStrategy.findItems.mockResolvedValue([]);

      const items = {
        new_item: 64 // 1 slot needed
      };

      const result = await inventoryService.canAccommodateItems(mockJavaBot, items);

      expect(result).toBe(true);
    });

    it('should return false when not enough space', async () => {
      // Mock no existing items
      mockJavaStrategy.findItems.mockResolvedValue([]);

      const items = {
        item1: 64, // 1 slot
        item2: 64, // 1 slot
        item3: 64, // 1 slot
        item4: 64, // 1 slot
        item5: 64, // 1 slot
        item6: 64  // 1 slot - this exceeds the 5 free slots
      };

      const result = await inventoryService.canAccommodateItems(mockJavaBot, items);

      expect(result).toBe(false);
    });

    it('should account for existing stack space', async () => {
      // Mock existing item with room for more
      mockJavaStrategy.findItems.mockResolvedValue([
        createMockInventoryItem('stone', 32, 0) // 32 space left in stack
      ]);

      const items = {
        stone: 50 // 32 fits in existing stack, 18 needs new slot
      };

      const result = await inventoryService.canAccommodateItems(mockJavaBot, items);

      expect(result).toBe(true); // Should fit (uses existing stack + 1 new slot)
    });
  });

  describe('cleanup', () => {
    it('should delegate to strategy and clean up internal state', async () => {
      // Initialize first
      await inventoryService.initialize(mockJavaBot);

      await inventoryService.cleanup(mockJavaBot);

      expect(mockJavaStrategy.cleanup).toHaveBeenCalledWith(mockJavaBot);

      // Verify bot is no longer in initialized set by trying to initialize again
      await inventoryService.initialize(mockJavaBot);
      expect(mockJavaStrategy.initialize).toHaveBeenCalledTimes(2); // Once initially, once after cleanup
    });
  });

  describe('error handling', () => {
    it('should throw error for unsupported bot edition', async () => {
      const invalidBot = { ...mockJavaBot, edition: 'invalid' as any };

      await expect(inventoryService.getInventoryState(invalidBot))
        .rejects
        .toThrow('No inventory strategy available for invalid edition');
    });

    it('should propagate strategy errors', async () => {
      const error = new Error('Strategy error');
      mockJavaStrategy.getInventoryState.mockRejectedValue(error);

      await expect(inventoryService.getInventoryState(mockJavaBot))
        .rejects
        .toThrow('Strategy error');
    });
  });
});