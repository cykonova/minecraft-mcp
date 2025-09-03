# ServiceRegistry

The ServiceRegistry is a central registry for managing all services in the Minecraft MCP server. It provides comprehensive service lifecycle management, health monitoring, dependency resolution, and service discovery capabilities.

## Features

- **Service Registration & Discovery**: Register services and discover them using various query criteria
- **Dependency Management**: Automatic dependency resolution and ordered startup/shutdown
- **Health Monitoring**: Built-in health checks with automatic monitoring
- **Lifecycle Management**: Start/stop services individually or all together
- **Event System**: Real-time events for service state changes
- **Metadata Support**: Rich service metadata including version, tags, capabilities
- **DI Container Integration**: Full integration with TSyringe dependency injection

## Basic Usage

### 1. Get the ServiceRegistry from DI Container

```typescript
import { container } from 'tsyringe';
import { TOKENS } from '../config/tokens.js';
import { IServiceRegistry } from './IServiceRegistry.js';

const registry: IServiceRegistry = container.resolve(TOKENS.ServiceRegistry);
```

### 2. Register a Service

```typescript
// Simple service registration
const serviceId = await registry.register(
  'my-service',
  serviceInstance,
  {
    name: 'my-service',
    version: '1.0.0',
    description: 'My custom service',
    dependencies: ['database'], // Depends on 'database' service
    tags: ['api', 'web'],
    capabilities: ['http-server']
  },
  {
    healthCheck: async () => ({
      healthy: serviceInstance.isHealthy(),
      status: ServiceStatus.RUNNING,
      message: 'Service is operational',
      timestamp: new Date()
    }),
    onStart: async () => {
      await serviceInstance.start();
    },
    onStop: async () => {
      await serviceInstance.stop();
    },
    dependencies: ['database']
  }
);
```

### 3. Service Discovery

```typescript
// Find services by name
const dbService = registry.getServiceByName<DatabaseService>('database');

// Find services by tag
const webServices = registry.discover({ tag: 'web' });

// Find healthy services
const healthyServices = registry.discover({ healthy: true });

// Find services with specific capability
const apiServices = registry.discover({ capability: 'http-server' });
```

### 4. Lifecycle Management

```typescript
// Start a specific service
await registry.startService(serviceId);

// Start all services (respecting dependencies)
await registry.startAll();

// Stop a specific service
await registry.stopService(serviceId);

// Stop all services (reverse dependency order)
await registry.stopAll();

// Restart a service
await registry.restartService(serviceId);
```

### 5. Health Monitoring

```typescript
// Check health of a specific service
const health = await registry.checkHealth(serviceId);
console.log(`Service is ${health.healthy ? 'healthy' : 'unhealthy'}: ${health.message}`);

// Check health of all services
const allHealth = await registry.checkAllHealth();

// Get health summary
const summary = registry.getHealthSummary();
console.log(`${summary.healthy}/${summary.total} services are healthy`);
```

### 6. Event Handling

```typescript
// Listen for service events
registry.on('service:registered', (registration) => {
  console.log(`Service registered: ${registration.name}`);
});

registry.on('service:started', (serviceId) => {
  console.log(`Service started: ${serviceId}`);
});

registry.on('service:error', (serviceId, error) => {
  console.error(`Service error in ${serviceId}:`, error);
});

registry.on('service:health:changed', (serviceId, health) => {
  console.log(`Health changed for ${serviceId}: ${health.healthy}`);
});
```

## Advanced Features

### Dependency Resolution

The ServiceRegistry automatically resolves service dependencies and ensures services are started in the correct order:

```typescript
// Services will start in dependency order:
// 1. database (no dependencies)
// 2. api (depends on database)
// 3. web-server (depends on api)
await registry.startAll();

// And stop in reverse order:
// 1. web-server
// 2. api  
// 3. database
await registry.stopAll();
```

### Service Metadata

Rich metadata support enables powerful service discovery:

```typescript
const metadata = {
  name: 'user-api',
  version: '2.1.0',
  description: 'User management API',
  dependencies: ['database', 'auth'],
  tags: ['api', 'user-management'],
  capabilities: ['rest-api', 'user-crud', 'authentication'],
  configuration: {
    port: 3000,
    maxConnections: 100
  }
};
```

### Configuration Options

```typescript
const registry = new ServiceRegistry({
  healthCheckInterval: 30000,    // 30 seconds
  startupTimeout: 10000,         // 10 seconds
  shutdownTimeout: 10000,        // 10 seconds
  enableAutoHealthChecks: true,  // Enable automatic health checks
  enableDependencyResolution: true, // Enable dependency resolution
  maxRetries: 3,                 // Max retry attempts
  retryDelay: 1000              // Retry delay in ms
});
```

## Service States

Services can be in the following states:

- `REGISTERED`: Service is registered but not started
- `STARTING`: Service is in the process of starting
- `RUNNING`: Service is running normally
- `STOPPING`: Service is in the process of stopping
- `STOPPED`: Service is stopped
- `ERROR`: Service encountered an error
- `UNHEALTHY`: Service failed health check

## Error Handling

The ServiceRegistry provides comprehensive error handling:

```typescript
try {
  await registry.startService(serviceId);
} catch (error) {
  console.error('Failed to start service:', error);
  
  // Check if service is in error state
  const registration = registry.getRegistration(serviceId);
  if (registration?.status === ServiceStatus.ERROR) {
    // Handle error state
    await registry.restartService(serviceId);
  }
}
```

## Example Implementation

See `ServiceRegistry.example.ts` for a complete working example showing:

- Service registration with dependencies
- Health check implementation
- Event handling
- Service discovery
- Lifecycle management

## Integration with Existing Services

The ServiceRegistry is automatically registered in the DI container and can be used by any existing service:

```typescript
@injectable()
@singleton()
export class MyService {
  constructor(
    @inject(TOKENS.ServiceRegistry) private registry: IServiceRegistry
  ) {}
  
  async initialize() {
    // Register this service with the registry
    await this.registry.register('my-service', this, {
      name: 'my-service',
      version: '1.0.0'
    });
  }
}
```

## Best Practices

1. **Always provide health checks** for services that can fail
2. **Declare dependencies explicitly** for proper startup order
3. **Use meaningful service names and metadata** for easier discovery
4. **Handle service events** to respond to state changes
5. **Implement proper cleanup** in service stop methods
6. **Use tags and capabilities** for flexible service discovery
7. **Set appropriate timeouts** for your use case
8. **Monitor service health regularly**