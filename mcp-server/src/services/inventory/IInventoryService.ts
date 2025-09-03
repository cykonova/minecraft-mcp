/**
 * Inventory Service Interface
 * 
 * Provides a unified interface for managing bot inventories across Java and Bedrock editions.
 * Abstracts inventory operations that are currently spread across bot wrappers and skills.
 */

import { UnifiedBot } from '../../bots/UnifiedBot.js';

/**
 * Represents an item in the inventory
 */
export interface InventoryItem {
  id: number;
  name: string;
  displayName: string;
  count: number;
  slot: number;
  durability?: number;
  maxDurability?: number;
  enchantments?: Array<{
    id: number;
    name: string;
    level: number;
  }>;
  nbt?: any;
  metadata?: any;
}

/**
 * Represents the current state of an inventory
 */
export interface InventoryState {
  items: InventoryItem[];
  totalSlots: number;
  usedSlots: number;
  freeSlots: number;
  hotbarItems: InventoryItem[];
  armorItems: InventoryItem[];
  offhandItem?: InventoryItem;
  lastUpdated: Date;
}

/**
 * Equipment destination for equipping items
 */
export type EquipmentDestination = 'hand' | 'off-hand' | 'head' | 'torso' | 'legs' | 'feet';

/**
 * Options for finding items in inventory
 */
export interface FindItemOptions {
  name?: string;
  id?: number;
  exactMatch?: boolean;
  includeHotbar?: boolean;
  includeArmor?: boolean;
  includeOffhand?: boolean;
  minCount?: number;
  maxDurability?: number;
  hasEnchantment?: string;
}

/**
 * Options for moving items
 */
export interface MoveItemOptions {
  fromSlot: number;
  toSlot: number;
  count?: number;
  swapIfOccupied?: boolean;
}

/**
 * Options for dropping items
 */
export interface DropItemOptions {
  slot?: number;
  name?: string;
  count?: number;
  direction?: { x: number; y: number; z: number };
}

/**
 * Inventory optimization options
 */
export interface InventoryOptimizationOptions {
  sortByType?: boolean;
  sortByName?: boolean;
  consolidateStacks?: boolean;
  moveToHotbar?: string[];
  keepInInventory?: string[];
}

/**
 * Result of an inventory operation
 */
export interface InventoryOperationResult {
  success: boolean;
  message: string;
  affectedSlots?: number[];
  item?: InventoryItem;
  error?: Error;
}

/**
 * Main inventory service interface
 */
export interface IInventoryService {
  /**
   * Initialize the service for a specific bot
   */
  initialize(bot: UnifiedBot): Promise<void>;

  /**
   * Get the current inventory state
   */
  getInventoryState(bot: UnifiedBot): Promise<InventoryState>;

  /**
   * Find items in inventory matching criteria
   */
  findItems(bot: UnifiedBot, options: FindItemOptions): Promise<InventoryItem[]>;

  /**
   * Find the first item matching criteria
   */
  findItem(bot: UnifiedBot, options: FindItemOptions): Promise<InventoryItem | null>;

  /**
   * Get item by slot number
   */
  getItemBySlot(bot: UnifiedBot, slot: number): Promise<InventoryItem | null>;

  /**
   * Get total count of a specific item
   */
  getItemCount(bot: UnifiedBot, itemName: string): Promise<number>;

  /**
   * Check if inventory has enough of an item
   */
  hasItem(bot: UnifiedBot, itemName: string, count?: number): Promise<boolean>;

  /**
   * Check if inventory is full
   */
  isInventoryFull(bot: UnifiedBot): Promise<boolean>;

  /**
   * Get number of free inventory slots
   */
  getFreeSlots(bot: UnifiedBot): Promise<number>;

  /**
   * Move item from one slot to another
   */
  moveItem(bot: UnifiedBot, options: MoveItemOptions): Promise<InventoryOperationResult>;

  /**
   * Equip an item to specific equipment slot
   */
  equipItem(bot: UnifiedBot, itemName: string, destination?: EquipmentDestination): Promise<InventoryOperationResult>;

  /**
   * Unequip an item from equipment slot
   */
  unequipItem(bot: UnifiedBot, destination: EquipmentDestination): Promise<InventoryOperationResult>;

  /**
   * Drop item(s) from inventory
   */
  dropItem(bot: UnifiedBot, options: DropItemOptions): Promise<InventoryOperationResult>;

  /**
   * Drop all items of a specific type
   */
  dropAllItems(bot: UnifiedBot, itemName: string): Promise<InventoryOperationResult>;

  /**
   * Pickup items from the ground near the bot
   */
  pickupNearbyItems(bot: UnifiedBot, itemNames?: string[], radius?: number): Promise<InventoryOperationResult>;

  /**
   * Consolidate item stacks (combine partial stacks)
   */
  consolidateStacks(bot: UnifiedBot): Promise<InventoryOperationResult>;

  /**
   * Sort inventory based on criteria
   */
  sortInventory(bot: UnifiedBot, options?: InventoryOptimizationOptions): Promise<InventoryOperationResult>;

  /**
   * Optimize inventory layout
   */
  optimizeInventory(bot: UnifiedBot, options?: InventoryOptimizationOptions): Promise<InventoryOperationResult>;

  /**
   * Get items that are missing for a recipe or requirement
   */
  getMissingItems(bot: UnifiedBot, requiredItems: Record<string, number>): Promise<Record<string, number>>;

  /**
   * Check if bot has space for additional items
   */
  canAccommodateItems(bot: UnifiedBot, items: Record<string, number>): Promise<boolean>;

  /**
   * Get currently equipped items
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
   * Get hotbar items (slots 0-8)
   */
  getHotbarItems(bot: UnifiedBot): Promise<InventoryItem[]>;

  /**
   * Set active hotbar slot
   */
  setHotbarSlot(bot: UnifiedBot, slot: number): Promise<InventoryOperationResult>;

  /**
   * Get the currently selected hotbar slot
   */
  getActiveHotbarSlot(bot: UnifiedBot): Promise<number>;

  /**
   * Validate that an item name exists in Minecraft
   */
  validateItemName(bot: UnifiedBot, itemName: string): Promise<string | null>;

  /**
   * Get closest matching item name from input
   */
  getClosestItemName(bot: UnifiedBot, itemName: string): Promise<string | null>;

  /**
   * Clean up resources when bot disconnects
   */
  cleanup(bot: UnifiedBot): Promise<void>;
}