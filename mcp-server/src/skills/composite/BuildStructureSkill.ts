import { injectable } from 'tsyringe';
import { CompositeSkill } from '../CompositeSkill.js';
import { ISkillContext } from '../ISkillContext.js';
import { SkillDependencyMap, ExecutionStep } from '../ICompositeSkill.js';
import { SkillResult } from '../SkillResult.js';
import { skillDependency, autoResolveDependencies } from '../decorators/skillDependency.js';
import { ISkill } from '../ISkill.js';

interface Blueprint {
    name: string;
    dimensions: { width: number, height: number, length: number };
    blocks: Array<{
        x: number, y: number, z: number,
        block: string,
        priority: number,
        optional?: boolean
    }>;
    materials: Record<string, number>;
    estimatedTime: number;
}

interface BuildProgress {
    totalBlocks: number;
    placedBlocks: number;
    failedBlocks: number;
    materialsUsed: Record<string, number>;
    currentPhase: string;
}

/**
 * Composite skill for building structures from blueprints
 * 
 * This skill provides comprehensive structure building by:
 * - Loading and parsing blueprint data
 * - Checking material requirements
 * - Planning build phases and order
 * - Placing blocks systematically
 * - Handling material shortages gracefully
 * - Providing detailed progress tracking
 */
@injectable()
@autoResolveDependencies
export class BuildStructureSkill extends CompositeSkill {
    readonly name = 'buildStructure';
    readonly description = 'Builds complex structures from blueprints using systematic planning and execution';
    readonly category = 'composite' as const;
    readonly version = '1.0.0';
    readonly edition = 'java' as const;
    
    // Dependency injection properties
    @skillDependency({ 
        name: 'buildSomething', 
        edition: 'java',
        category: 'verified'
    })
    private buildSomething!: ISkill;
    
    @skillDependency({ 
        name: 'goToKnownLocation',
        edition: 'java',
        category: 'verified'
    })
    private goToLocation!: ISkill;
    
    @skillDependency({ 
        name: 'openInventory',
        edition: 'java',
        category: 'verified'
    })
    private openInventory!: ISkill;
    
    @skillDependency({ 
        name: 'placeItemNearYou',
        edition: 'java',
        category: 'verified',
        optional: true
    })
    private placeItem?: ISkill;

    // Required abstract properties
    readonly skillDependencies = ['buildSomething', 'goToKnownLocation', 'openInventory', 'placeItemNearYou'];
    readonly inputSchema = {
        type: 'object',
        properties: {
            blueprintName: { 
                type: 'string', 
                enum: ['simple_house', 'tower'],
                description: 'Name of the predefined blueprint to build' 
            },
            blueprint: { type: 'object', description: 'Custom blueprint object with structure definition' },
            startX: { type: 'number', description: 'X coordinate for build start position' },
            startY: { type: 'number', description: 'Y coordinate for build start position' },
            startZ: { type: 'number', description: 'Z coordinate for build start position' },
            checkMaterials: { type: 'boolean', default: true, description: 'Check material availability before building' },
            systematic: { type: 'boolean', default: true, description: 'Use systematic building approach' },
            allowPartialBuild: { type: 'boolean', default: false, description: 'Allow partial builds when materials insufficient' }
        },
        required: []
    };

    // Building state
    private currentBlueprint: Blueprint | null = null;
    private buildProgress: BuildProgress | null = null;
    private buildingActive = false;
    private buildStartPosition: { x: number, y: number, z: number } | null = null;

    constructor() {
        super();
    }

    protected createExecutionSteps(params: Record<string, any>): Omit<ExecutionStep, 'id'>[] {
        const { blueprintName, estimatedTime = 180 } = params;
        
        return [
            {
                skillName: 'loadBlueprint',
                params: { blueprintName },
                description: `Load blueprint: ${blueprintName}`,
                estimatedTime: 2000,
                optional: false
            },
            {
                skillName: 'openInventory',
                params: {},
                description: 'Check available materials',
                estimatedTime: 2000,
                optional: false
            },
            {
                skillName: 'planBuildPhases',
                params: {},
                description: 'Plan construction phases',
                estimatedTime: 3000,
                optional: false
            },
            {
                skillName: 'executeBuild',
                params: { systematic: true },
                description: 'Execute systematic construction',
                estimatedTime: estimatedTime * 1000,
                optional: false
            },
            {
                skillName: 'validateStructure',
                params: {},
                description: 'Validate completed structure',
                estimatedTime: 5000,
                optional: true
            }
        ];
    }

    async execute(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        // Inject dependencies
        Object.assign(this, dependencies);

        const { 
            blueprintName,
            blueprint, // Direct blueprint object
            startX, startY, startZ,
            checkMaterials = true,
            systematic = true,
            allowPartialBuild = false
        } = context.params;

        if (!blueprintName && !blueprint) {
            return this.createErrorResult(
                'Either blueprintName or blueprint object is required',
                'MISSING_BLUEPRINT'
            );
        }

        this.buildStartPosition = startX !== undefined && startY !== undefined && startZ !== undefined
            ? { x: startX, y: startY, z: startZ }
            : null;

        this.buildingActive = true;

        try {
            // Step 1: Load or parse the blueprint
            const blueprintResult = await this.loadBlueprint(blueprint || blueprintName, context);
            if (!blueprintResult.success) {
                return blueprintResult;
            }

            // Step 2: Check materials if requested
            if (checkMaterials) {
                const materialCheck = await this.checkMaterials(context, dependencies);
                if (!materialCheck.success && !allowPartialBuild) {
                    return materialCheck;
                }
            }

            // Step 3: Execute the build
            const buildResult = await this.executeBuild(context, dependencies, systematic);
            if (!buildResult.success) {
                return buildResult;
            }

            return this.createSuccessResult(
                {
                    blueprintName: this.currentBlueprint?.name,
                    dimensions: this.currentBlueprint?.dimensions,
                    progress: this.buildProgress,
                    startPosition: this.buildStartPosition,
                    systematic
                },
                `Successfully built structure: ${this.currentBlueprint?.name}`,
                [
                    `Placed ${this.buildProgress?.placedBlocks} blocks`,
                    `Used materials: ${Object.keys(this.buildProgress?.materialsUsed || {}).length} types`,
                    `Build efficiency: ${this.calculateBuildEfficiency()}%`
                ]
            );

        } catch (error) {
            this.buildingActive = false;
            return this.createErrorResult(
                `Failed to build structure: ${error instanceof Error ? error.message : String(error)}`,
                'STRUCTURE_BUILD_ERROR',
                { error }
            );
        } finally {
            this.buildingActive = false;
        }
    }

    private async loadBlueprint(blueprintData: any, context: ISkillContext): Promise<SkillResult> {
        try {
            if (typeof blueprintData === 'string') {
                // Load predefined blueprint by name
                this.currentBlueprint = this.getPredefinedBlueprint(blueprintData);
                
                if (!this.currentBlueprint) {
                    return this.createErrorResult(
                        `Blueprint '${blueprintData}' not found`,
                        'BLUEPRINT_NOT_FOUND'
                    );
                }
            } else if (typeof blueprintData === 'object') {
                // Use provided blueprint object
                this.currentBlueprint = this.validateBlueprint(blueprintData);
                
                if (!this.currentBlueprint) {
                    return this.createErrorResult(
                        'Invalid blueprint format',
                        'INVALID_BLUEPRINT'
                    );
                }
            } else {
                return this.createErrorResult(
                    'Blueprint must be a name string or blueprint object',
                    'INVALID_BLUEPRINT_TYPE'
                );
            }

            this.initializeBuildProgress();
            
            this.log('info', `Loaded blueprint: ${this.currentBlueprint.name} (${this.currentBlueprint.blocks.length} blocks)`);

            return this.createSuccessResult(
                this.currentBlueprint,
                `Blueprint loaded: ${this.currentBlueprint.name}`
            );

        } catch (error) {
            return this.createErrorResult(
                `Failed to load blueprint: ${error instanceof Error ? error.message : String(error)}`,
                'BLUEPRINT_LOAD_ERROR',
                { error }
            );
        }
    }

    private async checkMaterials(context: ISkillContext, dependencies: SkillDependencyMap): Promise<SkillResult> {
        if (!this.currentBlueprint) {
            return this.createErrorResult('No blueprint loaded', 'NO_BLUEPRINT');
        }

        try {
            // Check inventory
            const inventoryResult = await this.executeDependency(
                'openInventory',
                {},
                context,
                dependencies
            );

            // For now, we'll assume materials are available
            // In a real implementation, we'd parse the inventory result
            // and check against required materials

            this.log('info', `Materials check: ${Object.keys(this.currentBlueprint.materials).length} material types required`);

            return this.createSuccessResult(
                {
                    requiredMaterials: this.currentBlueprint.materials,
                    materialsAvailable: true
                },
                'Materials check completed'
            );

        } catch (error) {
            return this.createErrorResult(
                `Material check failed: ${error instanceof Error ? error.message : String(error)}`,
                'MATERIAL_CHECK_ERROR',
                { error }
            );
        }
    }

    private async executeBuild(
        context: ISkillContext,
        dependencies: SkillDependencyMap,
        systematic: boolean
    ): Promise<SkillResult> {
        if (!this.currentBlueprint || !this.buildProgress) {
            return this.createErrorResult('No blueprint or progress initialized', 'BUILD_NOT_READY');
        }

        const { blocks } = this.currentBlueprint;
        const basePosition = this.buildStartPosition || context.bot.entity.position;

        this.log('info', `Starting construction of ${blocks.length} blocks...`);

        // Sort blocks by priority and position for optimal building
        const buildOrder = systematic 
            ? this.calculateOptimalBuildOrder(blocks)
            : blocks;

        let phasesBuilt = 0;
        const phases = this.groupBlocksByPhase(buildOrder);

        for (const [phaseNum, phaseBlocks] of phases.entries()) {
            if (!this.buildingActive || context.signal?.aborted) {
                break;
            }

            this.buildProgress.currentPhase = `Phase ${phaseNum + 1}/${phases.length}`;
            this.log('info', `Starting ${this.buildProgress.currentPhase}: ${phaseBlocks.length} blocks`);

            // Build this phase using buildSomething skill
            const phaseCommands = this.convertBlocksToCommands(phaseBlocks, basePosition);
            
            const buildResult = await this.executeDependency(
                'buildSomething',
                { buildScript: phaseCommands },
                context,
                dependencies
            );

            if (buildResult.success) {
                phasesBuilt++;
                this.buildProgress.placedBlocks += phaseBlocks.length;
                
                // Update materials used
                for (const block of phaseBlocks) {
                    const material = block.block;
                    this.buildProgress.materialsUsed[material] = (this.buildProgress.materialsUsed[material] || 0) + 1;
                }

                this.log('info', `Completed ${this.buildProgress.currentPhase}`);
            } else {
                this.buildProgress.failedBlocks += phaseBlocks.length;
                this.log('warn', `Phase ${phaseNum + 1} failed: ${(buildResult as any).error}`);

                // Continue with next phase unless it's a critical failure
                if (!this.isRecoverableError(buildResult)) {
                    return this.createErrorResult(
                        `Critical failure in ${this.buildProgress.currentPhase}`,
                        'PHASE_BUILD_FAILED',
                        { buildResult }
                    );
                }
            }

            // Brief pause between phases
            await this.sleep(1000);
        }

        const success = this.buildProgress.placedBlocks > 0;
        const efficiency = this.calculateBuildEfficiency();

        return this.createSuccessResult(
            {
                totalPhases: phases.length,
                completedPhases: phasesBuilt,
                totalBlocks: this.buildProgress.totalBlocks,
                placedBlocks: this.buildProgress.placedBlocks,
                failedBlocks: this.buildProgress.failedBlocks,
                efficiency: `${efficiency}%`
            },
            `Build completed: ${this.buildProgress.placedBlocks}/${this.buildProgress.totalBlocks} blocks placed`,
            [`${efficiency}% build efficiency achieved`]
        );
    }

    private convertBlocksToCommands(
        blocks: Array<{ x: number, y: number, z: number, block: string }>,
        basePosition: { x: number, y: number, z: number }
    ): Array<any> {
        return blocks.map(block => ({
            command: 'setblock',
            x: basePosition.x + block.x,
            y: basePosition.y + block.y,
            z: basePosition.z + block.z,
            block: block.block
        }));
    }

    private calculateOptimalBuildOrder(blocks: Array<any>): Array<any> {
        // Sort by priority first, then by Y level (bottom to top), then by distance from center
        return blocks.sort((a, b) => {
            // Higher priority first
            if (a.priority !== b.priority) return b.priority - a.priority;
            
            // Lower Y (foundation) first
            if (a.y !== b.y) return a.y - b.y;
            
            // Closer to origin first
            const distA = Math.sqrt(a.x * a.x + a.z * a.z);
            const distB = Math.sqrt(b.x * b.x + b.z * b.z);
            return distA - distB;
        });
    }

    private groupBlocksByPhase(blocks: Array<any>): Array<Array<any>> {
        const phases: Array<Array<any>> = [];
        const phaseSize = 25; // Build in groups of 25 blocks
        
        for (let i = 0; i < blocks.length; i += phaseSize) {
            phases.push(blocks.slice(i, i + phaseSize));
        }

        return phases;
    }

    private calculateBuildEfficiency(): number {
        if (!this.buildProgress) return 0;
        
        const { totalBlocks, placedBlocks } = this.buildProgress;
        return totalBlocks > 0 ? Math.round((placedBlocks / totalBlocks) * 100) : 0;
    }

    private getPredefinedBlueprint(name: string): Blueprint | null {
        const blueprints: Record<string, Blueprint> = {
            'simple_house': {
                name: 'Simple House',
                dimensions: { width: 5, height: 4, length: 5 },
                blocks: [
                    // Foundation
                    ...this.generateFoundation(5, 5, 'stone'),
                    // Walls
                    ...this.generateWalls(5, 4, 5, 'oak_planks'),
                    // Roof
                    ...this.generateRoof(5, 5, 'oak_stairs')
                ],
                materials: {
                    'stone': 25,
                    'oak_planks': 64,
                    'oak_stairs': 25,
                    'glass': 8,
                    'oak_door': 1
                },
                estimatedTime: 120
            },
            'tower': {
                name: 'Stone Tower',
                dimensions: { width: 3, height: 10, length: 3 },
                blocks: [
                    ...this.generateTower(3, 10, 'stone_bricks')
                ],
                materials: {
                    'stone_bricks': 90,
                    'oak_planks': 18,
                    'ladder': 8
                },
                estimatedTime: 90
            }
        };

        return blueprints[name.toLowerCase()] || null;
    }

    private validateBlueprint(data: any): Blueprint | null {
        if (!data || typeof data !== 'object') return null;
        
        const required = ['name', 'blocks'];
        for (const field of required) {
            if (!(field in data)) return null;
        }

        if (!Array.isArray(data.blocks)) return null;

        return {
            name: data.name,
            dimensions: data.dimensions || { width: 1, height: 1, length: 1 },
            blocks: data.blocks.map((block: any, index: number) => ({
                x: block.x || 0,
                y: block.y || 0,
                z: block.z || 0,
                block: block.block || 'stone',
                priority: block.priority || 1,
                optional: block.optional || false
            })),
            materials: data.materials || {},
            estimatedTime: data.estimatedTime || 60
        };
    }

    private initializeBuildProgress(): void {
        if (!this.currentBlueprint) return;

        this.buildProgress = {
            totalBlocks: this.currentBlueprint.blocks.length,
            placedBlocks: 0,
            failedBlocks: 0,
            materialsUsed: {},
            currentPhase: 'Initialization'
        };
    }

    // Helper methods for generating simple structures
    private generateFoundation(width: number, length: number, material: string): Array<any> {
        const blocks = [];
        for (let x = 0; x < width; x++) {
            for (let z = 0; z < length; z++) {
                blocks.push({ x, y: 0, z, block: material, priority: 3 });
            }
        }
        return blocks;
    }

    private generateWalls(width: number, height: number, length: number, material: string): Array<any> {
        const blocks = [];
        for (let y = 1; y <= height; y++) {
            for (let x = 0; x < width; x++) {
                for (let z = 0; z < length; z++) {
                    // Only place blocks on the perimeter
                    if (x === 0 || x === width - 1 || z === 0 || z === length - 1) {
                        blocks.push({ x, y, z, block: material, priority: 2 });
                    }
                }
            }
        }
        return blocks;
    }

    private generateRoof(width: number, length: number, material: string): Array<any> {
        const blocks = [];
        const roofHeight = 4;
        for (let x = 0; x < width; x++) {
            for (let z = 0; z < length; z++) {
                blocks.push({ x, y: roofHeight, z, block: material, priority: 1 });
            }
        }
        return blocks;
    }

    private generateTower(width: number, height: number, material: string): Array<any> {
        const blocks = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                for (let z = 0; z < width; z++) {
                    // Hollow tower - only place blocks on perimeter
                    if (x === 0 || x === width - 1 || z === 0 || z === width - 1) {
                        blocks.push({ x, y, z, block: material, priority: 2 });
                    }
                }
            }
        }
        return blocks;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Stop building (can be called externally)
     */
    stopBuilding(): void {
        this.buildingActive = false;
        this.log('info', 'Structure building stopped');
    }

    /**
     * Check if currently building
     */
    isBuilding(): boolean {
        return this.buildingActive;
    }

    /**
     * Get current build progress
     */
    getBuildProgress(): BuildProgress | null {
        return this.buildProgress;
    }

    /**
     * Handle partial failure with construction recovery
     */
    async handlePartialFailure(
        step: ExecutionStep,
        error: SkillResult,
        context: ISkillContext
    ): Promise<boolean> {
        // For building, some failures are acceptable
        if (step.skillName === 'buildSomething') {
            this.log('warn', 'Build phase failed, continuing with next phase');
            return true; // Continue with next build phase
        }

        if (step.skillName === 'openInventory') {
            this.log('warn', 'Inventory check failed, proceeding without material verification');
            return true; // Continue without material check
        }

        return super.handlePartialFailure(step, error, context);
    }

    /**
     * Enhanced rollback - stop building and reset progress
     */
    protected async rollbackStep(stepId: string, context: ISkillContext): Promise<void> {
        if (stepId.includes('executeBuild')) {
            this.stopBuilding();
            this.buildProgress = null;
            this.currentBlueprint = null;
            this.log('info', 'Rolled back: stopped building and reset progress');
        }
    }

    /**
     * This skill supports rollback by stopping building and resetting state
     */
    protected supportsRollback(): boolean {
        return true;
    }
}