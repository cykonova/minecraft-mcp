import { injectable } from 'tsyringe';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';
import { Entity } from 'prismarine-entity';
import { Item } from 'prismarine-item';
import minecraftData from 'minecraft-data';

import { AtomicSkill } from '../../AtomicSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';

export interface ILookAroundParams {
  radius?: number;
  maxItems?: number;
}

/**
 * Atomic skill for comprehensive environmental observation
 * 
 * This skill handles:
 * - Current position and status
 * - Nearby blocks and structures
 * - Entities in the area
 * - Inventory summary
 * - Time, weather, and biome information
 * - Health and food status
 */
@injectable()
export class LookAround extends AtomicSkill {
  readonly name = 'LookAround';
  readonly description = 'Observe the surrounding environment and report what you see';
  readonly version = '1.0.0';
  readonly edition = 'universal' as const;
  readonly category = 'verified' as const;
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      radius: {
        type: 'number',
        description: 'Observation radius in blocks (default: 16)',
        default: 16,
        minimum: 4,
        maximum: 32
      },
      maxItems: {
        type: 'number',
        description: 'Maximum number of different items to report (default: 15)',
        default: 15,
        minimum: 5,
        maximum: 50
      }
    },
    required: []
  };

  protected async executeSkill(context: ISkillContext): Promise<SkillResult> {
    const { bot, params } = context;
    const { radius = 16, maxItems = 15 } = params as ILookAroundParams;

    this.log('info', 'Looking around and observing environment');

    try {
      const observations = await this.gatherObservations(bot, radius, maxItems);
      const fullReport = this.formatObservations(observations);
      
      return SkillResults.success(observations, fullReport);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Failed to look around: ${errorMessage}`);
    }
  }

  private async gatherObservations(bot: any, radius: number, maxItems: number): Promise<any> {
    const observations: any = {};

    // Basic status
    observations.position = this.getCurrentPosition(bot);
    observations.health = this.getHealthStatus(bot);
    observations.time = this.getTimeAndWeather(bot);
    observations.biome = this.getCurrentBiome(bot);
    observations.heldItem = this.getHeldItem(bot);

    // Environment scanning
    observations.blocks = this.getNearbyBlocks(bot, radius, maxItems);
    observations.entities = this.getNearbyEntities(bot, radius, maxItems);
    observations.inventory = this.getInventorySummary(bot, maxItems);

    // Special conditions
    observations.warnings = this.getWarnings(bot);
    observations.interface = this.getCurrentInterface(bot);

    return observations;
  }

  private getCurrentPosition(bot: any): any {
    const pos = bot.entity.position;
    return {
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z)
    };
  }

  private getHealthStatus(bot: any): any {
    return {
      health: bot.health || 0,
      maxHealth: 20,
      food: bot.food || 0,
      maxFood: 20,
      oxygen: bot.oxygenLevel || 20,
      maxOxygen: 20
    };
  }

  private getTimeAndWeather(bot: any): any {
    return {
      timeOfDay: this.getTimeOfDay(bot),
      weather: this.getWeather(bot),
      day: Math.floor((bot.time?.age || 0) / 24000)
    };
  }

  private getCurrentBiome(bot: any): string | null {
    try {
      const mcData = minecraftData(bot.version);
      const block = bot.blockAt(bot.entity.position);
      if (block?.biome?.id !== undefined) {
        return mcData.biomes[block.biome.id]?.name || null;
      }
    } catch (error) {
      this.log('warn', `Failed to get biome: ${error}`);
    }
    return null;
  }

  private getHeldItem(bot: any): string | null {
    const heldItem = bot.heldItem;
    return heldItem ? heldItem.name : null;
  }

  private getNearbyBlocks(bot: any, radius: number, maxItems: number): Array<{name: string, count: number}> {
    const blockTypes = new Set<string>();
    const position = bot.entity.position.floored();
    const maxDistanceXZ = radius;
    const maxDistanceY = Math.min(radius, 10);

    for (let x = -maxDistanceXZ; x <= maxDistanceXZ; x++) {
      for (let y = -maxDistanceY; y <= maxDistanceY; y++) {
        for (let z = -maxDistanceXZ; z <= maxDistanceXZ; z++) {
          const blockPos = position.offset(x, y, z);
          const block = bot.blockAt(blockPos);
          
          if (block && block.type !== 0 && this.canSeeBlock(bot, block.position)) {
            blockTypes.add(this.parseBlockInfo(bot, block));
          }
        }
      }
    }

    // Count occurrences
    const blockCounts: Record<string, number> = {};
    Array.from(blockTypes).forEach(block => {
      blockCounts[block] = (blockCounts[block] || 0) + 1;
    });

    // Sort and limit
    return Object.entries(blockCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxItems);
  }

  private getNearbyEntities(bot: any, radius: number, maxItems: number): Array<{name: string, distance: number}> {
    if (!bot.entities || !bot.entity) return [];

    const allEntities = Object.values(bot.entities) as Entity[];
    const mcData = minecraftData(bot.version);

    const nearbyEntities = allEntities
      .filter((e: Entity) => {
        if (e.id === bot.entity.id) return false;
        const distance = e.position.distanceTo(bot.entity.position);
        if (distance > radius) return false;

        try {
          const block = bot.blockAt(e.position);
          return block && bot.canSeeBlock && bot.canSeeBlock(block);
        } catch {
          return true; // Assume visible if check fails
        }
      })
      .map((entity: Entity) => {
        const distance = Math.round(entity.position.distanceTo(bot.entity.position));
        let name = entity.name || 'unknown';

        // Handle item entities
        if ((name === 'item' || name === 'Item') && entity.metadata) {
          const metadata = entity.metadata as any;
          if (metadata[8]) {
            const itemCount = metadata[8].itemCount;
            const itemId = metadata[8].itemId;
            const itemData = mcData.items[itemId];
            if (itemData) {
              name = itemCount > 1 
                ? `${itemCount} ${itemData.displayName || itemData.name}`
                : itemData.displayName || itemData.name;
            }
          }
        }

        // Handle player entities
        if (name === 'player' && (entity as any).username) {
          name = (entity as any).username;
        }

        return { name, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxItems);

    return nearbyEntities;
  }

  private getInventorySummary(bot: any, maxItems: number): Array<{name: string, count: number}> {
    if (!bot.inventory?.items) return [];

    const itemCounts: Record<string, number> = {};
    
    bot.inventory.items().forEach((item: Item) => {
      const name = item.name;
      itemCounts[name] = (itemCounts[name] || 0) + item.count;
    });

    return Object.entries(itemCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxItems);
  }

  private getWarnings(bot: any): string[] {
    const warnings: string[] = [];

    // Drowning warning
    if (bot.oxygenLevel && bot.oxygenLevel < 20) {
      warnings.push(`DROWNING: Oxygen level ${bot.oxygenLevel}/20`);
    }

    // Health warning
    if (bot.health < 6) {
      warnings.push(`LOW HEALTH: ${bot.health}/20`);
    }

    // Hunger warning
    if (bot.food < 4) {
      warnings.push(`LOW HUNGER: ${bot.food}/20`);
    }

    return warnings;
  }

  private getCurrentInterface(bot: any): string | null {
    const currentInterface = (bot as any).currentInterface;
    return currentInterface ? (currentInterface.title || 'interface') : null;
  }

  private canSeeBlock(bot: any, position: Vec3): boolean {
    const offsets = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
    ];

    return offsets.some((offset) => {
      const newPos = position.plus(new Vec3(offset.x, offset.y, offset.z));
      const block = bot.blockAt(newPos);
      return block && (block.transparent || block.name === 'air');
    });
  }

  private parseBlockInfo(bot: any, block: Block): string {
    let name = block.name;

    try {
      // Check for fully grown crops
      if (this.isFullyGrownCrop(block)) {
        name = `fully grown ${block.name}`;
      }

      // Check farmland state
      const mcData = minecraftData(bot.version);
      if (block.type === mcData.blocksByName.farmland?.id) {
        const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
        if (blockAbove && blockAbove.name === 'air') {
          name = `empty ${block.name}`;
        } else {
          name = `planted ${block.name}`;
        }
      }
    } catch (error) {
      // Ignore parsing errors, return basic name
    }

    return name;
  }

  private isFullyGrownCrop(block: Block): boolean {
    if (!block) return false;

    try {
      const properties = block.getProperties();
      
      switch (block.name) {
        case 'wheat':
        case 'carrots':
        case 'potatoes':
          return properties.age === 7;
        case 'beetroots':
        case 'nether_wart':
          return properties.age === 3;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private getTimeOfDay(bot: any): string {
    if (!bot.time?.timeOfDay) return 'unknown';
    
    const timeOfDay = (bot.time.timeOfDay % 24000) / 24000;

    if (timeOfDay < 0.25) return 'morning';
    else if (timeOfDay < 0.5) return 'noon';
    else if (timeOfDay < 0.75) return 'evening';
    else return 'night';
  }

  private getWeather(bot: any): string {
    if (bot.thunderState > 0) return 'thunderstorm';
    else if (bot.isRaining) return 'raining';
    else return 'clear';
  }

  private formatObservations(obs: any): string {
    const lines: string[] = [];

    // Location and status
    lines.push(`🔍 ENVIRONMENT SCAN 🔍`);
    lines.push(`Location: X:${obs.position.x}, Y:${obs.position.y}, Z:${obs.position.z}`);
    lines.push(`Health: ${obs.health.health}/${obs.health.maxHealth}, Food: ${obs.health.food}/${obs.health.maxFood}`);
    lines.push(`Time: ${obs.time.timeOfDay}, Weather: ${obs.time.weather}, Day: ${obs.time.day}`);

    if (obs.biome) {
      lines.push(`Biome: ${obs.biome}`);
    }

    if (obs.heldItem) {
      lines.push(`Holding: ${obs.heldItem.replace(/_/g, ' ')}`);
    } else {
      lines.push(`Holding: nothing`);
    }

    // Warnings
    if (obs.warnings.length > 0) {
      lines.push('');
      lines.push('⚠️  WARNINGS:');
      obs.warnings.forEach((warning: string) => lines.push(`- ${warning}`));
    }

    // Blocks
    if (obs.blocks.length > 0) {
      lines.push('');
      lines.push('Nearby blocks:');
      obs.blocks.forEach((block: any) => {
        lines.push(`- ${block.name.replace(/_/g, ' ')}`);
      });
    }

    // Entities
    if (obs.entities.length > 0) {
      lines.push('');
      lines.push('Nearby entities:');
      obs.entities.forEach((entity: any) => {
        lines.push(`- ${entity.name} (${entity.distance} blocks)`);
      });
    }

    // Inventory
    if (obs.inventory.length > 0) {
      lines.push('');
      lines.push(`Inventory (${obs.inventory.length} types):`);
      obs.inventory.forEach((item: any) => {
        lines.push(`- ${item.name.replace(/_/g, ' ')}: ${item.count}`);
      });
    } else {
      lines.push('');
      lines.push('Inventory: empty');
    }

    // Interface
    if (obs.interface) {
      lines.push('');
      lines.push(`Current interface: ${obs.interface}`);
    }

    return lines.join('\n');
  }

  /**
   * No special requirements for observation
   */
  getResourceRequirements(params: Record<string, any>) {
    return {};
  }

  /**
   * Fast execution - just gathering information
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const radius = params.radius || 16;
    return 1000 + (radius * 50); // Base + scanning time
  }
}