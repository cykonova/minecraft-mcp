/**
 * Legacy container configuration - now delegates to enhanced configuration
 * @deprecated Use the enhanced container configuration from ./config/container.js
 */

import 'reflect-metadata';
import { 
  configureContainer as enhancedConfigureContainer, 
  getContainer as enhancedGetContainer,
  addServiceProvider 
} from './config/container.js';
import { 
  CoreServicesProvider, 
  SkillServicesProvider, 
  BotServicesProvider, 
  UtilityServicesProvider 
} from './providers/ServiceProvider.js';

/**
 * Configure the dependency injection container
 * @deprecated Use configureContainer from ./config/container.js
 */
export function configureContainer(): void {
  // Add service providers
  addServiceProvider(new CoreServicesProvider());
  addServiceProvider(new SkillServicesProvider());
  addServiceProvider(new BotServicesProvider());
  addServiceProvider(new UtilityServicesProvider());

  // Configure with enhanced container
  enhancedConfigureContainer();
  
  console.error('[Container] Legacy container configuration completed - using enhanced DI system');
}

/**
 * Get the configured container
 * @deprecated Use getContainer from ./config/container.js
 */
export function getContainer() {
  return enhancedGetContainer();
}