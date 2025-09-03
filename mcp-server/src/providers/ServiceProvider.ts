/**
 * Base service provider class for registering services in the DI container
 */

import { injectable } from 'tsyringe';
import { IServiceProvider, DIToken } from '../config/types.js';
import { getContainer } from '../config/container.js';
import { TOKENS } from '../config/tokens.js';
import { BlockInteractionService } from '../services/blocks/BlockInteractionService.js';

/**
 * Abstract base class for service providers
 */
export abstract class ServiceProvider implements IServiceProvider {
  private name: string;
  private dependencies: DIToken[];

  constructor(name: string, dependencies: DIToken[] = []) {
    this.name = name;
    this.dependencies = dependencies;
  }

  /**
   * Register services in the container
   */
  abstract register(): void | Promise<void>;

  /**
   * Get the provider name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get provider dependencies
   */
  getDependencies(): DIToken[] {
    return this.dependencies;
  }

  /**
   * Helper method to get the container
   */
  protected getContainer() {
    return getContainer();
  }

  /**
   * Helper method to register a singleton service
   */
  protected registerSingleton<T>(token: DIToken<T>, implementation: new (...args: any[]) => T): void {
    const container = this.getContainer();
    container.registerSingleton(token as any, implementation);
    console.error(`[${this.name}] Registered singleton:`, this.getTokenName(token));
  }

  /**
   * Helper method to register a transient service
   */
  protected registerTransient<T>(token: DIToken<T>, implementation: new (...args: any[]) => T): void {
    const container = this.getContainer();
    container.register(token as any, implementation);
    console.error(`[${this.name}] Registered transient:`, this.getTokenName(token));
  }

  /**
   * Helper method to register an instance
   */
  protected registerInstance<T>(token: DIToken<T>, instance: T): void {
    const container = this.getContainer();
    container.registerInstance(token as any, instance);
    console.error(`[${this.name}] Registered instance:`, this.getTokenName(token));
  }

  /**
   * Helper method to register a factory
   */
  protected registerFactory<T>(token: DIToken<T>, factory: () => T): void {
    const container = this.getContainer();
    container.register(token as any, { useFactory: factory });
    console.error(`[${this.name}] Registered factory:`, this.getTokenName(token));
  }

  /**
   * Helper method to get a friendly token name for logging
   */
  private getTokenName(token: DIToken): string {
    if (typeof token === 'string') {
      return token;
    }
    if (typeof token === 'symbol') {
      return token.toString();
    }
    if (typeof token === 'function') {
      return token.name || token.toString();
    }
    if (token && typeof token === 'object' && 'key' in token) {
      return (token as any).key || token.toString();
    }
    return token?.toString() || 'unknown';
  }
}

/**
 * Core services provider that registers the main application services
 */
@injectable()
export class CoreServicesProvider extends ServiceProvider {
  constructor() {
    super('CoreServicesProvider');
  }

  register(): void {
    console.error(`[${this.getName()}] Registering core services...`);
    
    // Register BlockInteractionService as singleton
    this.registerSingleton(TOKENS.BlockInteractionService, BlockInteractionService);
    
    // Core services are already registered in the main container configuration
    // This provider can be used for additional core service registrations
    
    console.error(`[${this.getName()}] Core services registered successfully`);
  }
}

/**
 * Skills services provider for skill-related services
 */
@injectable()
export class SkillServicesProvider extends ServiceProvider {
  constructor() {
    super('SkillServicesProvider');
  }

  register(): void {
    console.error(`[${this.getName()}] Registering skill services...`);
    
    // Register skill-related factories and utilities here
    // Example: Skill validation services, skill loaders, etc.
    
    console.error(`[${this.getName()}] Skill services registered successfully`);
  }
}

/**
 * Bot services provider for bot-related services
 */
@injectable()
export class BotServicesProvider extends ServiceProvider {
  constructor() {
    super('BotServicesProvider');
  }

  register(): void {
    console.error(`[${this.getName()}] Registering bot services...`);
    
    // Register bot-related factories and utilities here
    // Example: Bot factories, connection managers, etc.
    
    console.error(`[${this.getName()}] Bot services registered successfully`);
  }
}

/**
 * Utility services provider for utility services
 */
@injectable()
export class UtilityServicesProvider extends ServiceProvider {
  constructor() {
    super('UtilityServicesProvider');
  }

  register(): void {
    console.error(`[${this.getName()}] Registering utility services...`);
    
    // Register file system, path utilities, event bus, etc.
    this.registerFactory('FileSystem' as any, () => ({
      exists: (path: string) => {
        try {
          const fs = require('fs');
          return fs.existsSync(path);
        } catch {
          return false;
        }
      },
      readFile: async (path: string) => {
        const fs = await import('fs/promises');
        return fs.readFile(path, 'utf-8');
      },
      writeFile: async (path: string, content: string) => {
        const fs = await import('fs/promises');
        return fs.writeFile(path, content);
      },
      readDir: async (path: string) => {
        const fs = await import('fs/promises');
        return fs.readdir(path);
      }
    }));

    this.registerFactory('PathUtils' as any, () => ({
      join: (...paths: string[]) => {
        const path = require('path');
        return path.join(...paths);
      },
      resolve: (path: string) => {
        const pathModule = require('path');
        return pathModule.resolve(path);
      },
      dirname: (path: string) => {
        const pathModule = require('path');
        return pathModule.dirname(path);
      },
      basename: (path: string) => {
        const pathModule = require('path');
        return pathModule.basename(path);
      }
    }));

    // Simple event bus implementation
    this.registerFactory('EventBus' as any, () => {
      const listeners = new Map<string, Function[]>();
      
      const eventBus = {
        emit: (event: string, ...args: any[]) => {
          const eventListeners = listeners.get(event);
          if (eventListeners) {
            eventListeners.forEach(listener => listener(...args));
          }
        },
        on: (event: string, listener: Function) => {
          if (!listeners.has(event)) {
            listeners.set(event, []);
          }
          listeners.get(event)!.push(listener);
        },
        off: (event: string, listener: Function) => {
          const eventListeners = listeners.get(event);
          if (eventListeners) {
            const index = eventListeners.indexOf(listener);
            if (index > -1) {
              eventListeners.splice(index, 1);
            }
          }
        },
        once: (event: string, listener: Function) => {
          const onceListener = (...args: any[]) => {
            listener(...args);
            eventBus.off(event, onceListener);
          };
          eventBus.on(event, onceListener);
        }
      };
      
      return eventBus;
    });
    
    console.error(`[${this.getName()}] Utility services registered successfully`);
  }
}