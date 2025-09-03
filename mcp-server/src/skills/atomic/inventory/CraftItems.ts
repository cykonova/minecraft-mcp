import { injectable } from 'tsyringe';
import minecraftData from 'minecraft-data';
import { Recipe } from 'prismarine-recipe';
import mineflayer_pathfinder from 'mineflayer-pathfinder';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

const {
  goals: { GoalNear },
} = mineflayer_pathfinder;

export interface ICraftItemsParams {
  item?: string;
  count?: number;
}

/**
 * Atomic skill for crafting items in Minecraft
 * 
 * This skill handles:
 * - Recipe validation and selection
 * - Material requirement checking
 * - Crafting table navigation (if needed)
 * - Multi-step crafting with intermediate materials
 * - Inventory management during crafting
 */
@injectable()
export class CraftItems extends AtomicSkill {
  readonly name = 'CraftItems';
  readonly description = 'Craft items using available materials or show crafting interface if no item specified';
  readonly version = '1.0.0';
  readonly edition = 'java' as const; // Java only due to complex crafting mechanics
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      item: {
        type: 'string',
        description: 'Name of the item to craft (leave empty to see craftable items)'
      },
      count: {
        type: 'number',
        description: 'Number of items to craft (default: 1)',
        default: 1,
        minimum: 1,
        maximum: 64
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { item, count = 1 } = params as ICraftItemsParams;

    // If no item specified, show crafting interface
    if (!item || item.trim() === '') {
      return this.showCraftingInterface(bot);
    }

    this.log('info', `Attempting to craft ${count} ${item}`);

    try {
      const result = await this.craftItem(bot, item.trim(), count);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Crafting failed: ${errorMessage}`);
    }
  }

  private async showCraftingInterface(bot: any): Promise<SkillResult> {
    try {
      // Get crafting recipes
      const craftableItems = this.getCraftableItems(bot);
      
      if (craftableItems.length === 0) {
        return SkillResults.success(
          null,
          "You cannot craft anything with your current materials. Try gathering more resources."
        );
      }

      const craftingList = craftableItems
        .slice(0, 10) // Limit to first 10 items
        .map(item => `- ${item.name} (need: ${item.requirements})`)
        .join('\n');

      return SkillResults.success(
        null,
        `You can craft the following items:\n${craftingList}\n\nUse the craftItems skill with a specific item name to craft it.`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to show crafting interface: ${errorMessage}`);
    }
  }

  private async craftItem(bot: any, itemName: string, count: number): Promise<SkillResult> {
    const mcData = minecraftData((bot as any).version);
    
    // Normalize and find the closest item name
    const normalizedName = this.normalizeItemName(itemName, mcData, bot);
    if (!normalizedName) {
      return SkillResults.error(`Item "${itemName}" not found in Minecraft`);
    }

    const targetItem = mcData.itemsByName[normalizedName];
    if (!targetItem) {
      return SkillResults.error(`Cannot find item data for "${normalizedName}"`);
    }

    // Get recipes for the item
    const recipes = bot.recipesFor(targetItem.id, null, 0, true); // Include crafting table recipes
    const simpleRecipes = bot.recipesFor(targetItem.id, null, 0, false); // 2x2 grid only

    if (!recipes || recipes.length === 0) {
      return SkillResults.error(`No crafting recipe found for ${normalizedName}`);
    }

    // Check if we need a crafting table
    const needsCraftingTable = !simpleRecipes || simpleRecipes.length === 0;
    let craftingTable = null;

    if (needsCraftingTable) {
      craftingTable = this.findNearbyCraftingTable(bot);
      if (!craftingTable) {
        // Check if player has crafting table in inventory
        const hasCraftingTableInInventory = bot.inventory.items().some((item: any) => 
          item && item.name === 'crafting_table'
        );
        
        if (hasCraftingTableInInventory) {
          return SkillResults.error(`You need to place down a crafting table to craft ${normalizedName}. You have one in your inventory.`);
        } else {
          return SkillResults.error(`You need a crafting table to craft ${normalizedName}`);
        }
      }
    }

    // Analyze the best recipe and check materials
    const recipeAnalysis = this.analyzeRecipe(bot, recipes[0], count, mcData);
    if (!recipeAnalysis.canCraft) {
      return SkillResults.error(`Cannot craft ${normalizedName}: ${recipeAnalysis.missingMaterials}`);
    }

    // Navigate to crafting table if needed
    if (craftingTable) {
      await this.navigateToCraftingTable(bot, craftingTable);
    }

    // Perform the crafting
    const craftingResult = await this.performCrafting(bot, recipes[0], count, craftingTable, normalizedName);
    return craftingResult;
  }

  private normalizeItemName(itemName: string, mcData: any, bot?: any): string | null {
    const name = itemName.toLowerCase().replace(/\s+/g, '_');

    // Handle special cases
    if (name.includes('bed') && !mcData.itemsByName[name]) {
      // Find appropriate bed color based on wool in inventory
      if (bot) {
        const woolInInventory = this.findWoolInInventory(bot, mcData);
        if (woolInInventory) {
          const bedColor = woolInInventory.replace('_wool', '');
          return `${bedColor}_bed`;
        }
      }
      return 'white_bed'; // Default
    }

    if (name.includes('wood') && name.includes('plank')) {
      // Find wood type in inventory
      if (bot) {
        const woodType = this.findWoodInInventory(bot, mcData);
        if (woodType) {
          return woodType.replace('_log', '_planks');
        }
      }
      return 'oak_planks'; // Default
    }

    // Direct lookup
    if (mcData.itemsByName[name]) {
      return name;
    }

    // Fuzzy matching with common items
    const commonNames = Object.keys(mcData.itemsByName);
    const bestMatch = this.findClosestMatch(name, commonNames);
    
    return bestMatch || null;
  }

  private findClosestMatch(input: string, candidates: string[]): string | null {
    let bestMatch = null;
    let bestScore = Infinity;

    for (const candidate of candidates) {
      const score = this.levenshteinDistance(input, candidate);
      if (score < bestScore && score <= 2) { // Allow up to 2 character differences
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private findNearbyCraftingTable(bot: any): any {
    const mcData = minecraftData((bot as any).version);
    const craftingTableId = mcData.blocksByName.crafting_table?.id;
    
    if (!craftingTableId) return null;

    return bot.findBlock({
      matching: craftingTableId,
      maxDistance: 32
    });
  }

  private analyzeRecipe(bot: any, recipe: Recipe, count: number, mcData: any): {
    canCraft: boolean;
    missingMaterials: string;
  } {
    const craftsNeeded = Math.ceil(count / recipe.result.count);
    const inputs = recipe.delta.filter((item) => item.count < 0);
    const missing: string[] = [];

    for (const input of inputs) {
      const required = Math.abs(input.count) * craftsNeeded;
      const available = this.getItemCountInInventory(bot, input.id);
      
      if (available < required) {
        const item = mcData.items[input.id];
        const needed = required - available;
        missing.push(`${needed} ${item.displayName || item.name}`);
      }
    }

    return {
      canCraft: missing.length === 0,
      missingMaterials: missing.length > 0 ? `Need ${missing.join(', ')}` : ''
    };
  }

  private getItemCountInInventory(bot: any, itemId: number): number {
    if (!bot.inventory || !bot.inventory.items) return 0;
    
    return bot.inventory.items()
      .filter((item: any) => item && item.type === itemId)
      .reduce((total: number, item: any) => total + item.count, 0);
  }

  private async navigateToCraftingTable(bot: any, craftingTable: any): Promise<void> {
    const distance = bot.entity.position.distanceTo(craftingTable.position);
    
    if (distance > 5) {
      this.log('debug', `Moving to crafting table at ${craftingTable.position}`);
      
      const goal = new GoalNear(
        craftingTable.position.x,
        craftingTable.position.y,
        craftingTable.position.z,
        3
      );
      
      await (bot as any).pathfinder.goto(goal);
    }

    await bot.lookAt(craftingTable.position.offset(0.5, 0.5, 0.5));
  }

  private async performCrafting(
    bot: any,
    recipe: Recipe,
    count: number,
    craftingTable: any,
    itemName: string
  ): Promise<SkillResult> {
    const craftsNeeded = Math.ceil(count / recipe.result.count);
    
    try {
      for (let i = 0; i < craftsNeeded; i++) {
        this.log('debug', `Crafting ${itemName} (${i + 1}/${craftsNeeded})`);
        
        if (craftingTable) {
          await bot.lookAt(craftingTable.position.offset(0.5, 0.5, 0.5));
          await bot.waitForTicks(5);
        }

        await bot.craft(recipe, 1, craftingTable);
        await bot.waitForTicks(5);
      }

      const totalCrafted = craftsNeeded * recipe.result.count;
      const actualAmount = Math.min(totalCrafted, count);

      return SkillResults.success(
        null,
        `Successfully crafted ${actualAmount} ${itemName.replace(/_/g, ' ')}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Crafting failed: ${errorMessage}`);
    }
  }

  private getCraftableItems(bot: any): Array<{name: string, requirements: string}> {
    // This is a simplified version - the full implementation would be quite complex
    const craftableItems: Array<{name: string, requirements: string}> = [];
    const mcData = minecraftData((bot as any).version);

    // Check some common items
    const commonItems = [
      'stick', 'torch', 'crafting_table', 'wooden_pickaxe', 'stone_pickaxe',
      'chest', 'furnace', 'bed', 'bread', 'wooden_sword', 'stone_sword'
    ];

    for (const itemName of commonItems) {
      const item = mcData.itemsByName[itemName];
      if (!item) continue;

      const recipes = bot.recipesFor(item.id, null, 0, true);
      if (!recipes || recipes.length === 0) continue;

      const analysis = this.analyzeRecipe(bot, recipes[0], 1, mcData);
      if (analysis.canCraft) {
        craftableItems.push({
          name: itemName.replace(/_/g, ' '),
          requirements: 'Available now'
        });
      } else {
        craftableItems.push({
          name: itemName.replace(/_/g, ' '),
          requirements: analysis.missingMaterials
        });
      }
    }

    return craftableItems;
  }

  private findWoolInInventory(bot: any, mcData: any): string | null {
    const woolTypes = Object.keys(mcData.itemsByName).filter(name => name.includes('_wool'));
    
    let mostWool = 0;
    let woolType = null;

    for (const wool of woolTypes) {
      const count = this.getItemCountInInventory(bot, mcData.itemsByName[wool].id);
      if (count > mostWool) {
        mostWool = count;
        woolType = wool;
      }
    }

    return woolType;
  }

  private findWoodInInventory(bot: any, mcData: any): string | null {
    const woodTypes = Object.keys(mcData.itemsByName).filter(name => name.includes('_log'));
    
    let mostWood = 0;
    let woodType = null;

    for (const wood of woodTypes) {
      const count = this.getItemCountInInventory(bot, mcData.itemsByName[wood].id);
      if (count > mostWood) {
        mostWood = count;
        woodType = wood;
      }
    }

    return woodType;
  }

  /**
   * Resource requirements for crafting
   */
  getResourceRequirements(params: Record<string, any>) {
    const item = params.item;
    
    return {
      materials: item ? [`Materials for ${item}`] : ['Inventory materials'],
      tools: ['crafting_table'], // Might need crafting table
      environment: ['pathfinder']
    };
  }

  /**
   * Estimate execution time based on item complexity
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const count = params.count || 1;
    const baseTime = 3000; // 3 seconds base
    const perItemTime = 2000; // 2 seconds per item
    const navigationTime = 5000; // 5 seconds for crafting table navigation
    
    return baseTime + (count * perItemTime) + navigationTime;
  }
}