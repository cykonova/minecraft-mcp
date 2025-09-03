/**
 * Enhanced TSyringe container configuration
 */

import 'reflect-metadata';
import { container, DependencyContainer, InjectionToken } from 'tsyringe';
import { 
  ContainerConfiguration, 
  ServiceRegistration, 
  ServiceLifetime, 
  IServiceProvider,
  IContainerBuilder,
  DIToken,
  ServiceFactory
} from './types.js';
import { TOKENS } from './tokens.js';
// import { BotManager } from '../botManager.js'; // Removed due to circular dependency
import { SkillRegistry } from '../skillRegistry.js';
import { SkillsProvider } from '../services/SkillsProvider.js';
import { ServiceRegistry } from '../services/ServiceRegistry.js';
import { BlockRegistry } from '../services/BlockRegistry.js';
import { PathfindingService } from '../services/pathfinding/PathfindingService.js';
import { InventoryService } from '../services/inventory/InventoryService.js';
import { JavaInventoryStrategy } from '../services/inventory/strategies/JavaInventoryStrategy.js';
import { BedrockInventoryStrategy } from '../services/inventory/strategies/BedrockInventoryStrategy.js';
import { MovementService } from '../services/movement/MovementService.js';
import { BlockInteractionService } from '../services/blocks/BlockInteractionService.js';
import { CombatService } from '../services/combat/CombatService.js';
import { SkillResolver } from '../skills/SkillResolver.js';
import { SkillDependencyGraph } from '../skills/SkillDependencyGraph.js';
import { SkillDependencyInjectionManager } from '../skills/injection/SkillDependencyInjectionManager.js';
import { SkillDependencyValidator } from '../skills/validation/SkillDependencyValidator.js';

/**
 * Container builder for fluent configuration
 */
class ContainerBuilder implements IContainerBuilder {
  private registrations: ServiceRegistration[] = [];
  private providers: IServiceProvider[] = [];

  registerSingleton<T>(token: DIToken<T>, implementation: new (...args: any[]) => T): IContainerBuilder {
    this.registrations.push({
      token,
      implementation,
      lifetime: 'singleton'
    });
    return this;
  }

  registerTransient<T>(token: DIToken<T>, implementation: new (...args: any[]) => T): IContainerBuilder {
    this.registrations.push({
      token,
      implementation,
      lifetime: 'transient'
    });
    return this;
  }

  registerInstance<T>(token: DIToken<T>, instance: T): IContainerBuilder {
    container.registerInstance(token as any, instance);
    return this;
  }

  registerFactory<T>(token: DIToken<T>, factory: ServiceFactory<T>): IContainerBuilder {
    this.registrations.push({
      token,
      factory,
      lifetime: 'singleton'
    });
    return this;
  }

  registerProvider(provider: IServiceProvider): IContainerBuilder {
    this.providers.push(provider);
    return this;
  }

  build(): void {
    // Register all services first
    this.registrations.forEach(registration => {
      this.registerService(registration);
    });

    console.error('[ContainerBuilder] Container built with', this.registrations.length, 'services and', this.providers.length, 'providers');
  }

  buildProviders(): void {
    // Register all providers after container is marked as configured
    this.providers.forEach(provider => {
      provider.register();
    });

    console.error('[ContainerBuilder] Providers registered');
  }

  private registerService(registration: ServiceRegistration): void {
    const { token, implementation, lifetime, factory } = registration;

    if (factory) {
      container.register(token as any, { useFactory: factory });
    } else if (implementation) {
      switch (lifetime) {
        case 'singleton':
          container.registerSingleton(token as any, implementation);
          break;
        case 'transient':
          container.register(token as any, implementation);
          break;
        case 'scoped':
          // TSyringe doesn't have scoped by default, treat as singleton
          container.registerSingleton(token as any, implementation);
          break;
      }
    }
  }
}

/**
 * Enhanced container configurator
 */
export class ContainerConfigurator {
  private static instance: ContainerConfigurator;
  private isConfigured = false;
  private providers: IServiceProvider[] = [];

  private constructor() {}

  static getInstance(): ContainerConfigurator {
    if (!ContainerConfigurator.instance) {
      ContainerConfigurator.instance = new ContainerConfigurator();
    }
    return ContainerConfigurator.instance;
  }

  /**
   * Configure container with default services
   */
  configure(): void {
    if (this.isConfigured) {
      console.error('[ContainerConfigurator] Container already configured');
      return;
    }

    const builder = new ContainerBuilder();

    // Register core services as singletons
    builder
      // .registerSingleton(TOKENS.BotManager, BotManager) // Managed manually due to circular deps
      .registerSingleton(TOKENS.SkillRegistry, SkillRegistry)
      .registerSingleton(TOKENS.SkillsProvider, SkillsProvider)
      .registerSingleton(TOKENS.ServiceRegistry, ServiceRegistry)
      .registerSingleton(TOKENS.BlockRegistry, BlockRegistry)
      .registerSingleton(TOKENS.PathfindingService, PathfindingService)
      .registerSingleton(TOKENS.InventoryService, InventoryService)
      .registerSingleton(TOKENS.MovementService, MovementService)
      .registerSingleton(TOKENS.BlockInteractionService, BlockInteractionService)
      .registerSingleton(TOKENS.CombatService, CombatService)
      .registerSingleton(TOKENS.JavaInventoryStrategy, JavaInventoryStrategy)
      .registerSingleton(TOKENS.BedrockInventoryStrategy, BedrockInventoryStrategy)
      .registerSingleton(TOKENS.SkillResolver, SkillResolver)
      .registerSingleton(TOKENS.SkillDependencyGraph, SkillDependencyGraph)
      .registerSingleton(TOKENS.SkillDependencyInjectionManager, SkillDependencyInjectionManager)
      .registerSingleton(TOKENS.SkillDependencyValidator, SkillDependencyValidator);

    // Register configuration instances
    builder.registerInstance(TOKENS.ContainerConfig, {
      autoRegisterServices: true,
      enableLogging: true,
      skillCacheEnabled: true
    });

    builder.registerInstance(TOKENS.ServerConfig, {
      defaultHost: 'localhost',
      defaultPort: 25565,
      timeout: 30000
    });

    // Register utility factories
    builder.registerFactory(TOKENS.Logger, () => ({
      info: (message: string) => console.error(`[INFO] ${message}`),
      error: (message: string) => console.error(`[ERROR] ${message}`),
      warn: (message: string) => console.error(`[WARN] ${message}`),
      debug: (message: string) => console.error(`[DEBUG] ${message}`)
    }));

    // Register all added providers
    this.providers.forEach(provider => {
      builder.registerProvider(provider);
    });

    // Build core services first
    builder.build();
    this.isConfigured = true;

    // Then build providers that might need container access
    builder.buildProviders();

    console.error('[ContainerConfigurator] Dependency injection container configured successfully');
  }

  /**
   * Configure container with custom configuration
   */
  configureWith(config: ContainerConfiguration): void {
    if (this.isConfigured) {
      console.error('[ContainerConfigurator] Container already configured');
      return;
    }

    const builder = new ContainerBuilder();

    // Register services from configuration
    config.services.forEach(service => {
      switch (service.lifetime) {
        case 'singleton':
          if (service.implementation) {
            builder.registerSingleton(service.token, service.implementation);
          } else if (service.factory) {
            builder.registerFactory(service.token, service.factory);
          }
          break;
        case 'transient':
          if (service.implementation) {
            builder.registerTransient(service.token, service.implementation);
          }
          break;
      }
    });

    // Register providers from configuration
    if (config.providers) {
      config.providers.forEach(providerConfig => {
        const provider = new providerConfig.provider();
        builder.registerProvider(provider);
      });
    }

    builder.build();
    this.isConfigured = true;

    console.error('[ContainerConfigurator] Container configured with custom configuration');
  }

  /**
   * Add a service provider to be registered
   */
  addProvider(provider: IServiceProvider): void {
    this.providers.push(provider);
  }

  /**
   * Get the configured container
   */
  getContainer(): DependencyContainer {
    if (!this.isConfigured) {
      throw new Error('Container not configured. Call configure() first.');
    }
    return container;
  }

  /**
   * Reset the container (for testing)
   */
  reset(): void {
    container.clearInstances();
    this.isConfigured = false;
    this.providers = [];
    console.error('[ContainerConfigurator] Container reset');
  }

  /**
   * Check if container is configured
   */
  isContainerConfigured(): boolean {
    return this.isConfigured;
  }
}

/**
 * Convenience function to configure the container
 */
export function configureContainer(): void {
  const configurator = ContainerConfigurator.getInstance();
  configurator.configure();
}

/**
 * Convenience function to configure container with custom config
 */
export function configureContainerWith(config: ContainerConfiguration): void {
  const configurator = ContainerConfigurator.getInstance();
  configurator.configureWith(config);
}

/**
 * Get the configured container
 */
export function getContainer(): DependencyContainer {
  const configurator = ContainerConfigurator.getInstance();
  return configurator.getContainer();
}

/**
 * Add a service provider
 */
export function addServiceProvider(provider: IServiceProvider): void {
  const configurator = ContainerConfigurator.getInstance();
  configurator.addProvider(provider);
}

/**
 * Reset the container (primarily for testing)
 */
export function resetContainer(): void {
  const configurator = ContainerConfigurator.getInstance();
  configurator.reset();
}

/**
 * Check if container is ready
 */
export function isContainerReady(): boolean {
  const configurator = ContainerConfigurator.getInstance();
  return configurator.isContainerConfigured();
}