/**
 * Java Edition specific inventory strategy implementation
 */

import { injectable } from 'tsyringe';
import { Bot, EquipmentDestination as MineflayerEquipmentDestination } from 'mineflayer';
import { Item } from 'prismarine-item';
import minecraftData from 'minecraft-data';
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
export class JavaInventoryStrategy implements IInventoryStrategy {
  private initialized = new Set<string>();
  
  getEdition(): 'java' | 'bedrock' {
    return 'java';
  }

  async initialize(bot: UnifiedBot): Promise<void> {
    if (bot.edition !== 'java') {
      throw new Error('JavaInventoryStrategy can only be used with Java Edition bots');
    }
    
    const javaBot = bot._bot as Bot;
    if (!javaBot) {
      throw new Error('Invalid Java bot instance');
    }

    this.initialized.add(bot.username);
  }

  async getInventoryState(bot: UnifiedBot): Promise<InventoryState> {
    const javaBot = bot._bot as Bot;
    const inventory = javaBot.inventory;
    
    const items = inventory.items().map(item => this.convertToInventoryItem(item));
    const totalSlots = 36; // Java Edition has 36 inventory slots (4 rows of 9)
    const usedSlots = items.length;
    const freeSlots = totalSlots - usedSlots;
    
    const hotbarItems = items.filter(item => item.slot >= 0 && item.slot <= 8);
    const armorItems: InventoryItem[] = [];
    
    // Get armor slots (45-48 in Java Edition)
    for (let slot = 45; slot <= 48; slot++) {
      const armorItem = inventory.slots[slot];
      if (armorItem) {
        armorItems.push(this.convertToInventoryItem(armorItem, slot));
      }
    }
    
    // Get offhand item (slot 45 in offhand)
    const offhandItem = inventory.slots[javaBot.getEquipmentDestSlot('off-hand')];
    
    return {
      items,
      totalSlots,
      usedSlots,
      freeSlots,
      hotbarItems,
      armorItems,
      offhandItem: offhandItem ? this.convertToInventoryItem(offhandItem, javaBot.getEquipmentDestSlot('off-hand')) : undefined,
      lastUpdated: new Date()
    };
  }

  async findItems(bot: UnifiedBot, options: FindItemOptions): Promise<InventoryItem[]> {
    const javaBot = bot._bot as Bot;
    const inventory = javaBot.inventory;
    
    let items = inventory.items();
    
    if (options.name) {
      const searchName = options.exactMatch ? options.name : options.name.toLowerCase();
      items = items.filter(item => {
        return options.exactMatch 
          ? item.name === searchName
          : item.name?.toLowerCase().includes(searchName);
      });
    }
    
    if (options.id !== undefined) {
      items = items.filter(item => item.type === options.id);
    }
    
    if (options.minCount) {
      items = items.filter(item => item.count >= options.minCount!);
    }
    
    if (options.maxDurability !== undefined) {
      items = items.filter(item => {
        if (!item.durabilityUsed) return true;
        return item.durabilityUsed <= options.maxDurability!;
      });
    }
    
    if (options.hasEnchantment) {
      items = items.filter(item => {
        return item.enchants && item.enchants.some(enchant => 
          enchant.name?.toLowerCase().includes(options.hasEnchantment!.toLowerCase())
        );
      });
    }
    
    return items.map(item => this.convertToInventoryItem(item));
  }

  async getItemBySlot(bot: UnifiedBot, slot: number): Promise<InventoryItem | null> {
    const javaBot = bot._bot as Bot;
    const item = javaBot.inventory.slots[slot];
    
    return item ? this.convertToInventoryItem(item, slot) : null;
  }

  async moveItem(bot: UnifiedBot, options: MoveItemOptions): Promise<InventoryOperationResult> {
    const javaBot = bot._bot as Bot;
    
    try {
      const fromItem = javaBot.inventory.slots[options.fromSlot];
      if (!fromItem) {
        return {
          success: false,
          message: `No item found in slot ${options.fromSlot}`
        };
      }
      
      const moveCount = options.count || fromItem.count;
      
      if (options.swapIfOccupied) {
        await javaBot.clickWindow(options.fromSlot, 0, 0);
        await javaBot.clickWindow(options.toSlot, 0, 0);
        await javaBot.clickWindow(options.fromSlot, 0, 0);
      } else {
        // Move specific count
        if (moveCount === fromItem.count) {
          await javaBot.clickWindow(options.fromSlot, 0, 0);
          await javaBot.clickWindow(options.toSlot, 0, 0);
        } else {
          // Split stack
          await javaBot.clickWindow(options.fromSlot, 1, 0);
          await javaBot.clickWindow(options.toSlot, 0, 0);
        }
      }
      
      return {
        success: true,
        message: `Moved ${moveCount} ${fromItem.name} from slot ${options.fromSlot} to slot ${options.toSlot}`,
        affectedSlots: [options.fromSlot, options.toSlot],
        item: this.convertToInventoryItem(fromItem)
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
    const javaBot = bot._bot as Bot;
    const mcData = minecraftData(javaBot.version);
    
    try {
      // Find closest item name
      const closestItemName = await this.getClosestItemName(bot, itemName);
      if (!closestItemName) {
        return {
          success: false,
          message: `No item found matching "${itemName}"`
        };
      }
      
      const itemByName = mcData.itemsByName[closestItemName];
      if (!itemByName) {
        return {
          success: false,
          message: `Invalid item name: ${closestItemName}`
        };
      }
      
      const item = javaBot.inventory.findInventoryItem(itemByName.id, null, false);
      if (!item) {
        return {
          success: false,
          message: `You don't have any ${closestItemName} in your inventory`
        };
      }
      
      const equipDestination = destination || this.getEquipDestination(closestItemName);
      const mineflayerDestination = this.convertToMineflayerEquipmentDestination(equipDestination);
      
      // Check if already equipped
      const currentlyEquipped = javaBot.inventory.slots[javaBot.getEquipmentDestSlot(mineflayerDestination)];
      if (currentlyEquipped && currentlyEquipped.name === closestItemName) {
        return {
          success: false,
          message: `${closestItemName} is already equipped`
        };
      }
      
      await javaBot.equip(item, mineflayerDestination);
      
      return {
        success: true,
        message: `Equipped ${closestItemName}`,
        item: this.convertToInventoryItem(item)
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to equip ${itemName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async unequipItem(bot: UnifiedBot, destination: EquipmentDestination): Promise<InventoryOperationResult> {
    const javaBot = bot._bot as Bot;
    
    try {
      const mineflayerDestination = this.convertToMineflayerEquipmentDestination(destination);
      const equippedItem = javaBot.inventory.slots[javaBot.getEquipmentDestSlot(mineflayerDestination)];
      
      if (!equippedItem) {
        return {
          success: false,
          message: `No item equipped in ${destination} slot`
        };
      }
      
      await javaBot.unequip(mineflayerDestination);
      
      return {
        success: true,
        message: `Unequipped ${equippedItem.name} from ${destination}`,
        item: this.convertToInventoryItem(equippedItem)
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to unequip from ${destination}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async dropItem(bot: UnifiedBot, options: DropItemOptions): Promise<InventoryOperationResult> {
    const javaBot = bot._bot as Bot;
    
    try {
      let itemToDrop: Item | null = null;
      
      if (options.slot !== undefined) {
        itemToDrop = javaBot.inventory.slots[options.slot];
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
        
        itemToDrop = javaBot.inventory.items().find(item => item.name === closestItemName) || null;
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
      
      await javaBot.toss(itemToDrop.type, null, dropCount);
      
      return {
        success: true,
        message: `Dropped ${dropCount} ${itemToDrop.name}`,
        item: this.convertToInventoryItem(itemToDrop)
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
    const javaBot = bot._bot as Bot;
    
    try {
      const nearbyItems = Object.values(javaBot.entities).filter(entity => {
        if (entity.name !== 'item') return false;
        
        const distance = javaBot.entity.position.distanceTo(entity.position);
        if (distance > radius) return false;
        
        if (itemNames && itemNames.length > 0) {
          const entityItem = entity.getDroppedItem();
          return itemNames.some(name => entityItem?.name?.toLowerCase().includes(name.toLowerCase()));
        }
        
        return true;
      });
      
      if (nearbyItems.length === 0) {
        return {
          success: false,
          message: 'No items found nearby'
        };
      }
      
      // Navigate to and collect items
      let collectedCount = 0;
      for (const itemEntity of nearbyItems) {
        try {
          const goal = new (javaBot as any).pathfinder.goals.GoalNear(
            itemEntity.position.x,
            itemEntity.position.y,
            itemEntity.position.z,
            1
          );
          
          await javaBot.pathfinder.goto(goal);
          // Wait a bit for item collection
          await new Promise(resolve => setTimeout(resolve, 500));
          collectedCount++;
        } catch (error) {
          console.warn(`Failed to collect item: ${error}`);
        }
      }
      
      return {
        success: collectedCount > 0,
        message: `Collected ${collectedCount} items`
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
    const javaBot = bot._bot as Bot;
    const result: any = {};
    
    const slots = {
      hand: javaBot.getEquipmentDestSlot('hand'),
      offHand: javaBot.getEquipmentDestSlot('off-hand'),
      head: javaBot.getEquipmentDestSlot('head'),
      torso: javaBot.getEquipmentDestSlot('torso'),
      legs: javaBot.getEquipmentDestSlot('legs'),
      feet: javaBot.getEquipmentDestSlot('feet')
    };
    
    for (const [dest, slot] of Object.entries(slots)) {
      const item = javaBot.inventory.slots[slot];
      if (item) {
        result[dest] = this.convertToInventoryItem(item, slot);
      }
    }
    
    return result;
  }

  async getHotbarItems(bot: UnifiedBot): Promise<InventoryItem[]> {
    const javaBot = bot._bot as Bot;
    const hotbarItems: InventoryItem[] = [];
    
    for (let slot = 0; slot < 9; slot++) {
      const item = javaBot.inventory.slots[slot];
      if (item) {
        hotbarItems.push(this.convertToInventoryItem(item, slot));
      }
    }
    
    return hotbarItems;
  }

  async setHotbarSlot(bot: UnifiedBot, slot: number): Promise<InventoryOperationResult> {
    const javaBot = bot._bot as Bot;
    
    if (slot < 0 || slot > 8) {
      return {
        success: false,
        message: 'Hotbar slot must be between 0 and 8'
      };
    }
    
    try {
      javaBot.setQuickBarSlot(slot);
      
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
    const javaBot = bot._bot as Bot;
    return javaBot.quickBarSlot;
  }

  async validateItemName(bot: UnifiedBot, itemName: string): Promise<string | null> {
    const javaBot = bot._bot as Bot;
    const mcData = minecraftData(javaBot.version);
    
    // Check exact match first
    if (mcData.itemsByName[itemName]) {
      return itemName;
    }
    
    // Check case-insensitive match
    const lowerItemName = itemName.toLowerCase();
    const exactMatch = Object.keys(mcData.itemsByName).find(name => 
      name.toLowerCase() === lowerItemName
    );
    
    return exactMatch || null;
  }

  async getClosestItemName(bot: UnifiedBot, itemName: string): Promise<string | null> {
    const javaBot = bot._bot as Bot;
    const mcData = minecraftData(javaBot.version);
    
    // First try exact validation
    const validated = await this.validateItemName(bot, itemName);
    if (validated) return validated;
    
    // Find closest match using simple string similarity
    const itemNames = Object.keys(mcData.itemsByName);
    const lowerInput = itemName.toLowerCase();
    
    let bestMatch = '';
    let bestScore = 0;
    
    for (const name of itemNames) {
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
  }

  private convertToInventoryItem(item: Item, slot?: number): InventoryItem {
    const enchantments = item.enchants?.map(enchant => ({
      id: 0, // Enchantment ID not available in this format
      name: enchant.name || 'unknown',
      level: enchant.lvl || 0
    })) || [];
    
    return {
      id: item.type,
      name: item.name || 'unknown',
      displayName: item.displayName || item.name || 'unknown',
      count: item.count,
      slot: slot !== undefined ? slot : -1,
      durability: item.durabilityUsed ? (item.maxDurability || 0) - item.durabilityUsed : undefined,
      maxDurability: item.maxDurability || undefined,
      enchantments: enchantments.length > 0 ? enchantments : undefined,
      nbt: item.nbt || undefined,
      metadata: item.metadata !== undefined ? item.metadata : undefined
    };
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

  private convertToMineflayerEquipmentDestination(destination: EquipmentDestination): MineflayerEquipmentDestination {
    switch (destination) {
      case 'hand': return 'hand';
      case 'off-hand': return 'off-hand';
      case 'head': return 'head';
      case 'torso': return 'torso';
      case 'legs': return 'legs';
      case 'feet': return 'feet';
      default: return 'hand';
    }
  }
}