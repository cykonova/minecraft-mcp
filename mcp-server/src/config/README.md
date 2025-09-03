# Enhanced TSyringe Dependency Injection System

This directory contains the enhanced dependency injection infrastructure for the Minecraft MCP server, implementing REFACTOR-001.

## Files Overview

### `container.ts`
- **ContainerConfigurator**: Singleton pattern for container configuration management
- **ContainerBuilder**: Fluent API for service registration
- Supports singleton, transient, and factory service registration
- Handles service providers separately to avoid circular dependencies
- Provides convenience functions for backward compatibility

### `types.ts`
- Core type definitions for dependency injection
- Service lifecycle management (`singleton`, `transient`, `scoped`)
- Service registration metadata interfaces
- Container configuration interfaces
- Base service provider interface

### `tokens.ts`
- Type-safe injection tokens for all services
- Factory interfaces for type safety
- Configuration interfaces
- Token registry for runtime resolution
- Helper functions for token creation

## Service Providers

### Base Classes (`../providers/ServiceProvider.ts`)
- **ServiceProvider**: Abstract base class for all service providers
- **CoreServicesProvider**: Registers main application services
- **SkillServicesProvider**: Registers skill-related services
- **BotServicesProvider**: Registers bot-related services
- **UtilityServicesProvider**: Registers utility services (FileSystem, PathUtils, EventBus)

## Usage Examples

### Basic Service Registration
```typescript
import { getContainer, TOKENS } from './config/container.js';

const container = getContainer();
const botManager = container.resolve(TOKENS.BotManager);
const logger = container.resolve(TOKENS.Logger);
```

### Custom Service Provider
```typescript
import { ServiceProvider } from '../providers/ServiceProvider.js';

export class CustomServiceProvider extends ServiceProvider {
  constructor() {
    super('CustomServiceProvider');
  }

  register(): void {
    this.registerSingleton('MyService', MyServiceImplementation);
    this.registerFactory('MyFactory', () => new MyFactoryImpl());
  }
}
```

### Fluent Container Configuration
```typescript
import { ContainerConfigurator } from './config/container.js';

const configurator = ContainerConfigurator.getInstance();
configurator.addProvider(new CustomServiceProvider());
configurator.configure();
```

## Features

### Type Safety
- All services use typed injection tokens
- Factory interfaces ensure type correctness
- Generic helper functions for token creation

### Lifecycle Management
- **Singleton**: Single instance across application
- **Transient**: New instance for each resolution
- **Scoped**: Treated as singleton (TSyringe limitation)

### Backward Compatibility
- Legacy `src/container.ts` still works
- Existing code continues to function
- Gradual migration path available

### Service Providers
- Organized service registration
- Dependency tracking
- Lazy loading support
- Error handling and logging

## Container Initialization

The container follows a two-phase initialization:

1. **Core Services**: Basic services and configurations
2. **Providers**: Service providers that might need container access

This prevents circular dependency issues while maintaining flexibility.

## Built-in Services

### Core Services
- `BotManager`: Manages bot instances
- `SkillRegistry`: Skill registration and lookup
- `SkillsProvider`: Dynamic skill loading
- `BlockRegistry`: Minecraft block registry
- `PathfindingService`: Edition-agnostic pathfinding service

### Utility Services
- `Logger`: Application logging
- `FileSystem`: File operations abstraction
- `PathUtils`: Path manipulation utilities
- `EventBus`: Simple event system

### Configuration
- `ContainerConfig`: DI container settings
- `ServerConfig`: Server configuration

## Migration Guide

### From Legacy Container
```typescript
// Old way
import { getContainer } from './container.js';
const botManager = container.resolve(BotManager);

// New way
import { getContainer, TOKENS } from './config/container.js';
const botManager = container.resolve(TOKENS.BotManager);
```

### Adding New Services
```typescript
// Create service provider
export class MyServiceProvider extends ServiceProvider {
  register(): void {
    this.registerSingleton(TOKENS.MyService, MyServiceImpl);
  }
}

// Register provider
addServiceProvider(new MyServiceProvider());
```

## Testing Support

### Container Reset
```typescript
import { resetContainer } from './config/container.js';

// In tests
beforeEach(() => {
  resetContainer();
});
```

### Mock Services
```typescript
import { getContainer } from './config/container.js';

const container = getContainer();
container.registerInstance(TOKENS.Logger, mockLogger);
```

This enhanced DI system provides a solid foundation for scalable, maintainable, and testable code while preserving compatibility with existing implementations.