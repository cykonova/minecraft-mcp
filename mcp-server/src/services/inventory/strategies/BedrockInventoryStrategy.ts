/**
 * Bedrock Edition specific inventory strategy implementation
 */

import { injectable } from 'tsyringe';
import { UnifiedBot } from '../../../bots/UnifiedBot.js';
import { 
  IInventoryStrategy 
} from './IInventoryStrategy.js';
import {
  InventoryItem,
  InventoryState,
  FindItemOptions,
  MoveItemOptions,
  DropItemOptions,
  EquipmentDestination,
  InventoryOperationResult
} from '../IInventoryService.js';

@injectable()
export class BedrockInventoryStrategy implements IInventoryStrategy {
  private initialized = new Set<string>();
  private inventoryCache = new Map<string, InventoryState>();
  
  getEdition(): 'java' | 'bedrock' {
    return 'bedrock';
  }

  async initialize(bot: UnifiedBot): Promise<void> {
    if (bot.edition !== 'bedrock') {
      throw new Error('BedrockInventoryStrategy can only be used with Bedrock Edition bots');
    }
    
    const bedrockClient = bot._bot;
    if (!bedrockClient) {
      throw new Error('Invalid Bedrock client instance');
    }

    // Set up event listeners for inventory updates
    this.setupInventoryEventListeners(bot);
    this.initialized.add(bot.username);
  }

  async getInventoryState(bot: UnifiedBot): Promise<InventoryState> {
    const bedrockClient = bot._bot;
    
    // Check cache first
    const cached = this.inventoryCache.get(bot.username);
    if (cached && (Date.now() - cached.lastUpdated.getTime()) < 1000) {
      return cached;
    }
    
    try {
      // Request inventory data from Bedrock client
      const inventoryData = await this.requestInventoryData(bot);
      
      const items = inventoryData.items || [];
      const totalSlots = 36; // Bedrock also has 36 inventory slots
      const usedSlots = items.length;
      const freeSlots = totalSlots - usedSlots;
      
      const hotbarItems = items.filter(item => item.slot >= 0 && item.slot <= 8);
      
      // Bedrock armor handling might be different
      const armorItems = items.filter(item => this.isArmorSlot(item.slot));
      
      const offhandItem = items.find(item => this.isOffhandSlot(item.slot));
      
      const state: InventoryState = {
        items,
        totalSlots,
        usedSlots,
        freeSlots,
        hotbarItems,
        armorItems,
        offhandItem,
        lastUpdated: new Date()
      };
      
      this.inventoryCache.set(bot.username, state);
      return state;
    } catch (error) {
      console.error('Failed to get Bedrock inventory state:', error);
      
      // Return empty state on error
      return {
        items: [],
        totalSlots: 36,
        usedSlots: 0,
        freeSlots: 36,
        hotbarItems: [],
        armorItems: [],
        lastUpdated: new Date()
      };
    }
  }

  async findItems(bot: UnifiedBot, options: FindItemOptions): Promise<InventoryItem[]> {
    const state = await this.getInventoryState(bot);
    let items = [...state.items];
    
    if (options.name) {
      const searchName = options.exactMatch ? options.name : options.name.toLowerCase();
      items = items.filter(item => {
        return options.exactMatch 
          ? item.name === searchName
          : item.name.toLowerCase().includes(searchName);
      });
    }
    
    if (options.id !== undefined) {
      items = items.filter(item => item.id === options.id);
    }
    
    if (options.minCount) {
      items = items.filter(item => item.count >= options.minCount!);
    }
    
    if (options.maxDurability !== undefined && options.maxDurability > 0) {
      items = items.filter(item => {
        if (!item.durability || !item.maxDurability) return true;
        const durabilityPercent = (item.durability / item.maxDurability) * 100;
        return durabilityPercent >= options.maxDurability!;
      });
    }
    
    if (options.hasEnchantment) {
      items = items.filter(item => {
        return item.enchantments && item.enchantments.some(enchant => 
          enchant.name.toLowerCase().includes(options.hasEnchantment!.toLowerCase())
        );
      });
    }
    
    if (!options.includeHotbar) {
      items = items.filter(item => !this.isHotbarSlot(item.slot));
    }
    
    if (!options.includeArmor) {
      items = items.filter(item => !this.isArmorSlot(item.slot));
    }
    
    if (!options.includeOffhand) {
      items = items.filter(item => !this.isOffhandSlot(item.slot));
    }
    
    return items;
  }

  async getItemBySlot(bot: UnifiedBot, slot: number): Promise<InventoryItem | null> {
    const state = await this.getInventoryState(bot);
    return state.items.find(item => item.slot === slot) || null;
  }

  async moveItem(bot: UnifiedBot, options: MoveItemOptions): Promise<InventoryOperationResult> {
    const bedrockClient = bot._bot;
    
    try {
      const fromItem = await this.getItemBySlot(bot, options.fromSlot);
      if (!fromItem) {
        return {
          success: false,
          message: `No item found in slot ${options.fromSlot}`
        };
      }
      
      // Bedrock-specific inventory move operation
      await this.sendInventoryMovePacket(bot, {
        fromSlot: options.fromSlot,
        toSlot: options.toSlot,
        count: options.count || fromItem.count,
        swapIfOccupied: options.swapIfOccupied || false
      });
      
      // Invalidate cache
      this.inventoryCache.delete(bot.username);
      
      return {
        success: true,
        message: `Moved ${options.count || fromItem.count} ${fromItem.name} from slot ${options.fromSlot} to slot ${options.toSlot}`,
        affectedSlots: [options.fromSlot, options.toSlot],
        item: fromItem
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to move item: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async equipItem(bot: UnifiedBot, itemName: string, destination?: EquipmentDestination): Promise<InventoryOperationResult> {
    try {
      // Find closest item name
      const closestItemName = await this.getClosestItemName(bot, itemName);
      if (!closestItemName) {
        return {
          success: false,
          message: `No item found matching "${itemName}"`
        };
      }
      
      const items = await this.findItems(bot, { name: closestItemName });
      const item = items[0];
      
      if (!item) {
        return {
          success: false,
          message: `You don't have any ${closestItemName} in your inventory`
        };
      }
      
      const equipDestination = destination || this.getEquipDestination(closestItemName);
      const equipSlot = this.getEquipmentSlot(equipDestination);
      
      // Check if already equipped
      const currentlyEquipped = await this.getItemBySlot(bot, equipSlot);
      if (currentlyEquipped && currentlyEquipped.name === closestItemName) {
        return {
          success: false,
          message: `${closestItemName} is already equipped`
        };
      }
      
      // Move item to equipment slot
      const result = await this.moveItem(bot, {
        fromSlot: item.slot,
        toSlot: equipSlot,
        swapIfOccupied: true
      });
      
      if (result.success) {
        result.message = `Equipped ${closestItemName}`;
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Failed to equip ${itemName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async unequipItem(bot: UnifiedBot, destination: EquipmentDestination): Promise<InventoryOperationResult> {
    try {
      const equipSlot = this.getEquipmentSlot(destination);
      const equippedItem = await this.getItemBySlot(bot, equipSlot);
      
      if (!equippedItem) {
        return {
          success: false,
          message: `No item equipped in ${destination} slot`
        };
      }
      
      // Find empty inventory slot
      const state = await this.getInventoryState(bot);
      const emptySlot = this.findEmptyInventorySlot(state);
      
      if (emptySlot === -1) {
        return {
          success: false,
          message: 'No free inventory slots to unequip item'
        };
      }
      
      const result = await this.moveItem(bot, {
        fromSlot: equipSlot,
        toSlot: emptySlot
      });
      
      if (result.success) {
        result.message = `Unequipped ${equippedItem.name} from ${destination}`;
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Failed to unequip from ${destination}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async dropItem(bot: UnifiedBot, options: DropItemOptions): Promise<InventoryOperationResult> {
    try {
      let itemToDrop: InventoryItem | null = null;
      
      if (options.slot !== undefined) {
        itemToDrop = await this.getItemBySlot(bot, options.slot);
        if (!itemToDrop) {
          return {
            success: false,
            message: `No item found in slot ${options.slot}`
          };
        }
      } else if (options.name) {
        const closestItemName = await this.getClosestItemName(bot, options.name);
        if (!closestItemName) {
          return {
            success: false,
            message: `No item found matching "${options.name}"`
          };
        }
        
        const items = await this.findItems(bot, { name: closestItemName });
        itemToDrop = items[0] || null;
        
        if (!itemToDrop) {
          return {
            success: false,
            message: `You don't have any ${closestItemName} in your inventory`
          };
        }
      } else {
        return {
          success: false,
          message: 'Must specify either slot or item name to drop'
        };
      }
      
      const dropCount = Math.min(options.count || itemToDrop.count, itemToDrop.count);
      
      // Send Bedrock drop item packet
      await this.sendDropItemPacket(bot, {
        slot: itemToDrop.slot,
        count: dropCount,
        direction: options.direction
      });
      
      // Invalidate cache
      this.inventoryCache.delete(bot.username);
      
      return {
        success: true,
        message: `Dropped ${dropCount} ${itemToDrop.name}`,
        item: itemToDrop
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to drop item: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async pickupNearbyItems(bot: UnifiedBot, itemNames?: string[], radius: number = 3): Promise<InventoryOperationResult> {
    // Bedrock item pickup is typically automatic, but we can implement scanning
    try {
      // This would need to be implemented based on Bedrock protocol for entity scanning
      // For now, return a placeholder implementation
      
      return {
        success: false,
        message: 'Bedrock item pickup not yet fully implemented - items are usually picked up automatically'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to pickup items: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async getEquippedItems(bot: UnifiedBot): Promise<{
    hand?: InventoryItem;
    offHand?: InventoryItem;
    head?: InventoryItem;
    torso?: InventoryItem;
    legs?: InventoryItem;
    feet?: InventoryItem;
  }> {
    const result: any = {};
    
    const slots = {
      hand: this.getEquipmentSlot('hand'),
      offHand: this.getEquipmentSlot('off-hand'),
      head: this.getEquipmentSlot('head'),
      torso: this.getEquipmentSlot('torso'),
      legs: this.getEquipmentSlot('legs'),
      feet: this.getEquipmentSlot('feet')
    };
    
    for (const [dest, slot] of Object.entries(slots)) {
      const item = await this.getItemBySlot(bot, slot);
      if (item) {
        result[dest] = item;
      }
    }
    
    return result;
  }

  async getHotbarItems(bot: UnifiedBot): Promise<InventoryItem[]> {
    const state = await this.getInventoryState(bot);
    return state.hotbarItems;
  }

  async setHotbarSlot(bot: UnifiedBot, slot: number): Promise<InventoryOperationResult> {
    if (slot < 0 || slot > 8) {
      return {
        success: false,
        message: 'Hotbar slot must be between 0 and 8'
      };
    }
    
    try {
      // Send Bedrock hotbar slot change packet
      await this.sendHotbarSlotPacket(bot, slot);
      
      return {
        success: true,
        message: `Set hotbar to slot ${slot}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to set hotbar slot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async getActiveHotbarSlot(bot: UnifiedBot): Promise<number> {
    // This would need to track the current hotbar slot for Bedrock
    // For now, return 0 as default
    return 0;
  }

  async validateItemName(bot: UnifiedBot, itemName: string): Promise<string | null> {
    // Bedrock item validation - would need Bedrock-specific item data
    // For now, implement basic validation
    const bedrockItems = this.getBedrockItemNames();
    
    // Check exact match first
    if (bedrockItems.includes(itemName)) {
      return itemName;
    }
    
    // Check case-insensitive match
    const lowerItemName = itemName.toLowerCase();
    const exactMatch = bedrockItems.find(name => 
      name.toLowerCase() === lowerItemName
    );
    
    return exactMatch || null;
  }

  async getClosestItemName(bot: UnifiedBot, itemName: string): Promise<string | null> {
    // First try exact validation
    const validated = await this.validateItemName(bot, itemName);
    if (validated) return validated;
    
    // Find closest match using simple string similarity
    const bedrockItems = this.getBedrockItemNames();
    const lowerInput = itemName.toLowerCase();
    
    let bestMatch = '';
    let bestScore = 0;
    
    for (const name of bedrockItems) {
      const lowerName = name.toLowerCase();
      
      // Check if input is contained in the item name
      if (lowerName.includes(lowerInput)) {
        const score = lowerInput.length / lowerName.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = name;
        }
      }
      
      // Check if item name is contained in input
      if (lowerInput.includes(lowerName)) {
        const score = lowerName.length / lowerInput.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = name;
        }
      }
    }
    
    return bestScore > 0 ? bestMatch : null;
  }

  async cleanup(bot: UnifiedBot): Promise<void> {
    this.initialized.delete(bot.username);
    this.inventoryCache.delete(bot.username);
  }

  private setupInventoryEventListeners(bot: UnifiedBot): void {
    const bedrockClient = bot._bot;
    
    // Listen for inventory update packets
    if (bedrockClient && typeof bedrockClient.on === 'function') {
      bedrockClient.on('inventory_content', () => {
        // Invalidate cache when inventory changes
        this.inventoryCache.delete(bot.username);
      });
      
      bedrockClient.on('inventory_slot', () => {
        // Invalidate cache when individual slot changes
        this.inventoryCache.delete(bot.username);
      });
    }
  }

  private async requestInventoryData(bot: UnifiedBot): Promise<{ items: InventoryItem[] }> {
    // This would implement the actual Bedrock protocol communication
    // For now, return empty data as placeholder
    return { items: [] };
  }

  private async sendInventoryMovePacket(bot: UnifiedBot, options: MoveItemOptions): Promise<void> {
    // Implement Bedrock-specific inventory move packet
    const bedrockClient = bot._bot;
    
    // This would send the appropriate packet to move items in Bedrock
    // Implementation depends on the specific Bedrock protocol library being used
  }

  private async sendDropItemPacket(bot: UnifiedBot, options: {
    slot: number;
    count: number;
    direction?: { x: number; y: number; z: number };
  }): Promise<void> {
    // Implement Bedrock-specific drop item packet
    const bedrockClient = bot._bot;
    
    // This would send the appropriate packet to drop items in Bedrock
  }

  private async sendHotbarSlotPacket(bot: UnifiedBot, slot: number): Promise<void> {
    // Implement Bedrock-specific hotbar slot change packet
    const bedrockClient = bot._bot;
    
    // This would send the appropriate packet to change hotbar slot in Bedrock
  }

  private isHotbarSlot(slot: number): boolean {
    return slot >= 0 && slot <= 8;
  }

  private isArmorSlot(slot: number): boolean {
    // Bedrock armor slots - these may differ from Java
    return slot >= 100 && slot <= 103; // Placeholder values
  }

  private isOffhandSlot(slot: number): boolean {
    // Bedrock offhand slot - this may differ from Java
    return slot === 119; // Placeholder value
  }

  private getEquipDestination(itemName: string): EquipmentDestination {
    const name = itemName.toLowerCase();
    
    if (name.includes('helmet') || name.includes('cap')) return 'head';
    if (name.includes('chestplate') || name.includes('tunic') || name.includes('elytra')) return 'torso';
    if (name.includes('leggings') || name.includes('pants')) return 'legs';
    if (name.includes('boots') || name.includes('shoes')) return 'feet';
    if (name.includes('shield') || name.includes('totem')) return 'off-hand';
    
    return 'hand'; // Default to main hand
  }

  private getEquipmentSlot(destination: EquipmentDestination): number {
    // Bedrock equipment slots - these are placeholder values
    switch (destination) {
      case 'hand': return 0; // Main hand hotbar slot 0
      case 'off-hand': return 119; // Placeholder
      case 'head': return 103; // Placeholder
      case 'torso': return 102; // Placeholder
      case 'legs': return 101; // Placeholder
      case 'feet': return 100; // Placeholder
      default: return 0;
    }
  }

  private findEmptyInventorySlot(state: InventoryState): number {
    for (let slot = 9; slot < 36; slot++) { // Skip hotbar slots
      if (!state.items.some(item => item.slot === slot)) {
        return slot;
      }
    }
    return -1; // No empty slots
  }

  private getBedrockItemNames(): string[] {
    // This would return the actual Bedrock item names
    // For now, return a basic list as placeholder
    return [
      'dirt', 'stone', 'grass_block', 'cobblestone', 'oak_planks',
      'oak_log', 'diamond', 'iron_ingot', 'gold_ingot', 'coal',
      'stick', 'wooden_sword', 'wooden_pickaxe', 'wooden_axe',
      'stone_sword', 'stone_pickaxe', 'iron_sword', 'diamond_sword',
      'bread', 'apple', 'cooked_beef', 'leather_helmet', 'iron_helmet',
      'diamond_helmet', 'leather_chestplate', 'iron_chestplate',
      'diamond_chestplate', 'leather_leggings', 'iron_leggings',
      'diamond_leggings', 'leather_boots', 'iron_boots', 'diamond_boots'
    ];
  }
}