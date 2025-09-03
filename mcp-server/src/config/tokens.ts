/**
 * Injection tokens for type-safe dependency injection
 */

import { InjectionToken } from 'tsyringe';
import { BotManager } from '../botManager.js';
import { SkillRegistry } from '../skillRegistry.js';
import { SkillsProvider } from '../services/SkillsProvider.js';
import { BlockRegistry } from '../services/BlockRegistry.js';
import { IBlockInteractionService } from '../services/blocks/IBlockInteractionService.js';
import { IPathfindingService } from '../services/pathfinding/IPathfindingService.js';
import { IInventoryService } from '../services/inventory/IInventoryService.js';
import { UnifiedBot } from '../bots/UnifiedBot.js';
import { BotWithLogger, Logger } from '../types.js';
import { ISkill } from '../skills/ISkill.js';

/**
 * Core service tokens
 */
export const TOKENS = {
  // Core services - using class constructors as tokens for simplicity
  BotManager: BotManager,
  SkillRegistry: SkillRegistry,
  SkillsProvider: SkillsProvider,
  
  // Service registries
  BlockRegistry: BlockRegistry,
  BlockInteractionService: 'BlockInteractionService' as any,
  PathfindingService: 'PathfindingService' as any,
  InventoryService: 'InventoryService' as any,
  
  // Typed injection tokens for interfaces and utilities
  Logger: 'Logger' as any,
  
  // Bot-related tokens
  BotFactory: 'BotFactory' as any,
  JavaBotFactory: 'JavaBotFactory' as any,
  BedrockBotFactory: 'BedrockBotFactory' as any,
  
  // Skill-related tokens
  SkillFactory: 'SkillFactory' as any,
  SkillLoader: 'SkillLoader' as any,
  SkillValidator: 'SkillValidator' as any,
  
  // Configuration tokens
  ContainerConfig: 'ContainerConfig' as any,
  ServerConfig: 'ServerConfig' as any,
  
  // Utility tokens
  FileSystem: 'FileSystem' as any,
  PathUtils: 'PathUtils' as any,
  EventBus: 'EventBus' as any,
  
  // Strategy tokens
  JavaInventoryStrategy: 'JavaInventoryStrategy' as any,
  BedrockInventoryStrategy: 'BedrockInventoryStrategy' as any
} as const;

/**
 * Factory interfaces for type safety
 */
export interface IBotFactory {
  create(config: BotConfig): Promise<UnifiedBot>;
}

export interface IJavaBotFactory {
  create(config: JavaBotConfig): Promise<BotWithLogger>;
}

export interface IBedrockBotFactory {
  create(config: BedrockBotConfig): Promise<UnifiedBot>;
}

export interface ISkillFactory {
  create(skillName: string, edition: 'java' | 'bedrock'): Promise<ISkill | null>;
}

export interface ISkillLoader {
  loadSkill(skillPath: string): Promise<ISkill | null>;
  loadSkillsFromDirectory(directory: string): Promise<ISkill[]>;
}

export interface ISkillValidator {
  validate(skill: ISkill): Promise<boolean>;
  validateArgs(skill: ISkill, args: any): boolean;
}

/**
 * Configuration interfaces
 */
export interface IContainerConfig {
  autoRegisterServices: boolean;
  enableLogging: boolean;
  skillCacheEnabled: boolean;
}

export interface IServerConfig {
  defaultHost: string;
  defaultPort: number;
  timeout: number;
}

export interface BotConfig {
  username: string;
  host: string;
  port: number;
  edition: 'java' | 'bedrock';
  version?: string;
  offline?: boolean;
}

export interface JavaBotConfig extends BotConfig {
  edition: 'java';
  auth?: 'microsoft' | 'mojang';
}

export interface BedrockBotConfig extends BotConfig {
  edition: 'bedrock';
  offline: boolean;
}

/**
 * Utility interfaces
 */
export interface IFileSystem {
  exists(path: string): boolean;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readDir(path: string): Promise<string[]>;
}

export interface IPathUtils {
  join(...paths: string[]): string;
  resolve(path: string): string;
  dirname(path: string): string;
  basename(path: string): string;
}

export interface IEventBus {
  emit(event: string, ...args: any[]): void;
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  once(event: string, listener: (...args: any[]) => void): void;
}

/**
 * Token type helper for better type inference
 */
export type TokenType<T> = T extends InjectionToken<infer U> ? U : T extends new (...args: any[]) => infer V ? V : never;

/**
 * Helper to create typed injection tokens
 */
export function createToken<T>(description: string): string {
  return description;
}

/**
 * Token registry for runtime token resolution
 */
export class TokenRegistry {
  private static tokenMap = new Map<string, any>();

  static register(name: string, token: any): void {
    this.tokenMap.set(name, token);
  }

  static resolve<T>(name: string): InjectionToken<T> | any {
    return this.tokenMap.get(name);
  }

  static getAll(): Map<string, any> {
    return new Map(this.tokenMap);
  }
}

// Register all tokens for runtime resolution
Object.entries(TOKENS).forEach(([name, token]) => {
  TokenRegistry.register(name, token);
});