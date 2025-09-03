/**
 * Type definitions for dependency injection tokens and configuration
 */

import { InjectionToken } from 'tsyringe';

/**
 * Service lifecycle types
 */
export type ServiceLifetime = 'singleton' | 'transient' | 'scoped';

/**
 * Service registration metadata
 */
export interface ServiceRegistration {
  token: string | symbol | InjectionToken<any>;
  implementation?: any;
  lifetime: ServiceLifetime;
  factory?: () => any;
  dependencies?: (string | symbol | InjectionToken<any>)[];
}

/**
 * Container configuration interface
 */
export interface ContainerConfiguration {
  autoRegister?: boolean;
  services: ServiceRegistration[];
  providers?: ServiceProviderConfiguration[];
}

/**
 * Service provider configuration
 */
export interface ServiceProviderConfiguration {
  name: string;
  provider: new () => IServiceProvider;
  dependencies?: (string | symbol | InjectionToken<any>)[];
}

/**
 * Base service provider interface
 */
export interface IServiceProvider {
  register(): void | Promise<void>;
  getName(): string;
  getDependencies(): (string | symbol | InjectionToken<any>)[];
}

/**
 * Dependency injection symbols for type-safe injection
 */
export const DI_SYMBOLS = {
  // Core services
  BotManager: Symbol('BotManager'),
  SkillRegistry: Symbol('SkillRegistry'),
  SkillsProvider: Symbol('SkillsProvider'),
  
  // Service registries
  BlockRegistry: Symbol('BlockRegistry'),
  PathfindingService: Symbol('PathfindingService'),
  
  // Configuration
  ContainerConfig: Symbol('ContainerConfig'),
  Logger: Symbol('Logger'),
  
  // Bot-related
  BotFactory: Symbol('BotFactory'),
  JavaBotFactory: Symbol('JavaBotFactory'),
  BedrockBotFactory: Symbol('BedrockBotFactory'),
  
  // Skills
  SkillFactory: Symbol('SkillFactory'),
  SkillLoader: Symbol('SkillLoader'),
  SkillValidator: Symbol('SkillValidator'),
  
  // Utilities
  FileSystem: Symbol('FileSystem'),
  PathUtils: Symbol('PathUtils'),
  EventBus: Symbol('EventBus')
} as const;

/**
 * Type-safe token type
 */
export type DIToken<T = any> = string | symbol | InjectionToken<T>;

/**
 * Service metadata for decorators
 */
export interface ServiceMetadata {
  lifetime: ServiceLifetime;
  token?: DIToken;
  dependencies?: DIToken[];
}

/**
 * Factory function type
 */
export type ServiceFactory<T = any> = () => T | Promise<T>;

/**
 * Container builder interface for fluent configuration
 */
export interface IContainerBuilder {
  registerSingleton<T>(token: DIToken<T>, implementation: new (...args: any[]) => T): IContainerBuilder;
  registerTransient<T>(token: DIToken<T>, implementation: new (...args: any[]) => T): IContainerBuilder;
  registerInstance<T>(token: DIToken<T>, instance: T): IContainerBuilder;
  registerFactory<T>(token: DIToken<T>, factory: ServiceFactory<T>): IContainerBuilder;
  registerProvider(provider: IServiceProvider): IContainerBuilder;
  build(): void;
}