/**
 * Example usage of the ServiceRegistry
 * Demonstrates how to register services, handle dependencies, and perform health checks
 */

import { container } from 'tsyringe';
import { ServiceRegistry } from './ServiceRegistry.js';
import { IServiceRegistry, ServiceStatus, HealthCheckResult } from './IServiceRegistry.js';
import { TOKENS } from '../config/tokens.js';

/**
 * Example service interface
 */
interface IExampleService {
  getName(): string;
  process(data: any): Promise<any>;
  isHealthy(): boolean;
}

/**
 * Example database service
 */
class DatabaseService implements IExampleService {
  private connected = false;
  private connectionTime = 0;

  getName(): string {
    return 'DatabaseService';
  }

  async connect(): Promise<void> {
    console.log('Connecting to database...');
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.connected = true;
    this.connectionTime = Date.now();
    console.log('Database connected');
  }

  async disconnect(): Promise<void> {
    console.log('Disconnecting from database...');
    this.connected = false;
    this.connectionTime = 0;
    console.log('Database disconnected');
  }

  async process(query: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    // Simulate query processing
    return { result: `Processed: ${query}` };
  }

  isHealthy(): boolean {
    return this.connected && (Date.now() - this.connectionTime) < 300000; // 5 minutes
  }
}

/**
 * Example API service that depends on database
 */
class ApiService implements IExampleService {
  private server: any = null;
  private port = 3000;

  constructor(private dbService: DatabaseService) {}

  getName(): string {
    return 'ApiService';
  }

  async start(): Promise<void> {
    console.log(`Starting API server on port ${this.port}...`);
    // Simulate server startup
    await new Promise(resolve => setTimeout(resolve, 500));
    this.server = { listening: true, port: this.port };
    console.log(`API server started on port ${this.port}`);
  }

  async stop(): Promise<void> {
    console.log('Stopping API server...');
    this.server = null;
    console.log('API server stopped');
  }

  async process(request: any): Promise<any> {
    if (!this.server) {
      throw new Error('API server not started');
    }
    // Delegate to database
    return this.dbService.process(request.query);
  }

  isHealthy(): boolean {
    return this.server?.listening && this.dbService.isHealthy();
  }
}

/**
 * Example usage of the ServiceRegistry
 */
export async function demonstrateServiceRegistry(): Promise<void> {
  console.log('\n=== ServiceRegistry Demo ===\n');

  // Get the service registry from the DI container
  const registry: IServiceRegistry = container.resolve(TOKENS.ServiceRegistry);

  try {
    // Create service instances
    const dbService = new DatabaseService();
    const apiService = new ApiService(dbService);

    // Register database service
    const dbServiceId = await registry.register(
      'database',
      dbService,
      {
        name: 'database',
        version: '1.0.0',
        description: 'Database connection service',
        dependencies: [],
        tags: ['infrastructure', 'database'],
        capabilities: ['data-storage', 'query-processing']
      },
      {
        healthCheck: async (): Promise<HealthCheckResult> => {
          const healthy = dbService.isHealthy();
          return {
            healthy,
            status: healthy ? ServiceStatus.RUNNING : ServiceStatus.UNHEALTHY,
            message: healthy ? 'Database is operational' : 'Database connection issues',
            timestamp: new Date()
          };
        },
        onStart: async () => {
          await dbService.connect();
        },
        onStop: async () => {
          await dbService.disconnect();
        }
      }
    );

    console.log(`✓ Registered database service: ${dbServiceId}`);

    // Register API service with dependency on database
    const apiServiceId = await registry.register(
      'api',
      apiService,
      {
        name: 'api',
        version: '2.1.0',
        description: 'REST API service',
        dependencies: ['database'],
        tags: ['api', 'web'],
        capabilities: ['http-server', 'rest-api']
      },
      {
        healthCheck: async (): Promise<HealthCheckResult> => {
          const healthy = apiService.isHealthy();
          return {
            healthy,
            status: healthy ? ServiceStatus.RUNNING : ServiceStatus.UNHEALTHY,
            message: healthy ? 'API server is responding' : 'API server issues',
            timestamp: new Date()
          };
        },
        onStart: async () => {
          await apiService.start();
        },
        onStop: async () => {
          await apiService.stop();
        },
        dependencies: ['database']
      }
    );

    console.log(`✓ Registered API service: ${apiServiceId}`);

    // List all services
    console.log('\n📋 Registered services:');
    const serviceNames = registry.listServices();
    serviceNames.forEach(name => {
      console.log(`  - ${name}`);
    });

    // Show dependency order
    console.log('\n🔗 Dependency resolution order:');
    const startOrder = registry.resolveDependencyOrder();
    startOrder.forEach((serviceId, index) => {
      const registration = registry.getRegistration(serviceId);
      console.log(`  ${index + 1}. ${registration?.name} (${serviceId})`);
    });

    // Start all services (respecting dependencies)
    console.log('\n🚀 Starting all services...');
    await registry.startAll();

    // Check registry stats
    console.log('\n📊 Registry statistics:');
    const stats = registry.getStats();
    console.log(`  Total services: ${stats.totalServices}`);
    console.log(`  Running services: ${stats.runningServices}`);
    console.log(`  Stopped services: ${stats.stoppedServices}`);
    console.log(`  Error services: ${stats.errorServices}`);
    console.log(`  Uptime: ${Math.round(stats.uptime / 1000)}s`);

    // Perform health checks
    console.log('\n💚 Health check results:');
    const healthResults = await registry.checkAllHealth();
    for (const [serviceId, health] of healthResults) {
      const registration = registry.getRegistration(serviceId);
      const status = health.healthy ? '✓' : '✗';
      console.log(`  ${status} ${registration?.name}: ${health.message}`);
    }

    // Demonstrate service discovery
    console.log('\n🔍 Service discovery examples:');
    
    // Find services by tag
    const infrastructureServices = registry.discover({ tag: 'infrastructure' });
    console.log(`  Services with 'infrastructure' tag: ${infrastructureServices.length}`);

    // Find services by capability
    const apiServices = registry.discover({ capability: 'rest-api' });
    console.log(`  Services with 'rest-api' capability: ${apiServices.length}`);

    // Find healthy services
    const healthyServices = registry.discover({ healthy: true });
    console.log(`  Healthy services: ${healthyServices.length}`);

    // Get health summary
    console.log('\n📈 Health summary:');
    const healthSummary = registry.getHealthSummary();
    console.log(`  Total: ${healthSummary.total}`);
    console.log(`  Healthy: ${healthSummary.healthy}`);
    console.log(`  Unhealthy: ${healthSummary.unhealthy}`);
    console.log(`  Unknown: ${healthSummary.unknown}`);

    // Test service interaction
    console.log('\n🔄 Testing service interaction:');
    const database = registry.getServiceByName<DatabaseService>('database');
    const api = registry.getServiceByName<ApiService>('api');

    if (database && api) {
      try {
        const dbResult = await database.process('SELECT * FROM users');
        console.log(`  Database result:`, dbResult);

        const apiResult = await api.process({ query: 'SELECT * FROM orders' });
        console.log(`  API result:`, apiResult);
      } catch (error) {
        console.error(`  Service interaction error:`, error);
      }
    }

    // Wait a moment for health checks
    console.log('\n⏳ Waiting for automatic health checks...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Stop all services
    console.log('\n🛑 Stopping all services...');
    await registry.stopAll();

    // Final stats
    console.log('\n📊 Final registry statistics:');
    const finalStats = registry.getStats();
    console.log(`  Running services: ${finalStats.runningServices}`);
    console.log(`  Stopped services: ${finalStats.stoppedServices}`);

    console.log('\n✅ ServiceRegistry demo completed successfully!');

  } catch (error) {
    console.error('\n❌ ServiceRegistry demo failed:', error);
    throw error;
  }
}

/**
 * Example of registry event handling
 */
export function demonstrateServiceEvents(registry: IServiceRegistry): void {
  console.log('\n🎯 Setting up service event listeners...');

  registry.on('service:registered', (registration) => {
    console.log(`📝 Event: Service registered - ${registration.name}`);
  });

  registry.on('service:deregistered', (serviceId) => {
    console.log(`📝 Event: Service deregistered - ${serviceId}`);
  });

  registry.on('service:started', (serviceId) => {
    const registration = registry.getRegistration(serviceId);
    console.log(`📝 Event: Service started - ${registration?.name}`);
  });

  registry.on('service:stopped', (serviceId) => {
    const registration = registry.getRegistration(serviceId);
    console.log(`📝 Event: Service stopped - ${registration?.name}`);
  });

  registry.on('service:error', (serviceId, error) => {
    const registration = registry.getRegistration(serviceId);
    console.log(`📝 Event: Service error - ${registration?.name}: ${error.message}`);
  });

  registry.on('service:health:changed', (serviceId, health) => {
    const registration = registry.getRegistration(serviceId);
    const status = health.healthy ? '💚' : '💔';
    console.log(`📝 Event: Health changed - ${registration?.name} ${status}`);
  });

  registry.on('registry:ready', () => {
    console.log('📝 Event: Registry is ready');
  });

  registry.on('registry:shutdown', () => {
    console.log('📝 Event: Registry has shutdown');
  });
}

/**
 * Run the demo if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  // Setup DI container first
  import('../config/container.js').then(({ configureContainer }) => {
    configureContainer();
    return demonstrateServiceRegistry();
  }).catch(console.error);
}