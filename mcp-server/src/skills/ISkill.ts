import { BotWithLogger, AnyBot } from '../types.js';

/**
 * Base interface for all skills
 */
export interface ISkill {
  name: string;
  description: string;
  edition: 'java' | 'bedrock' | 'universal';
  category: 'verified' | 'library';
  execute(bot: AnyBot, args: any): Promise<any>;
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
 * Skill metadata for registration
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
 * Skill module structure
 */
export interface SkillModule {
  default?: Function;
  [key: string]: Function | undefined;
}