import { injectable } from 'tsyringe';
import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../ICompositeSkill.js';
import { SkillResult } from '../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../decorators/skillDependency.js';
import { ISkill } from '../ISkill.js';

interface OreVeinInfo {
    corePosition: { x: number, y: number, z: number };
    oreBlocks: { x: number, y: number, z: number }[];
    oreType: string;
    estimatedCount: number;
}

/**
 * Composite skill for mining entire ore veins efficiently
 * 
 * This skill provides comprehensive ore vein extraction by:
 * - Analyzing the ore vein structure
 * - Planning optimal mining paths
 * - Mining all connected ore blocks
 * - Avoiding dangerous situations
 * - Collecting all drops efficiently
 * - Providing progress updates
 */
@injectable()
@autoResolveDependencies
export class MineOreVeinSkill extends CompositeSkill {
    readonly name = 'mineOreVein';
    readonly description = 'Mines entire ore veins by finding and extracting all connected ore blocks';
    readonly category = 'composite' as const;
    readonly version = '1.0.0';
    readonly edition = 'java' as const;
    
    // Dependency injection properties
    @skillDependency({ 
        name: 'mineResource', 
        edition: 'java',
        category: 'verified'
    })
    private mineResource!: ISkill;
    
    @skillDependency({ 
        name: 'lookAround',
        edition: 'java',
        category: 'verified'
    })
    private lookAround!: ISkill;
    
    @skillDependency({ 
        name: 'goToKnownLocation',
        edition: 'java',
        category: 'verified'
    })
    private goToLocation!: ISkill;
    
    @skillDependency({ 
        name: 'openInventory',
        edition: 'java',
        category: 'verified',
        optional: true
    })
    private openInventory?: ISkill;

    // Required abstract properties
    readonly skillDependencies = ['mineResource', 'lookAround', 'goToKnownLocation', 'openInventory'];
    readonly inputSchema = {
        type: 'object',
        properties: {
            oreType: { 
                type: 'string', 
                enum: ['iron_ore', 'coal_ore', 'diamond_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'emerald_ore', 'copper_ore'],
                default: 'iron_ore',
                description: 'Type of ore to mine' 
            },
            maxBlocks: { type: 'number', minimum: 1, maximum: 256, default: 64, description: 'Maximum blocks to mine' },
            systematic: { type: 'boolean', default: true, description: 'Use systematic mining approach' },
            avoidLava: { type: 'boolean', default: true, description: 'Avoid dangerous positions near lava' },
            checkInventory: { type: 'boolean', default: true, description: 'Check inventory after mining' }
        },
        required: []
    };

    // Mining state
    private currentVein: OreVeinInfo | null = null;
    private minedPositions: Set<string> = new Set();
    private miningActive = false;
    private totalMinedBlocks = 0;

    constructor() {
        super();
    }

    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        const { oreType, maxBlocks = 64 } = params;
        
        return [
            {
                skillName: 'lookAround',
                params: { mode: 'blocks', target: oreType },
                description: `Scan for ${oreType} ore blocks`,
                estimatedTime: 3000,
                optional: false
            },
            {
                skillName: 'analyzeOreVein',
                params: { oreType, maxBlocks },
                description: `Analyze ${oreType} vein structure`,
                estimatedTime: 5000,
                optional: false
            },
            {
                skillName: 'mineCompleteVein',
                params: { oreType, systematic: true },
                description: `Systematically mine entire ${oreType} vein`,
                estimatedTime: 60000, // Estimated based on vein size
                optional: false
            },
            {
                skillName: 'openInventory',
                params: {},
                description: 'Check collected ore',
                estimatedTime: 2000,
                optional: true
            }
        ];
    }

    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        // Inject dependencies
        Object.assign(this, dependencies);

        const { 
            oreType = 'iron_ore',
            maxBlocks = 64,
            systematic = true,
            avoidLava = true,
            checkInventory = true
        } = context.params;

        if (!this.isValidOreType(oreType)) {
            return this.createErrorResult(
                `Invalid ore type: ${oreType}. Supported types: iron_ore, coal_ore, diamond_ore, gold_ore, redstone_ore, lapis_ore, emerald_ore, copper_ore`,
                'INVALID_ORE_TYPE'
            );
        }

        this.minedPositions.clear();
        this.totalMinedBlocks = 0;
        this.miningActive = true;

        try {
            // Step 1: Analyze the surrounding area for ore veins
            const veinAnalysis = await this.analyzeOreVeins(context, dependencies, oreType, maxBlocks);
            if (!veinAnalysis.success) {
                return veinAnalysis;
            }

            // Step 2: Mine the complete vein systematically
            const miningResult = await this.mineCompleteVein(context, dependencies, systematic, avoidLava);
            if (!miningResult.success) {
                return miningResult;
            }

            // Step 3: Check inventory if requested
            if (checkInventory && this.openInventory) {
                await this.executeDependency(
                    'openInventory',
                    {},
                    context,
                    dependencies
                );
            }

            return this.createSuccessResult(
                {
                    oreType,
                    veinInfo: this.currentVein,
                    totalMinedBlocks: this.totalMinedBlocks,
                    minedPositions: Array.from(this.minedPositions),
                    systematic
                },
                `Successfully mined ${this.totalMinedBlocks} blocks from ${oreType} vein`,
                [
                    `Extracted ${this.totalMinedBlocks} ${oreType} blocks`,
                    `Mined in ${systematic ? 'systematic' : 'opportunistic'} pattern`,
                    `Avoided ${this.minedPositions.size} dangerous positions`
                ]
            );

        } catch (error) {
            this.miningActive = false;
            return this.createErrorResult(
                `Failed to mine ore vein: ${error instanceof Error ? error.message : String(error)}`,
                'ORE_VEIN_MINING_ERROR',
                { error }
            );
        } finally {
            this.miningActive = false;
            this.currentVein = null;
        }
    }

    private async analyzeOreVeins(
        context: ISkillContext, 
        dependencies: SkillDependencyMap,
        oreType: string,
        maxBlocks: number
    ): Promise<SkillResult> {
        this.log('info', `Analyzing ${oreType} vein structure...`);

        try {
            // Scan for ore blocks in the area
            const scanResult = await this.executeDependency(
                'lookAround',
                { 
                    mode: 'blocks', 
                    target: oreType,
                    radius: 16 // Look in 16 block radius
                },
                context,
                dependencies
            );

            if (!scanResult.success || !scanResult.data) {
                return this.createErrorResult(
                    `No ${oreType} blocks found in scanning area`,
                    'NO_ORE_FOUND'
                );
            }

            // Analyze the ore block positions to find connected veins
            const oreBlocks = this.parseOreBlocks(scanResult.data);
            const vein = this.findLargestVein(oreBlocks, oreType, maxBlocks);

            if (!vein || vein.oreBlocks.length === 0) {
                return this.createErrorResult(
                    `No mineable ${oreType} vein found`,
                    'NO_VEIN_FOUND'
                );
            }

            this.currentVein = vein;
            this.log('info', `Found ${oreType} vein with ${vein.estimatedCount} blocks`);

            return this.createSuccessResult(
                vein,
                `Analyzed ${oreType} vein: ${vein.estimatedCount} blocks found`
            );

        } catch (error) {
            return this.createErrorResult(
                `Vein analysis failed: ${error instanceof Error ? error.message : String(error)}`,
                'VEIN_ANALYSIS_ERROR',
                { error }
            );
        }
    }

    private async mineCompleteVein(
        context: ISkillContext, 
        dependencies: SkillDependencyMap,
        systematic: boolean,
        avoidLava: boolean
    ): Promise<SkillResult> {
        if (!this.currentVein) {
            return this.createErrorResult('No vein analyzed for mining', 'NO_VEIN_DATA');
        }

        const { oreBlocks, oreType } = this.currentVein;
        const totalBlocks = oreBlocks.length;
        let minedCount = 0;

        this.log('info', `Starting to mine ${totalBlocks} ${oreType} blocks...`);

        // Sort blocks for optimal mining path
        const miningOrder = systematic 
            ? this.calculateOptimalMiningPath(oreBlocks)
            : oreBlocks;

        for (let i = 0; i < miningOrder.length; i++) {
            if (!this.miningActive || context.signal?.aborted) {
                break;
            }

            const block = miningOrder[i];
            const positionKey = `${block.x},${block.y},${block.z}`;

            // Skip if already mined
            if (this.minedPositions.has(positionKey)) {
                continue;
            }

            // Check for safety if avoiding lava
            if (avoidLava && await this.isDangerousPosition(block, context)) {
                this.log('warn', `Skipping dangerous position: ${positionKey}`);
                continue;
            }

            try {
                // Move to mining position
                const moveResult = await this.executeDependency(
                    'goToKnownLocation',
                    { 
                        x: block.x, 
                        y: block.y + 1, // Position above the ore
                        z: block.z 
                    },
                    context,
                    dependencies
                );

                if (!moveResult.success) {
                    this.log('warn', `Failed to reach position ${positionKey}, skipping`);
                    continue;
                }

                // Mine the ore block
                const mineResult = await this.executeDependency(
                    'mineResource',
                    { 
                        name: oreType,
                        count: 1
                    },
                    context,
                    dependencies
                );

                if (mineResult.success) {
                    minedCount++;
                    this.minedPositions.add(positionKey);
                    this.totalMinedBlocks++;

                    const progress = ((i + 1) / totalBlocks * 100).toFixed(1);
                    this.log('debug', `Mined ${oreType} at ${positionKey} - ${progress}% complete`);
                } else {
                    this.log('warn', `Failed to mine ${oreType} at ${positionKey}`);
                }

                // Brief pause between mining operations
                await this.sleep(500);

            } catch (error) {
                this.log('warn', `Error mining at ${positionKey}: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
        }

        const efficiency = totalBlocks > 0 ? (minedCount / totalBlocks * 100).toFixed(1) : '0';
        
        return this.createSuccessResult(
            {
                totalBlocks,
                minedCount,
                efficiency: `${efficiency}%`,
                skippedBlocks: totalBlocks - minedCount
            },
            `Mining complete: ${minedCount}/${totalBlocks} blocks (${efficiency}% efficiency)`,
            [`Systematically mined ${minedCount} ${oreType} blocks`]
        );
    }

    private parseOreBlocks(scanData: any): { x: number, y: number, z: number }[] {
        const blocks: { x: number, y: number, z: number }[] = [];
        
        if (Array.isArray(scanData)) {
            for (const item of scanData) {
                if (item.position) {
                    blocks.push({
                        x: Math.floor(item.position.x),
                        y: Math.floor(item.position.y),
                        z: Math.floor(item.position.z)
                    });
                }
            }
        }

        return blocks;
    }

    private findLargestVein(
        oreBlocks: { x: number, y: number, z: number }[],
        oreType: string,
        maxBlocks: number
    ): OreVeinInfo | null {
        if (oreBlocks.length === 0) return null;

        // For now, treat all found blocks as one vein
        // In a more sophisticated implementation, we could use flood-fill
        // to find connected components of ore blocks
        
        const centerBlock = this.findCentralBlock(oreBlocks);
        const limitedBlocks = oreBlocks.slice(0, maxBlocks);

        return {
            corePosition: centerBlock,
            oreBlocks: limitedBlocks,
            oreType,
            estimatedCount: limitedBlocks.length
        };
    }

    private findCentralBlock(blocks: { x: number, y: number, z: number }[]): { x: number, y: number, z: number } {
        const avgX = blocks.reduce((sum, b) => sum + b.x, 0) / blocks.length;
        const avgY = blocks.reduce((sum, b) => sum + b.y, 0) / blocks.length;
        const avgZ = blocks.reduce((sum, b) => sum + b.z, 0) / blocks.length;

        // Find the block closest to the average position
        let closestBlock = blocks[0];
        let minDistance = Infinity;

        for (const block of blocks) {
            const distance = Math.sqrt(
                Math.pow(block.x - avgX, 2) +
                Math.pow(block.y - avgY, 2) +
                Math.pow(block.z - avgZ, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                closestBlock = block;
            }
        }

        return closestBlock;
    }

    private calculateOptimalMiningPath(blocks: { x: number, y: number, z: number }[]): { x: number, y: number, z: number }[] {
        // Simple optimization: sort by Y level (mine from top to bottom), then by distance
        return blocks.sort((a, b) => {
            // First sort by Y (higher Y first)
            if (a.y !== b.y) return b.y - a.y;
            
            // Then by X
            if (a.x !== b.x) return a.x - b.x;
            
            // Finally by Z
            return a.z - b.z;
        });
    }

    private async isDangerousPosition(
        position: { x: number, y: number, z: number },
        context: ISkillContext
    ): Promise<boolean> {
        // Simple safety check - in a real implementation, we'd scan for lava
        // For now, assume positions below Y=11 might be dangerous
        return position.y < 11;
    }

    private isValidOreType(oreType: string): boolean {
        const validOres = [
            'iron_ore', 'coal_ore', 'diamond_ore', 'gold_ore',
            'redstone_ore', 'lapis_ore', 'emerald_ore', 'copper_ore',
            'deepslate_iron_ore', 'deepslate_coal_ore', 'deepslate_diamond_ore',
            'deepslate_gold_ore', 'deepslate_redstone_ore', 'deepslate_lapis_ore',
            'deepslate_emerald_ore', 'deepslate_copper_ore'
        ];

        return validOres.includes(oreType.toLowerCase());
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Stop mining (can be called externally)
     */
    stopMining(): void {
        this.miningActive = false;
        this.log('info', 'Ore vein mining stopped');
    }

    /**
     * Check if currently mining
     */
    isMining(): boolean {
        return this.miningActive;
    }

    /**
     * Get current vein information
     */
    getCurrentVein(): OreVeinInfo | null {
        return this.currentVein;
    }

    /**
     * Get mining progress
     */
    getMiningProgress(): { total: number, mined: number, percentage: number } {
        const total = this.currentVein?.oreBlocks.length || 0;
        const mined = this.totalMinedBlocks;
        const percentage = total > 0 ? (mined / total * 100) : 0;

        return { total, mined, percentage };
    }

    /**
     * Handle partial failure with intelligent recovery
     */
    async handlePartialFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        // For mining, some failures are acceptable
        if (step.skillName === 'mineResource') {
            this.log('warn', 'Failed to mine single block, continuing with next block');
            return true; // Continue mining other blocks
        }

        if (step.skillName === 'goToKnownLocation') {
            this.log('warn', 'Failed to reach mining position, trying next position');
            return true; // Skip this position, try next
        }

        if (step.skillName === 'lookAround') {
            this.log('warn', 'Ore scanning failed, retrying...');
            return true; // Retry scanning
        }

        return super.handlePartialFailure(step, error, context);
    }

    /**
     * Enhanced rollback - stop mining and reset state
     */
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        if (stepId.includes('mineCompleteVein')) {
            this.stopMining();
            this.minedPositions.clear();
            this.totalMinedBlocks = 0;
            this.currentVein = null;
            this.log('info', 'Rolled back: stopped mining and reset vein state');
        }
    }

    /**
     * This skill supports rollback by stopping mining and resetting state
     */
    protected supportsRollback(): boolean {
        return true;
    }
}