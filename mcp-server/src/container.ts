import 'reflect-metadata';
import { container } from 'tsyringe';
import { SkillsProvider } from './services/SkillsProvider.js';
import { BotManager } from './botManager.js';
import { SkillRegistry } from './skillRegistry.js';

/**
 * Configure the dependency injection container
 */
export function configureContainer(): void {
  // Register services as singletons
  container.registerSingleton(SkillsProvider);
  container.registerSingleton(BotManager);
  container.registerSingleton(SkillRegistry);
  
  console.error('[Container] Dependency injection container configured');
}

/**
 * Get the configured container
 */
export function getContainer() {
  return container;
}