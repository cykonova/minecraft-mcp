/**
 * Strategy interface for edition-specific inventory operations
 */

import { UnifiedBot } from '../../../bots/UnifiedBot.js';
import {
  InventoryItem,
  InventoryState,
  FindItemOptions,
  MoveItemOptions,
  DropItemOptions,
  EquipmentDestination,
  InventoryOperationResult
} from '../IInventoryService.js';

/**
 * Interface for edition-specific inventory strategies
 */
export interface IInventoryStrategy {
  /**
   * Get the edition this strategy supports
   */
  getEdition(): 'java' | 'bedrock';

  /**
   * Initialize strategy for a specific bot
   */
  initialize(bot: UnifiedBot): Promise<void>;

  /**
   * Get current inventory state
   */
  getInventoryState(bot: UnifiedBot): Promise<InventoryState>;

  /**
   * Find items matching criteria
   */
  findItems(bot: UnifiedBot, options: FindItemOptions): Promise<InventoryItem[]>;

  /**
   * Get item by slot number
   */
  getItemBySlot(bot: UnifiedBot, slot: number): Promise<InventoryItem | null>;

  /**
   * Move item between slots
   */
  moveItem(bot: UnifiedBot, options: MoveItemOptions): Promise<InventoryOperationResult>;

  /**
   * Equip an item
   */
  equipItem(bot: UnifiedBot, itemName: string, destination?: EquipmentDestination): Promise<InventoryOperationResult>;

  /**
   * Unequip an item
   */
  unequipItem(bot: UnifiedBot, destination: EquipmentDestination): Promise<InventoryOperationResult>;

  /**
   * Drop item from inventory
   */
  dropItem(bot: UnifiedBot, options: DropItemOptions): Promise<InventoryOperationResult>;

  /**
   * Pickup items from ground
   */
  pickupNearbyItems(bot: UnifiedBot, itemNames?: string[], radius?: number): Promise<InventoryOperationResult>;

  /**
   * Get equipped items
   */
  getEquippedItems(bot: UnifiedBot): Promise<{
    hand?: InventoryItem;
    offHand?: InventoryItem;
    head?: InventoryItem;
    torso?: InventoryItem;
    legs?: InventoryItem;
    feet?: InventoryItem;
  }>;

  /**
   * Get hotbar items
   */
  getHotbarItems(bot: UnifiedBot): Promise<InventoryItem[]>;

  /**
   * Set active hotbar slot
   */
  setHotbarSlot(bot: UnifiedBot, slot: number): Promise<InventoryOperationResult>;

  /**
   * Get active hotbar slot
   */
  getActiveHotbarSlot(bot: UnifiedBot): Promise<number>;

  /**
   * Validate item name
   */
  validateItemName(bot: UnifiedBot, itemName: string): Promise<string | null>;

  /**
   * Get closest matching item name
   */
  getClosestItemName(bot: UnifiedBot, itemName: string): Promise<string | null>;

  /**
   * Cleanup resources
   */
  cleanup(bot: UnifiedBot): Promise<void>;
}