import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { closest, distance } from 'fastest-levenshtein';
import { Block } from 'prismarine-block';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface IPlaceItemNearYouParams {
  itemName: string;
  maxDistance?: number;
  preferredSide?: string;
}

/**
 * Atomic skill for placing items from inventory near the bot
 * 
 * This skill handles:
 * - Item validation and inventory checking
 * - Finding suitable placement locations
 * - Block placement with proper support checking
 * - Equipment management during placement
 */
@injectable()
export class PlaceItemNearYou extends AtomicSkill {
  readonly name = 'PlaceItemNearYou';
  readonly description = 'Place an item from inventory on a suitable surface nearby';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    required: ['itemName'],
    properties: {
      itemName: {
        type: 'string',
        description: 'Name of the item/block to place from inventory'
      },
      maxDistance: {
        type: 'number',
        description: 'Maximum distance to search for placement locations (default: 5)',
        default: 5,
        minimum: 1,
        maximum: 10
      },
      preferredSide: {
        type: 'string',
        description: 'Preferred side to place the item: "front", "back", "left", "right", "any"',
        enum: ['front', 'back', 'left', 'right', 'any'],
        default: 'any'
      }
    }
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { itemName, maxDistance = 5, preferredSide = 'any' } = params as IPlaceItemNearYouParams;

    this.log('info', `Attempting to place ${itemName} nearby`);

    try {
      // Validate and normalize item name
      const validatedItemName = this.validateItemName(bot, itemName);
      if (!validatedItemName) {
        return SkillResults.error(`Unknown item: ${itemName}`);
      }

      // Check if item can be placed as a block
      if (!this.canBeAsBlock(bot, validatedItemName)) {
        return SkillResults.error(`${validatedItemName} cannot be placed as a block`);
      }

      // Check inventory
      const inventoryItem = this.findItemInInventory(bot, validatedItemName);
      if (!inventoryItem) {
        return SkillResults.error(`You don't have ${validatedItemName} in your inventory`);
      }

      // Find placement location
      const placementLocation = this.findPlacementLocation(bot, maxDistance, preferredSide);
      if (!placementLocation) {
        return SkillResults.error(`No suitable placement location found within ${maxDistance} blocks`);
      }

      this.log('debug', `Found placement location at ${placementLocation.toString()}`);

      // Place the item
      await this.placeItem(bot, inventoryItem, placementLocation);

      return SkillResults.success(
        { 
          position: placementLocation, 
          item: validatedItemName 
        },
        `Successfully placed ${validatedItemName.replace(/_/g, ' ')} at ${placementLocation.toString()}`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to place item: ${errorMessage}`);
    }
  }

  private validateItemName(bot: any, itemName: string): string | null {
    const mcData = minecraftData((bot as any).version);
    const availableItems = Object.keys(mcData.itemsByName);
    
    // Direct lookup first
    if (availableItems.includes(itemName.toLowerCase())) {
      return itemName.toLowerCase();
    }

    // Fuzzy matching
    const closestMatch = closest(itemName.toLowerCase(), availableItems);
    const matchDistance = distance(itemName.toLowerCase(), closestMatch);
    
    if (matchDistance <= 2) {
      return closestMatch;
    }

    return null;
  }

  private canBeAsBlock(bot: any, itemName: string): boolean {
    const mcData = minecraftData((bot as any).version);
    return mcData.blocksByName[itemName] !== undefined;
  }

  private findItemInInventory(bot: any, itemName: string): any | null {
    if (!bot.inventory?.items) return null;
    
    return bot.inventory.items().find((item: any) => 
      item && item.name === itemName
    ) || null;
  }

  private findPlacementLocation(bot: any, maxDistance: number, preferredSide: string): Vec3 | null {
    const startPosition = bot.entity.position.floored();
    const searchPositions = this.generateSearchPositions(startPosition, maxDistance, preferredSide);

    for (const position of searchPositions) {
      if (this.canPlaceAt(bot, position)) {
        return position;
      }
    }

    return null;
  }

  private generateSearchPositions(center: Vec3, maxDistance: number, preferredSide: string): Vec3[] {
    const positions: Vec3[] = [];
    
    // Generate positions in order of preference
    for (let distance = 1; distance <= maxDistance; distance++) {
      for (let x = -distance; x <= distance; x++) {
        for (let z = -distance; z <= distance; z++) {
          if (Math.abs(x) !== distance && Math.abs(z) !== distance) {
            continue; // Only check perimeter at each distance
          }

          const position = center.offset(x, 0, z);
          
          // Apply side preference
          if (preferredSide !== 'any' && !this.matchesSidePreference(x, z, preferredSide)) {
            continue;
          }

          positions.push(position);
        }
      }
    }

    return positions;
  }

  private matchesSidePreference(x: number, z: number, preferredSide: string): boolean {
    switch (preferredSide) {
      case 'front': return z > 0; // Assuming positive Z is forward
      case 'back': return z < 0;
      case 'left': return x < 0;
      case 'right': return x > 0;
      default: return true;
    }
  }

  private canPlaceAt(bot: any, position: Vec3): boolean {
    const block = bot.blockAt(position);
    const blockBelow = bot.blockAt(position.offset(0, -1, 0));

    // Check if there's an entity at this position
    if (this.isEntityAtPosition(bot, position)) {
      return false;
    }

    // If block is grass, we can clear it and place
    if (block && (block.name === 'grass' || block.name === 'short_grass' || block.name === 'tall_grass')) {
      return this.hasValidSupport(blockBelow);
    }

    // Block must be air
    if (!block || block.name !== 'air') {
      return false;
    }

    // Must have valid support below
    return this.hasValidSupport(blockBelow);
  }

  private hasValidSupport(blockBelow: any): boolean {
    if (!blockBelow) return false;
    
    // Must not be air
    if (blockBelow.name === 'air') return false;
    
    // Must have a solid bounding box
    if (blockBelow.boundingBox === 'empty') return false;
    
    // Avoid interactable blocks (chests, furnaces, etc.)
    const interactableBlocks = new Set([
      'chest', 'trapped_chest', 'ender_chest', 'furnace', 'blast_furnace',
      'smoker', 'brewing_stand', 'enchanting_table', 'anvil', 'crafting_table',
      'cartography_table', 'fletching_table', 'loom', 'smithing_table',
      'stonecutter', 'grindstone', 'composter', 'barrel', 'shulker_box'
    ]);
    
    if (interactableBlocks.has(blockBelow.name)) return false;
    
    return true;
  }

  private isEntityAtPosition(bot: any, position: Vec3): boolean {
    if (!bot.entities) return false;
    
    const entities = Object.values(bot.entities);
    
    return entities.some((entity: any) => {
      if (!entity?.position) return false;
      const entityPos = entity.position.floored();
      return entityPos.equals(position);
    });
  }

  private async placeItem(bot: any, inventoryItem: any, position: Vec3): Promise<void> {
    // Store current held item
    const originalHeldItem = bot.heldItem;
    
    try {
      // Equip the item to place
      if (!originalHeldItem || originalHeldItem.name !== inventoryItem.name) {
        await bot.equip(inventoryItem, 'hand');
      }

      // Look at the position
      await bot.lookAt(position.offset(0.5, 0.5, 0.5));
      await bot.waitForTicks(2);

      // Clear grass if needed
      const block = bot.blockAt(position);
      if (block && (block.name === 'grass' || block.name === 'short_grass' || block.name === 'tall_grass')) {
        await bot.dig(block);
        await bot.waitForTicks(5);
      }

      // Find a reference block to place against
      const referenceBlock = this.findReferenceBlock(bot, position);
      if (!referenceBlock) {
        throw new Error('No reference block found for placement');
      }

      // Place the block
      await bot.placeBlock(referenceBlock.block, referenceBlock.face);
      await bot.waitForTicks(3);

    } finally {
      // Re-equip original item if different
      if (originalHeldItem && 
          originalHeldItem.name !== inventoryItem.name && 
          bot.inventory.findInventoryItem(originalHeldItem.type)) {
        try {
          await bot.equip(originalHeldItem, 'hand');
        } catch (error) {
          this.log('warn', `Failed to re-equip original item: ${error}`);
        }
      }
    }
  }

  private findReferenceBlock(bot: any, targetPosition: Vec3): { block: any, face: Vec3 } | null {
    const offsets = [
      { pos: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) }, // Below
      { pos: new Vec3(0, 1, 0), face: new Vec3(0, -1, 0) }, // Above
      { pos: new Vec3(1, 0, 0), face: new Vec3(-1, 0, 0) }, // East
      { pos: new Vec3(-1, 0, 0), face: new Vec3(1, 0, 0) }, // West
      { pos: new Vec3(0, 0, 1), face: new Vec3(0, 0, -1) }, // South
      { pos: new Vec3(0, 0, -1), face: new Vec3(0, 0, 1) }, // North
    ];

    for (const offset of offsets) {
      const refPosition = targetPosition.plus(offset.pos);
      const refBlock = bot.blockAt(refPosition);
      
      if (refBlock && refBlock.name !== 'air' && refBlock.boundingBox !== 'empty') {
        return { block: refBlock, face: offset.face };
      }
    }

    return null;
  }

  /**
   * Resource requirements for placing items
   */
  getResourceRequirements(params: Record<string, any>) {
    const itemName = params.itemName || 'unknown item';
    
    return {
      inventory: [`${itemName} (1 or more)`],
      environment: ['Suitable placement surface nearby'],
      conditions: ['Item can be placed as block', 'Clear placement area']
    };
  }

  /**
   * Estimate execution time
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const maxDistance = params.maxDistance || 5;
    const baseTime = 2000; // 2 seconds base
    const searchTime = maxDistance * 200; // Search time increases with distance
    const placementTime = 2000; // 2 seconds for placement
    
    return baseTime + searchTime + placementTime;
  }
}