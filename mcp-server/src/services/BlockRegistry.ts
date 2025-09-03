import { Vec3 } from 'vec3';

export interface BlockProperties {
  id: number;
  name: string;
  hardness: number;
  material?: string;
  boundingBox?: 'block' | 'empty';
  transparent?: boolean;
  liquid?: boolean;
  climbable?: boolean;
  replaceable?: boolean;
}

export interface MovementContext {
  canSwim?: boolean;
  canBreakDoors?: boolean;
  preferSafePath?: boolean;
}

export class BlockRegistry {
  private blocks: Map<number, BlockProperties> = new Map();
  private blocksByName: Map<string, BlockProperties> = new Map();
  private version: string;

  constructor(version: string = '1.20') {
    this.version = version;
    this.loadBlockData().catch(error => {
      console.error('[BlockRegistry] Failed to load block data:', error);
    });
  }

  private async loadBlockData(): Promise<void> {
    try {
      // Dynamic import to avoid require issues in ES modules
      const { default: minecraftDataModule } = await import('minecraft-data');
      const minecraftData = minecraftDataModule(this.version);
      
      for (const block of Object.values(minecraftData.blocks) as any[]) {
        const properties: BlockProperties = {
          id: block.id,
          name: block.name,
          hardness: block.hardness ?? 0,
          material: block.material,
          boundingBox: block.boundingBox,
          transparent: block.transparent ?? false,
          liquid: block.liquid ?? false,
          climbable: block.climbable ?? false,
          replaceable: block.replaceable ?? false
        };
        
        this.blocks.set(block.id, properties);
        this.blocksByName.set(block.name, properties);
      }
    } catch (error) {
      console.error('Failed to load minecraft-data:', error);
      this.loadFallbackData();
    }
  }

  private loadFallbackData(): void {
    const fallbackBlocks: BlockProperties[] = [
      { id: 0, name: 'air', hardness: 0, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 1, name: 'stone', hardness: 1.5, boundingBox: 'block' },
      { id: 2, name: 'grass_block', hardness: 0.6, boundingBox: 'block' },
      { id: 3, name: 'dirt', hardness: 0.5, boundingBox: 'block' },
      { id: 4, name: 'cobblestone', hardness: 2.0, boundingBox: 'block' },
      { id: 5, name: 'oak_planks', hardness: 2.0, boundingBox: 'block' },
      { id: 8, name: 'water', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 9, name: 'stationary_water', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 10, name: 'lava', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 11, name: 'stationary_lava', hardness: 100, boundingBox: 'empty', transparent: true, liquid: true },
      { id: 12, name: 'sand', hardness: 0.5, boundingBox: 'block' },
      { id: 13, name: 'gravel', hardness: 0.6, boundingBox: 'block' },
      { id: 17, name: 'oak_log', hardness: 2.0, boundingBox: 'block' },
      { id: 18, name: 'oak_leaves', hardness: 0.2, boundingBox: 'block', transparent: true },
      { id: 20, name: 'glass', hardness: 0.3, boundingBox: 'block', transparent: true },
      { id: 30, name: 'cobweb', hardness: 4.0, boundingBox: 'empty', transparent: true },
      { id: 31, name: 'grass', hardness: 0, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 32, name: 'dead_bush', hardness: 0, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 50, name: 'torch', hardness: 0, boundingBox: 'empty', transparent: true },
      { id: 64, name: 'oak_door', hardness: 3.0, boundingBox: 'block', transparent: true },
      { id: 65, name: 'ladder', hardness: 0.4, boundingBox: 'block', transparent: true, climbable: true },
      { id: 78, name: 'snow', hardness: 0.1, boundingBox: 'empty', transparent: true, replaceable: true },
      { id: 106, name: 'vine', hardness: 0.2, boundingBox: 'empty', transparent: true, climbable: true }
    ];

    for (const block of fallbackBlocks) {
      this.blocks.set(block.id, block);
      this.blocksByName.set(block.name, block);
    }
  }

  getBlock(id: number): BlockProperties | null {
    return this.blocks.get(id) ?? null;
  }

  getBlockByName(name: string): BlockProperties | null {
    return this.blocksByName.get(name) ?? null;
  }

  isPassable(blockId: number, context?: MovementContext): boolean {
    const block = this.getBlock(blockId);
    if (!block) return true;

    if (block.boundingBox === 'empty') return true;
    
    if (block.liquid) {
      return context?.canSwim ?? false;
    }

    if (block.name.includes('door') || block.name.includes('gate')) {
      return context?.canBreakDoors ?? false;
    }

    return false;
  }

  isLiquid(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.liquid ?? false;
  }

  isSafe(blockId: number): boolean {
    const block = this.getBlock(blockId);
    if (!block) return false;

    if (block.liquid) return false;
    if (block.name.includes('lava')) return false;
    if (block.name.includes('fire')) return false;
    if (block.name.includes('cactus')) return false;
    if (block.name === 'magma_block') return false;
    if (block.name === 'sweet_berry_bush') return false;
    
    return true;
  }

  getHardness(blockId: number): number {
    const block = this.getBlock(blockId);
    return block?.hardness ?? -1;
  }

  isClimbable(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.climbable ?? false;
  }

  isReplaceable(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.replaceable ?? false;
  }

  isTransparent(blockId: number): boolean {
    const block = this.getBlock(blockId);
    return block?.transparent ?? false;
  }

  isSolid(blockId: number): boolean {
    const block = this.getBlock(blockId);
    if (!block) return false;
    return block.boundingBox === 'block' && !block.liquid;
  }

  canStandOn(blockId: number): boolean {
    const block = this.getBlock(blockId);
    if (!block) return false;
    
    if (block.liquid) return false;
    if (block.boundingBox !== 'block') return false;
    if (block.name.includes('fence') && !block.name.includes('fence_gate')) return true;
    if (block.name.includes('wall')) return true;
    
    return this.isSolid(blockId);
  }
}