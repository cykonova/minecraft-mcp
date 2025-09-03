import { BotWithLogger, AnyBot } from '../types.js';
import { ISkillContext } from './ISkillContext.js';
import { SkillResult } from './SkillResult.js';
import { ISkillServiceParams } from '../types/skillType.js';

/**
 * Base interface for all skills - merges previous ISkill and SkillDefinition interfaces
 * This is the unified interface that all skills must implement
 */
export interface ISkill {
  /**
   * Unique skill name
   */
  name: string;

  /**
   * Human-readable description of what the skill does
   */
  description: string;

  /**
   * Minecraft edition compatibility
   */
  edition: 'java' | 'bedrock' | 'universal';

  /**
   * Skill category
   */
  category: 'verified' | 'library' | 'composite';

  /**
   * Skill type for the new hierarchy
   */
  type?: 'atomic' | 'composite';

  /**
   * Skill version (semantic versioning)
   */
  version?: string;

  /**
   * List of other skills this skill depends on
   */
  dependencies?: string[];

  /**
   * JSON Schema for input parameter validation
   */
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };

  /**
   * Execute the skill - supports both new and legacy calling conventions
   * New skills should implement the context-based version
   * Legacy skills can still use the old (bot, args, serviceParams) format
   */
  execute(botOrContext: AnyBot | ISkillContext, args?: any, serviceParams?: ISkillServiceParams): Promise<SkillResult | any>;
}

/**
 * Interface for Java Edition skills
 */
export interface IJavaSkill extends ISkill {
  edition: 'java';
  execute(bot: BotWithLogger, args: any): Promise<any>;
}

/**
 * Interface for Bedrock Edition skills
 */
export interface IBedrockSkill extends ISkill {
  edition: 'bedrock';
  execute(bot: any, args: any): Promise<any>; // Will be BedrockBot type when implemented
}

/**
 * Interface for Universal skills (work on both editions)
 */
export interface IUniversalSkill extends ISkill {
  edition: 'universal';
  execute(bot: AnyBot, args: any): Promise<any>;
}

/**
 * Skill metadata for registration - kept for backward compatibility
 * @deprecated Use ISkill directly instead
 */
export interface SkillMetadata {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Skill module structure for dynamic loading
 */
export interface SkillModule {
  default?: Function;
  [key: string]: Function | undefined;
}

/**
 * Type guard to check if a skill uses the new context-based interface
 */
export function isContextBasedSkill(skill: ISkill): skill is ISkill & {
  execute(context: ISkillContext): Promise<SkillResult>;
} {
  return skill.type === 'atomic' || skill.type === 'composite';
}

/**
 * Type guard to check if a skill is legacy (uses old parameter format)
 */
export function isLegacySkill(skill: ISkill): skill is ISkill & {
  execute(bot: AnyBot, args: any, serviceParams?: any): Promise<any>;
} {
  return !skill.type || (skill.type !== 'atomic' && skill.type !== 'composite');
}

/**
 * Helper to create a unified skill definition from legacy components
 */
export function createSkillDefinition(
  name: string,
  description: string,
  edition: 'java' | 'bedrock' | 'universal',
  category: 'verified' | 'library' | 'composite',
  inputSchema: { type: string; properties: Record<string, any>; required: string[] },
  execute: (bot: AnyBot, args: any) => Promise<any>
): ISkill {
  return {
    name,
    description,
    edition,
    category,
    inputSchema,
    execute,
  };
}