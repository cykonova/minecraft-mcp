import { injectable } from 'tsyringe';
// @ts-ignore - Jimp doesn't have proper TypeScript declarations
import Jimp from 'jimp';
import axios from 'axios';

import { CompositeSkill } from '../../CompositeSkill.js';
import { ISkillContext } from '../../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../../ICompositeSkill.js';
import { SkillResult, SkillResults } from '../../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../../decorators/skillDependency.js';
import { IAtomicSkill } from '../../IAtomicSkill.js';

export interface IBuildPixelArtParams {
  imagePath: string;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
  facing?: 'north' | 'south' | 'east' | 'west';
}

interface ColorBlock {
  color: { r: number; g: number; b: number };
  block: string;
}

/**
 * Build pixel art in Minecraft from an image
 * 
 * This composite skill converts images into Minecraft pixel art:
 * 1. Loads and processes the image (from file path or URL)
 * 2. Resizes the image to the specified dimensions
 * 3. Converts image pixels to closest matching Minecraft blocks
 * 4. Places blocks in the world to recreate the image as pixel art
 * 
 * The pixel art is built vertically (standing up) with configurable
 * orientation and placement. Requires operator permissions to use
 * building commands. Supports transparency and has an extensive
 * color palette for accurate color matching.
 */
@autoResolveDependencies
@injectable()
export class BuildPixelArt extends CompositeSkill {
  readonly name = 'buildPixelArt';
  readonly description = 'Build pixel art from images using Minecraft blocks (requires operator permissions)';
  readonly version = '1.0.0';
  readonly edition = 'java' as const;
  readonly category = 'verified' as const;
  readonly skillDependencies = ['sendChat'];

  // Dependencies injected via decorator
  @skillDependency({ name: 'sendChat', optional: true })
  private sendChat?: IAtomicSkill;

  readonly inputSchema = {
    type: 'object',
    required: ['imagePath', 'width', 'height', 'x', 'y', 'z'],
    properties: {
      imagePath: {
        type: 'string',
        description: 'Path or URL to the image file',
        minLength: 1
      },
      width: {
        type: 'number',
        description: 'Width of the pixel art in blocks (max 256)',
        minimum: 1,
        maximum: 256
      },
      height: {
        type: 'number',
        description: 'Height of the pixel art in blocks (max 256)',
        minimum: 1,
        maximum: 256
      },
      x: {
        type: 'number',
        description: 'X coordinate for the center bottom of the pixel art',
        minimum: -30000000,
        maximum: 30000000
      },
      y: {
        type: 'number',
        description: 'Y coordinate for the bottom of the pixel art',
        minimum: -64,
        maximum: 320
      },
      z: {
        type: 'number',
        description: 'Z coordinate for the center bottom of the pixel art',
        minimum: -30000000,
        maximum: 30000000
      },
      facing: {
        type: 'string',
        enum: ['north', 'south', 'east', 'west'],
        description: 'Direction the pixel art faces (default: north)',
        default: 'north'
      }
    }
  };

  private readonly colorBlocks: ColorBlock[] = [
    // Grayscale
    { color: { r: 255, g: 255, b: 255 }, block: 'white_concrete' },
    { color: { r: 230, g: 230, b: 230 }, block: 'white_wool' },
    { color: { r: 200, g: 200, b: 200 }, block: 'light_gray_concrete' },
    { color: { r: 160, g: 160, b: 160 }, block: 'light_gray_wool' },
    { color: { r: 128, g: 128, b: 128 }, block: 'gray_concrete' },
    { color: { r: 90, g: 90, b: 90 }, block: 'gray_wool' },
    { color: { r: 64, g: 64, b: 64 }, block: 'gray_terracotta' },
    { color: { r: 30, g: 30, b: 30 }, block: 'black_concrete' },
    { color: { r: 0, g: 0, b: 0 }, block: 'black_wool' },

    // Reds
    { color: { r: 255, g: 0, b: 0 }, block: 'red_concrete' },
    { color: { r: 180, g: 0, b: 0 }, block: 'red_wool' },
    { color: { r: 140, g: 40, b: 40 }, block: 'red_terracotta' },

    // Oranges
    { color: { r: 255, g: 140, b: 0 }, block: 'orange_concrete' },
    { color: { r: 220, g: 120, b: 0 }, block: 'orange_wool' },

    // Yellows
    { color: { r: 255, g: 255, b: 0 }, block: 'yellow_concrete' },
    { color: { r: 220, g: 220, b: 0 }, block: 'yellow_wool' },
    { color: { r: 240, g: 220, b: 100 }, block: 'yellow_terracotta' },

    // Greens
    { color: { r: 0, g: 255, b: 0 }, block: 'lime_concrete' },
    { color: { r: 0, g: 180, b: 0 }, block: 'green_concrete' },
    { color: { r: 0, g: 120, b: 0 }, block: 'green_wool' },
    { color: { r: 80, g: 140, b: 80 }, block: 'green_terracotta' },

    // Blues
    { color: { r: 0, g: 200, b: 255 }, block: 'light_blue_concrete' },
    { color: { r: 0, g: 150, b: 200 }, block: 'light_blue_wool' },
    { color: { r: 0, g: 0, b: 255 }, block: 'blue_concrete' },
    { color: { r: 0, g: 0, b: 180 }, block: 'blue_wool' },

    // Purples
    { color: { r: 180, g: 0, b: 255 }, block: 'purple_concrete' },
    { color: { r: 140, g: 0, b: 200 }, block: 'purple_wool' },
    { color: { r: 255, g: 0, b: 255 }, block: 'magenta_concrete' },

    // Browns
    { color: { r: 140, g: 70, b: 20 }, block: 'brown_concrete' },
    { color: { r: 100, g: 50, b: 20 }, block: 'brown_wool' },
    { color: { r: 160, g: 120, b: 80 }, block: 'brown_terracotta' },

    // Pink
    { color: { r: 255, g: 180, b: 200 }, block: 'pink_concrete' },
    { color: { r: 220, g: 140, b: 160 }, block: 'pink_wool' },

    // Cyan
    { color: { r: 0, g: 255, b: 255 }, block: 'cyan_concrete' },
    { color: { r: 0, g: 180, b: 180 }, block: 'cyan_wool' },
  ];

  protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
    const { width, height } = params as IBuildPixelArtParams;
    const totalBlocks = width * height;
    
    const steps: Omit<ExecutionStep, 'id'>[] = [];

    // Step 1: Check permissions
    steps.push({
      skillName: 'checkPermissions',
      description: 'Check if bot has building permissions',
      params: {},
      estimatedTime: 2000, // 2 seconds
      optional: false
    });

    // Step 2: Load and process image
    steps.push({
      skillName: 'processImage',
      description: `Load and resize image to ${width}x${height}`,
      params: { width, height },
      estimatedTime: 5000, // 5 seconds for image processing
      optional: false
    });

    // Step 3: Build pixel art
    steps.push({
      skillName: 'buildPixelArt',
      description: `Place ${totalBlocks} blocks to create pixel art`,
      params: { width, height },
      estimatedTime: Math.min(totalBlocks * 100, 300000), // 0.1s per block, max 5 minutes
      optional: false
    });

    return steps;
  }

  async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
    // Inject dependencies using the dependency injector
    const injector = require('../../decorators/skillDependency.js').SkillDependencyInjector.getInstance();
    injector.injectDependencies(this, dependencies);

    // Validate parameters
    const { imagePath, width, height, x, y, z, facing = 'north' } = context.params as IBuildPixelArtParams;
    
    if (!imagePath || width < 1 || height < 1 || x === undefined || y === undefined || z === undefined) {
      return SkillResults.error('All required parameters must be provided');
    }

    // Validate dimensions
    const validWidth = Math.min(256, Math.max(1, width));
    const validHeight = Math.min(256, Math.max(1, height));

    if (validWidth !== width || validHeight !== height) {
      this.log('warn', `Dimensions capped to ${validWidth}x${validHeight}`);
    }

    if (!['north', 'south', 'east', 'west'].includes(facing)) {
      return SkillResults.error('Facing must be north, south, east, or west');
    }

    this.log('info', `Starting pixel art build: ${validWidth}x${validHeight} at (${x}, ${y}, ${z}) facing ${facing}`);

    // Custom execution instead of using base class steps
    return await this.executePixelArtBuild(context, validWidth, validHeight);
  }

  /**
   * Execute the pixel art building process
   */
  private async executePixelArtBuild(context: ISkillContext, width: number, height: number): Promise<SkillResult> {
    const { bot, params, signal } = context;
    const { imagePath, x, y, z, facing = 'north' } = params as IBuildPixelArtParams;

    try {
      // Step 1: Check permissions
      const hasPermissions = await this.checkPermissions(bot);
      if (!hasPermissions) {
        return SkillResults.error('Cheats are not enabled. You need operator permissions to build pixel art.');
      }

      if (signal?.aborted) {
        return SkillResults.error('Pixel art build cancelled');
      }

      // Step 2: Load and process image
      this.log('info', `Loading image from: ${imagePath}`);
      const image = await this.loadImage(imagePath);
      
      // Resize to target dimensions
      image.resize(width, height);

      if (signal?.aborted) {
        return SkillResults.error('Pixel art build cancelled');
      }

      // Step 3: Build the pixel art
      this.log('info', `Building pixel art...`);
      const buildResult = await this.buildPixelArt(bot, image, width, height, x, y, z, facing, signal);

      return buildResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return SkillResults.error(`Pixel art build failed: ${errorMessage}`);
    }
  }

  /**
   * Check if the bot has building permissions
   */
  private async checkPermissions(bot: any): Promise<boolean> {
    const pos = bot.entity.position;
    const testCommand = `/tp ${bot.username} ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`;

    return new Promise((resolve) => {
      let responded = false;

      const checkResponse = (message: any) => {
        const text = message.toString();

        if (text.includes('permission') || text.includes('allowed') || text.includes('operator')) {
          responded = true;
          bot.removeListener('message', checkResponse);
          resolve(false);
        } else if (text.includes('Teleported') || text.includes(bot.username)) {
          responded = true;
          bot.removeListener('message', checkResponse);
          resolve(true);
        }
      };

      bot.on('message', checkResponse);
      bot.chat(testCommand);

      setTimeout(() => {
        if (!responded) {
          bot.removeListener('message', checkResponse);
          resolve(true); // Assume success if no error message
        }
      }, 2000);
    });
  }

  /**
   * Load image from path or URL
   */
  private async loadImage(imagePath: string): Promise<any> {
    try {
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        // Load from URL
        this.log('debug', `Loading image from URL: ${imagePath}`);
        const response = await axios.get(imagePath, { responseType: 'arraybuffer' });
        return await Jimp.read(Buffer.from(response.data));
      } else {
        // Load from file path
        this.log('debug', `Loading image from file: ${imagePath}`);
        return await Jimp.read(imagePath);
      }
    } catch (error) {
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build the pixel art by placing blocks
   */
  private async buildPixelArt(
    bot: any, 
    image: any, 
    width: number, 
    height: number, 
    baseX: number, 
    baseY: number, 
    baseZ: number, 
    facing: string,
    signal?: AbortSignal
  ): Promise<SkillResult> {
    const coords = this.getCoordinateCalculator(baseX, baseY, baseZ, width, height, facing);
    const totalPixels = width * height;
    let blocksPlaced = 0;
    let skippedPixels = 0;

    this.log('info', `Processing ${totalPixels} pixels...`);

    // Process each pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (signal?.aborted) {
          return SkillResults.success(
            { blocksPlaced, skippedPixels, totalPixels, cancelled: true },
            `Pixel art build cancelled after placing ${blocksPlaced} blocks`
          );
        }

        // Get pixel color
        const pixelColor = Jimp.intToRGBA(image.getPixelColor(x, y));

        // Skip transparent pixels
        if (pixelColor.a < 128) {
          skippedPixels++;
          continue;
        }

        // Get Minecraft block for this color
        const block = this.getBlockForColor(pixelColor.r, pixelColor.g, pixelColor.b);

        // Calculate block position (flip Y to build from bottom up)
        const pos = coords(x, height - 1 - y);

        // Place the block using command
        const command = `/setblock ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} ${block}`;
        bot.chat(command);

        blocksPlaced++;

        // Progress updates
        if (blocksPlaced % Math.max(1, Math.floor(totalPixels / 10)) === 0) {
          const progress = Math.floor((blocksPlaced / (totalPixels - skippedPixels)) * 100);
          this.log('info', `Progress: ${progress}% (${blocksPlaced} blocks placed)`);
        }

        // Small delay to avoid overwhelming the server
        if (blocksPlaced % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }

    const message = `Pixel art completed! Placed ${blocksPlaced} blocks (skipped ${skippedPixels} transparent pixels)`;
    
    return SkillResults.success(
      {
        blocksPlaced,
        skippedPixels,
        totalPixels,
        dimensions: { width, height },
        location: { x: baseX, y: baseY, z: baseZ },
        facing
      },
      message
    );
  }

  /**
   * Get coordinate calculator function based on facing direction
   */
  private getCoordinateCalculator(baseX: number, baseY: number, baseZ: number, width: number, height: number, facing: string) {
    const halfWidth = Math.floor(width / 2);

    switch (facing.toLowerCase()) {
      case 'north': // Facing negative Z
        return (x: number, y: number) => ({
          x: baseX - halfWidth + x,
          y: baseY + y,
          z: baseZ
        });

      case 'south': // Facing positive Z
        return (x: number, y: number) => ({
          x: baseX + halfWidth - x,
          y: baseY + y,
          z: baseZ
        });

      case 'east': // Facing positive X
        return (x: number, y: number) => ({
          x: baseX,
          y: baseY + y,
          z: baseZ - halfWidth + x
        });

      case 'west': // Facing negative X
        return (x: number, y: number) => ({
          x: baseX,
          y: baseY + y,
          z: baseZ + halfWidth - x
        });

      default:
        return (x: number, y: number) => ({
          x: baseX - halfWidth + x,
          y: baseY + y,
          z: baseZ
        });
    }
  }

  /**
   * Map RGB color to closest Minecraft block
   */
  private getBlockForColor(r: number, g: number, b: number): string {
    let closestBlock = this.colorBlocks[0].block;
    let closestDistance = Infinity;

    for (const item of this.colorBlocks) {
      const distance = Math.sqrt(
        Math.pow(r - item.color.r, 2) +
        Math.pow(g - item.color.g, 2) +
        Math.pow(b - item.color.b, 2)
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestBlock = item.block;
      }
    }

    return closestBlock;
  }

  /**
   * Handle partial failure - continue even if some blocks fail
   */
  async handlePartialFailure(
    step: ExecutionStep,
    error: SkillResult,
    context: ISkillContext
  ): Promise<boolean> {
    // For pixel art building, we want to continue even if some commands fail
    if (step.skillName === 'buildPixelArt') {
      this.log('warn', 'Some blocks failed to place, continuing with remainder');
      return true;
    }

    // Default to parent behavior
    return await super.handlePartialFailure(step, error, context);
  }

  /**
   * Resource requirements
   */
  getResourceRequirements(params: Record<string, any>) {
    return {
      permissions: ['operator'], // Need operator/cheats enabled
      environment: ['commands'], // Need command execution capability
      network: ['http'] // May need network access for image URLs
    };
  }

  /**
   * Estimate execution time based on image size
   */
  estimateExecutionTime(params: Record<string, any>): number {
    const { width, height } = params as IBuildPixelArtParams;
    const totalBlocks = width * height;
    
    const permissionCheck = 2000; // 2 seconds
    const imageProcessing = 5000; // 5 seconds
    const buildTime = Math.min(totalBlocks * 100, 300000); // 0.1s per block, max 5 minutes
    
    return permissionCheck + imageProcessing + buildTime;
  }

  /**
   * This skill can be cancelled
   */
  isCancellable(): boolean {
    return true;
  }

  /**
   * Handle cancellation
   */
  protected async onCancel(context: ISkillContext): Promise<void> {
    this.log('info', 'Pixel art build cancelled - stopping block placement');
  }
}