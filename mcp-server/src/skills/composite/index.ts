/**
 * Composite Skills Index
 * 
 * This module exports all composite skills and provides utilities for
 * registering and managing them within the skill system.
 */

export { FollowPlayerSkill } from './FollowPlayerSkill.js';
export { GuardPlayerSkill } from './GuardPlayerSkill.js';
export { MineOreVeinSkill } from './MineOreVeinSkill.js';
export { BuildStructureSkill } from './BuildStructureSkill.js';

import { container } from 'tsyringe';
import { FollowPlayerSkill } from './FollowPlayerSkill.js';
import { GuardPlayerSkill } from './GuardPlayerSkill.js';
import { MineOreVeinSkill } from './MineOreVeinSkill.js';
import { BuildStructureSkill } from './BuildStructureSkill.js';
import { ICompositeSkill } from '../ICompositeSkill.js';

/**
 * Array of all available composite skill classes
 */
export const COMPOSITE_SKILL_CLASSES = [
    FollowPlayerSkill,
    GuardPlayerSkill,
    MineOreVeinSkill,
    BuildStructureSkill
];

/**
 * Composite skill registry metadata
 */
export const COMPOSITE_SKILL_REGISTRY = {
    followPlayer: {
        class: FollowPlayerSkill,
        name: 'followPlayer',
        description: 'Follows a specified player around, maintaining a safe distance and providing continuous updates',
        category: 'composite',
        edition: 'java',
        dependencies: ['goToSomeone', 'lookAround', 'readChat']
    },
    guardPlayer: {
        class: GuardPlayerSkill,
        name: 'guardPlayer',
        description: 'Guards a specified player by staying close and fighting off hostile entities',
        category: 'composite',
        edition: 'java',
        dependencies: ['goToSomeone', 'lookAround', 'attackSomeone', 'readChat']
    },
    mineOreVein: {
        class: MineOreVeinSkill,
        name: 'mineOreVein',
        description: 'Mines entire ore veins by finding and extracting all connected ore blocks',
        category: 'composite',
        edition: 'java',
        dependencies: ['mineResource', 'lookAround', 'goToKnownLocation', 'openInventory']
    },
    buildStructure: {
        class: BuildStructureSkill,
        name: 'buildStructure',
        description: 'Builds complex structures from blueprints using systematic planning and execution',
        category: 'composite',
        edition: 'java',
        dependencies: ['buildSomething', 'goToKnownLocation', 'openInventory', 'placeItemNearYou']
    }
};

/**
 * Register all composite skills with the TSyringe container
 */
export function registerCompositeSkills(): void {
    for (const SkillClass of COMPOSITE_SKILL_CLASSES) {
        container.registerSingleton<ICompositeSkill>(SkillClass.name, SkillClass);
        console.log(`Registered composite skill: ${SkillClass.name}`);
    }
}

/**
 * Get all composite skill instances from the container
 */
export function getCompositeSkillInstances(): Record<string, ICompositeSkill> {
    const instances: Record<string, ICompositeSkill> = {};
    
    for (const [skillName, metadata] of Object.entries(COMPOSITE_SKILL_REGISTRY)) {
        try {
            instances[skillName] = container.resolve<ICompositeSkill>(metadata.class);
        } catch (error) {
            console.warn(`Failed to resolve composite skill ${skillName}:`, error);
        }
    }
    
    return instances;
}

/**
 * Get composite skill metadata by name
 */
export function getCompositeSkillMetadata(skillName: string) {
    return COMPOSITE_SKILL_REGISTRY[skillName] || null;
}

/**
 * Get all composite skill names
 */
export function getCompositeSkillNames(): string[] {
    return Object.keys(COMPOSITE_SKILL_REGISTRY);
}

/**
 * Check if a skill name is a composite skill
 */
export function isCompositeSkill(skillName: string): boolean {
    return skillName in COMPOSITE_SKILL_REGISTRY;
}

/**
 * Get dependencies for a composite skill
 */
export function getCompositeSkillDependencies(skillName: string): string[] {
    const metadata = COMPOSITE_SKILL_REGISTRY[skillName];
    return metadata?.dependencies || [];
}

/**
 * Create skill definition objects for MCP registration
 */
export function createCompositeSkillDefinitions() {
    const definitions: Array<any> = [];
    
    for (const [skillName, metadata] of Object.entries(COMPOSITE_SKILL_REGISTRY)) {
        definitions.push({
            name: metadata.name,
            description: metadata.description,
            category: metadata.category,
            edition: metadata.edition,
            type: 'composite',
            dependencies: metadata.dependencies,
            parameters: {
                type: 'object',
                properties: getSkillParameters(skillName),
                required: getRequiredParameters(skillName)
            }
        });
    }
    
    return definitions;
}

/**
 * Get skill-specific parameters based on skill name
 */
function getSkillParameters(skillName: string): Record<string, any> {
    const commonParams = {
        signal: {
            type: 'object',
            description: 'Abort signal for cancelling execution'
        }
    };

    const skillSpecificParams: Record<string, Record<string, any>> = {
        followPlayer: {
            playerName: {
                type: 'string',
                description: 'Name of the player to follow'
            },
            distance: {
                type: 'number',
                description: 'Distance to maintain from the player (1-10 blocks)',
                minimum: 1,
                maximum: 10,
                default: 3
            },
            duration: {
                type: 'number',
                description: 'How long to follow the player in seconds',
                minimum: 10,
                maximum: 3600,
                default: 300
            },
            stopOnCommand: {
                type: 'boolean',
                description: 'Whether to stop following when chat commands are received',
                default: true
            }
        },
        guardPlayer: {
            playerName: {
                type: 'string',
                description: 'Name of the player to guard'
            },
            duration: {
                type: 'number',
                description: 'How long to guard the player in seconds',
                minimum: 60,
                maximum: 7200,
                default: 600
            },
            guardDistance: {
                type: 'number',
                description: 'Distance to maintain from the guarded player',
                minimum: 2,
                maximum: 8,
                default: 4
            },
            threatRadius: {
                type: 'number',
                description: 'Radius to scan for threats',
                minimum: 4,
                maximum: 16,
                default: 8
            },
            alertPlayer: {
                type: 'boolean',
                description: 'Whether to alert the player about threats',
                default: true
            }
        },
        mineOreVein: {
            oreType: {
                type: 'string',
                description: 'Type of ore to mine',
                enum: ['iron_ore', 'coal_ore', 'diamond_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'emerald_ore', 'copper_ore'],
                default: 'iron_ore'
            },
            maxBlocks: {
                type: 'number',
                description: 'Maximum number of blocks to mine',
                minimum: 1,
                maximum: 256,
                default: 64
            },
            systematic: {
                type: 'boolean',
                description: 'Whether to use systematic mining approach',
                default: true
            },
            avoidLava: {
                type: 'boolean',
                description: 'Whether to avoid dangerous positions near lava',
                default: true
            },
            checkInventory: {
                type: 'boolean',
                description: 'Whether to check inventory after mining',
                default: true
            }
        },
        buildStructure: {
            blueprintName: {
                type: 'string',
                description: 'Name of the predefined blueprint to build',
                enum: ['simple_house', 'tower']
            },
            blueprint: {
                type: 'object',
                description: 'Custom blueprint object with structure definition'
            },
            startX: {
                type: 'number',
                description: 'X coordinate for build start position'
            },
            startY: {
                type: 'number',
                description: 'Y coordinate for build start position'
            },
            startZ: {
                type: 'number',
                description: 'Z coordinate for build start position'
            },
            checkMaterials: {
                type: 'boolean',
                description: 'Whether to check material availability before building',
                default: true
            },
            systematic: {
                type: 'boolean',
                description: 'Whether to use systematic building approach',
                default: true
            },
            allowPartialBuild: {
                type: 'boolean',
                description: 'Whether to allow partial builds when materials are insufficient',
                default: false
            }
        }
    };

    return {
        ...commonParams,
        ...(skillSpecificParams[skillName] || {})
    };
}

/**
 * Get required parameters for a skill
 */
function getRequiredParameters(skillName: string): string[] {
    const requiredParams: Record<string, string[]> = {
        followPlayer: ['playerName'],
        guardPlayer: ['playerName'],
        mineOreVein: [],
        buildStructure: []
    };

    return requiredParams[skillName] || [];
}