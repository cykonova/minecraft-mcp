/**
 * Central service registry implementation
 * Provides service registration, discovery, and management capabilities
 */

import { EventEmitter } from 'events';
import { injectable, singleton } from 'tsyringe';
import { 
  IServiceRegistry, 
  ServiceRegistration, 
  ServiceMetadata, 
  ServiceQuery, 
  ServiceStatus, 
  HealthCheckResult,
  ServiceRegistryOptions,
  ServiceEvents
} from './IServiceRegistry.js';

/**
 * Default registry options
 */
const DEFAULT_OPTIONS: ServiceRegistryOptions = {
  healthCheckInterval: 30000, // 30 seconds
  startupTimeout: 10000, // 10 seconds
  shutdownTimeout: 10000, // 10 seconds
  enableAutoHealthChecks: true,
  enableDependencyResolution: true,
  maxRetries: 3,
  retryDelay: 1000 // 1 second
};

/**
 * Central service registry implementation
 */
@injectable()
@singleton()
export class ServiceRegistry extends EventEmitter implements IServiceRegistry {
  private services = new Map<string, ServiceRegistration>();
  private servicesByName = new Map<string, Set<string>>();
  private healthCheckTimer?: NodeJS.Timeout;
  private isShuttingDown = false;
  private ready = false;
  private startedAt = Date.now();
  private options: ServiceRegistryOptions;

  constructor(options: Partial<ServiceRegistryOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    this.setMaxListeners(100); // Allow more listeners for service events
    
    // Start health checks if enabled
    if (this.options.enableAutoHealthChecks) {
      this.startHealthChecks();
    }

    // Mark as ready after initialization
    this.ready = true;
    this.emit('registry:ready');
    
    console.error('[ServiceRegistry] Initialized with options:', this.options);
  }

  /**
   * Register a service with the registry
   */
  async register<T>(
    name: string,
    instance: T,
    metadata: Partial<ServiceMetadata>,
    options?: {
      healthCheck?: () => Promise<HealthCheckResult>;
      onStart?: () => Promise<void>;
      onStop?: () => Promise<void>;
      dependencies?: string[];
    }
  ): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error('Cannot register services during shutdown');
    }

    const serviceId = this.generateServiceId(name);
    const dependencies = options?.dependencies || metadata.dependencies || [];

    // Validate dependencies exist
    if (this.options.enableDependencyResolution) {
      for (const dep of dependencies) {
        if (!this.hasServiceByName(dep)) {
          console.warn(`[ServiceRegistry] Dependency '${dep}' for service '${name}' not found`);
        }
      }
    }

    const registration: ServiceRegistration = {
      id: serviceId,
      name,
      metadata: {
        name,
        version: '1.0.0',
        dependencies,
        ...metadata
      },
      status: ServiceStatus.REGISTERED,
      instance,
      healthCheck: options?.healthCheck,
      onStart: options?.onStart,
      onStop: options?.onStop,
      registeredAt: new Date(),
      dependsOn: dependencies,
      dependents: new Set()
    };

    // Update dependency relationships
    this.updateDependencyRelationships(registration);

    // Store the registration
    this.services.set(serviceId, registration);
    
    // Index by name
    if (!this.servicesByName.has(name)) {
      this.servicesByName.set(name, new Set());
    }
    this.servicesByName.get(name)!.add(serviceId);

    console.error(`[ServiceRegistry] Registered service: ${name} (${serviceId})`);
    this.emit('service:registered', registration);

    return serviceId;
  }

  /**
   * Deregister a service from the registry
   */
  async deregister(serviceId: string): Promise<void> {
    const registration = this.services.get(serviceId);
    if (!registration) {
      throw new Error(`Service ${serviceId} not found`);
    }

    // Check if other services depend on this one
    if (registration.dependents.size > 0) {
      const dependentNames = Array.from(registration.dependents)
        .map(id => this.services.get(id)?.name)
        .filter(Boolean);
      throw new Error(`Cannot deregister service ${registration.name}: still has dependents: ${dependentNames.join(', ')}`);
    }

    // Stop the service if running
    if (registration.status === ServiceStatus.RUNNING) {
      await this.stopService(serviceId);
    }

    // Remove from name index
    const nameSet = this.servicesByName.get(registration.name);
    if (nameSet) {
      nameSet.delete(serviceId);
      if (nameSet.size === 0) {
        this.servicesByName.delete(registration.name);
      }
    }

    // Update dependency relationships
    this.removeDependencyRelationships(registration);

    // Remove from registry
    this.services.delete(serviceId);

    console.error(`[ServiceRegistry] Deregistered service: ${registration.name} (${serviceId})`);
    this.emit('service:deregistered', serviceId);
  }

  /**
   * Get a service by ID
   */
  getService<T>(serviceId: string): T | null {
    const registration = this.services.get(serviceId);
    return registration ? registration.instance as T : null;
  }

  /**
   * Get a service by name (returns first match)
   */
  getServiceByName<T>(name: string): T | null {
    const serviceIds = this.servicesByName.get(name);
    if (!serviceIds || serviceIds.size === 0) {
      return null;
    }

    const serviceId = serviceIds.values().next().value;
    return this.getService<T>(serviceId);
  }

  /**
   * Get all services matching a name
   */
  getServicesByName<T>(name: string): T[] {
    const serviceIds = this.servicesByName.get(name);
    if (!serviceIds) {
      return [];
    }

    return Array.from(serviceIds)
      .map(id => this.getService<T>(id))
      .filter(Boolean) as T[];
  }

  /**
   * Discover services using query criteria
   */
  discover<T>(query: ServiceQuery): T[] {
    const matches: T[] = [];

    for (const registration of this.services.values()) {
      if (this.matchesQuery(registration, query)) {
        matches.push(registration.instance as T);
      }
    }

    return matches;
  }

  /**
   * Get service registration information
   */
  getRegistration(serviceId: string): ServiceRegistration | null {
    return this.services.get(serviceId) || null;
  }

  /**
   * Get all service registrations
   */
  getAllRegistrations(): ServiceRegistration[] {
    return Array.from(this.services.values());
  }

  /**
   * List all registered service names
   */
  listServices(): string[] {
    return Array.from(this.servicesByName.keys());
  }

  /**
   * Check if a service is registered
   */
  hasService(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  /**
   * Check if a service with name exists
   */
  hasServiceByName(name: string): boolean {
    return this.servicesByName.has(name) && this.servicesByName.get(name)!.size > 0;
  }

  /**
   * Start a specific service
   */
  async startService(serviceId: string): Promise<void> {
    const registration = this.services.get(serviceId);
    if (!registration) {
      throw new Error(`Service ${serviceId} not found`);
    }

    if (registration.status === ServiceStatus.RUNNING) {
      console.warn(`[ServiceRegistry] Service ${registration.name} is already running`);
      return;
    }

    try {
      registration.status = ServiceStatus.STARTING;
      console.error(`[ServiceRegistry] Starting service: ${registration.name}`);

      // Start dependencies first if enabled
      if (this.options.enableDependencyResolution) {
        await this.startDependencies(registration);
      }

      // Call the service's start method if available
      if (registration.onStart) {
        await this.withTimeout(
          registration.onStart(),
          this.options.startupTimeout!,
          `Service ${registration.name} startup timeout`
        );
      }

      registration.status = ServiceStatus.RUNNING;
      console.error(`[ServiceRegistry] Started service: ${registration.name}`);
      this.emit('service:started', serviceId);

      // Perform initial health check
      if (registration.healthCheck) {
        try {
          const health = await registration.healthCheck();
          registration.lastHealthCheck = health;
        } catch (error) {
          console.error(`[ServiceRegistry] Initial health check failed for ${registration.name}:`, error);
        }
      }

    } catch (error) {
      registration.status = ServiceStatus.ERROR;
      console.error(`[ServiceRegistry] Failed to start service ${registration.name}:`, error);
      this.emit('service:error', serviceId, error as Error);
      throw error;
    }
  }

  /**
   * Stop a specific service
   */
  async stopService(serviceId: string): Promise<void> {
    const registration = this.services.get(serviceId);
    if (!registration) {
      throw new Error(`Service ${serviceId} not found`);
    }

    if (registration.status === ServiceStatus.STOPPED) {
      console.warn(`[ServiceRegistry] Service ${registration.name} is already stopped`);
      return;
    }

    try {
      registration.status = ServiceStatus.STOPPING;
      console.error(`[ServiceRegistry] Stopping service: ${registration.name}`);

      // Stop dependents first if they exist
      if (registration.dependents.size > 0) {
        for (const dependentId of registration.dependents) {
          const dependent = this.services.get(dependentId);
          if (dependent && dependent.status === ServiceStatus.RUNNING) {
            console.warn(`[ServiceRegistry] Stopping dependent service: ${dependent.name}`);
            await this.stopService(dependentId);
          }
        }
      }

      // Call the service's stop method if available
      if (registration.onStop) {
        await this.withTimeout(
          registration.onStop(),
          this.options.shutdownTimeout!,
          `Service ${registration.name} shutdown timeout`
        );
      }

      registration.status = ServiceStatus.STOPPED;
      console.error(`[ServiceRegistry] Stopped service: ${registration.name}`);
      this.emit('service:stopped', serviceId);

    } catch (error) {
      registration.status = ServiceStatus.ERROR;
      console.error(`[ServiceRegistry] Failed to stop service ${registration.name}:`, error);
      this.emit('service:error', serviceId, error as Error);
      throw error;
    }
  }

  /**
   * Start all registered services (respecting dependencies)
   */
  async startAll(): Promise<void> {
    if (!this.options.enableDependencyResolution) {
      // Start all services in parallel
      const promises = Array.from(this.services.keys()).map(id => this.startService(id));
      await Promise.all(promises);
      return;
    }

    // Start services in dependency order
    const startOrder = this.resolveDependencyOrder();
    console.error(`[ServiceRegistry] Starting services in order: ${startOrder.map(id => this.services.get(id)?.name).join(' -> ')}`);

    for (const serviceId of startOrder) {
      const registration = this.services.get(serviceId);
      if (registration && registration.status !== ServiceStatus.RUNNING) {
        await this.startService(serviceId);
      }
    }

    console.error('[ServiceRegistry] All services started successfully');
  }

  /**
   * Stop all registered services (reverse dependency order)
   */
  async stopAll(): Promise<void> {
    if (!this.options.enableDependencyResolution) {
      // Stop all services in parallel
      const promises = Array.from(this.services.keys()).map(id => this.stopService(id));
      await Promise.all(promises);
      return;
    }

    // Stop services in reverse dependency order
    const stopOrder = this.resolveDependencyOrder().reverse();
    console.error(`[ServiceRegistry] Stopping services in order: ${stopOrder.map(id => this.services.get(id)?.name).join(' -> ')}`);

    for (const serviceId of stopOrder) {
      const registration = this.services.get(serviceId);
      if (registration && registration.status === ServiceStatus.RUNNING) {
        await this.stopService(serviceId);
      }
    }

    console.error('[ServiceRegistry] All services stopped successfully');
  }

  /**
   * Restart a service
   */
  async restartService(serviceId: string): Promise<void> {
    await this.stopService(serviceId);
    await this.startService(serviceId);
  }

  /**
   * Perform health check on a specific service
   */
  async checkHealth(serviceId: string): Promise<HealthCheckResult> {
    const registration = this.services.get(serviceId);
    if (!registration) {
      throw new Error(`Service ${serviceId} not found`);
    }

    if (!registration.healthCheck) {
      return {
        healthy: registration.status === ServiceStatus.RUNNING,
        status: registration.status,
        message: 'No health check configured',
        timestamp: new Date()
      };
    }

    try {
      const startTime = Date.now();
      const result = await registration.healthCheck();
      const responseTime = Date.now() - startTime;

      registration.lastHealthCheck = { ...result, responseTime };
      
      // Update service status based on health check
      if (!result.healthy && registration.status === ServiceStatus.RUNNING) {
        registration.status = ServiceStatus.UNHEALTHY;
        this.emit('service:health:changed', serviceId, result);
      } else if (result.healthy && registration.status === ServiceStatus.UNHEALTHY) {
        registration.status = ServiceStatus.RUNNING;
        this.emit('service:health:changed', serviceId, result);
      }

      return registration.lastHealthCheck;
    } catch (error) {
      const healthResult: HealthCheckResult = {
        healthy: false,
        status: ServiceStatus.ERROR,
        message: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date()
      };

      registration.lastHealthCheck = healthResult;
      registration.status = ServiceStatus.ERROR;
      this.emit('service:error', serviceId, error as Error);
      
      return healthResult;
    }
  }

  /**
   * Perform health check on all services
   */
  async checkAllHealth(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    const promises = Array.from(this.services.keys()).map(async serviceId => {
      try {
        const health = await this.checkHealth(serviceId);
        results.set(serviceId, health);
      } catch (error) {
        results.set(serviceId, {
          healthy: false,
          status: ServiceStatus.ERROR,
          message: error instanceof Error ? error.message : 'Health check failed',
          timestamp: new Date()
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get health status of all services
   */
  getHealthSummary(): { total: number; healthy: number; unhealthy: number; unknown: number; } {
    let healthy = 0;
    let unhealthy = 0;
    let unknown = 0;

    for (const registration of this.services.values()) {
      if (!registration.lastHealthCheck) {
        unknown++;
        continue;
      }

      if (registration.lastHealthCheck.healthy) {
        healthy++;
      } else {
        unhealthy++;
      }
    }

    return {
      total: this.services.size,
      healthy,
      unhealthy,
      unknown
    };
  }

  /**
   * Get services that depend on a given service
   */
  getDependents(serviceId: string): string[] {
    const registration = this.services.get(serviceId);
    return registration ? Array.from(registration.dependents) : [];
  }

  /**
   * Get services that a given service depends on
   */
  getDependencies(serviceId: string): string[] {
    const registration = this.services.get(serviceId);
    return registration ? registration.dependsOn.slice() : [];
  }

  /**
   * Resolve dependency order for service startup
   */
  resolveDependencyOrder(): string[] {
    if (!this.options.enableDependencyResolution) {
      return Array.from(this.services.keys());
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (serviceId: string) => {
      if (visiting.has(serviceId)) {
        const serviceName = this.services.get(serviceId)?.name || serviceId;
        throw new Error(`Circular dependency detected involving service: ${serviceName}`);
      }

      if (visited.has(serviceId)) {
        return;
      }

      visiting.add(serviceId);
      const registration = this.services.get(serviceId);

      if (registration) {
        // Visit dependencies first
        for (const depName of registration.dependsOn) {
          const depIds = this.servicesByName.get(depName);
          if (depIds) {
            for (const depId of depIds) {
              visit(depId);
            }
          }
        }
      }

      visiting.delete(serviceId);
      visited.add(serviceId);
      result.push(serviceId);
    };

    for (const serviceId of this.services.keys()) {
      visit(serviceId);
    }

    return result;
  }

  /**
   * Wait for a service to be available
   */
  async waitForService(serviceId: string, timeout = 10000): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkService = () => {
        const registration = this.services.get(serviceId);
        if (registration && registration.status === ServiceStatus.RUNNING) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for service ${serviceId}`));
          return;
        }

        setTimeout(checkService, 100);
      };

      checkService();
    });
  }

  /**
   * Wait for services to be available
   */
  async waitForServices(serviceIds: string[], timeout = 10000): Promise<void> {
    const promises = serviceIds.map(id => this.waitForService(id, timeout));
    await Promise.all(promises);
  }

  /**
   * Get registry statistics
   */
  getStats(): { totalServices: number; runningServices: number; stoppedServices: number; errorServices: number; uptime: number; lastHealthCheck?: Date; } {
    let runningServices = 0;
    let stoppedServices = 0;
    let errorServices = 0;
    let lastHealthCheck: Date | undefined;

    for (const registration of this.services.values()) {
      switch (registration.status) {
        case ServiceStatus.RUNNING:
          runningServices++;
          break;
        case ServiceStatus.STOPPED:
          stoppedServices++;
          break;
        case ServiceStatus.ERROR:
        case ServiceStatus.UNHEALTHY:
          errorServices++;
          break;
      }

      if (registration.lastHealthCheck) {
        if (!lastHealthCheck || registration.lastHealthCheck.timestamp > lastHealthCheck) {
          lastHealthCheck = registration.lastHealthCheck.timestamp;
        }
      }
    }

    return {
      totalServices: this.services.size,
      runningServices,
      stoppedServices,
      errorServices,
      uptime: Date.now() - this.startedAt,
      lastHealthCheck
    };
  }

  /**
   * Enable/disable automatic health checks
   */
  setAutoHealthChecks(enabled: boolean): void {
    if (enabled && !this.healthCheckTimer) {
      this.startHealthChecks();
    } else if (!enabled && this.healthCheckTimer) {
      this.stopHealthChecks();
    }
    
    this.options.enableAutoHealthChecks = enabled;
    console.error(`[ServiceRegistry] Auto health checks ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Gracefully shutdown the registry
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.error('[ServiceRegistry] Shutting down service registry...');

    // Stop health checks
    this.stopHealthChecks();

    try {
      // Stop all services
      await this.stopAll();
      
      // Clear all registrations
      this.services.clear();
      this.servicesByName.clear();
      
      this.ready = false;
      this.emit('registry:shutdown');
      
      console.error('[ServiceRegistry] Service registry shutdown complete');
    } catch (error) {
      console.error('[ServiceRegistry] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Check if the registry is ready
   */
  isReady(): boolean {
    return this.ready && !this.isShuttingDown;
  }

  /**
   * Get configuration for the registry
   */
  getOptions(): ServiceRegistryOptions {
    return { ...this.options };
  }

  /**
   * Update registry options
   */
  updateOptions(options: Partial<ServiceRegistryOptions>): void {
    const oldOptions = { ...this.options };
    this.options = { ...this.options, ...options };

    // Handle health check interval changes
    if (options.healthCheckInterval !== undefined && oldOptions.healthCheckInterval !== options.healthCheckInterval) {
      if (this.healthCheckTimer) {
        this.stopHealthChecks();
        this.startHealthChecks();
      }
    }

    console.error('[ServiceRegistry] Options updated:', options);
  }

  // Private helper methods

  private generateServiceId(name: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 5);
    return `${name}-${timestamp}-${random}`;
  }

  private updateDependencyRelationships(registration: ServiceRegistration): void {
    for (const depName of registration.dependsOn) {
      const depIds = this.servicesByName.get(depName);
      if (depIds) {
        for (const depId of depIds) {
          const depRegistration = this.services.get(depId);
          if (depRegistration) {
            depRegistration.dependents.add(registration.id);
          }
        }
      }
    }
  }

  private removeDependencyRelationships(registration: ServiceRegistration): void {
    for (const depName of registration.dependsOn) {
      const depIds = this.servicesByName.get(depName);
      if (depIds) {
        for (const depId of depIds) {
          const depRegistration = this.services.get(depId);
          if (depRegistration) {
            depRegistration.dependents.delete(registration.id);
          }
        }
      }
    }
  }

  private matchesQuery(registration: ServiceRegistration, query: ServiceQuery): boolean {
    if (query.name && registration.name !== query.name) {
      return false;
    }

    if (query.status && registration.status !== query.status) {
      return false;
    }

    if (query.version && registration.metadata.version !== query.version) {
      return false;
    }

    if (query.tag) {
      if (!registration.metadata.tags || !registration.metadata.tags.includes(query.tag)) {
        return false;
      }
    }

    if (query.capability) {
      if (!registration.metadata.capabilities || !registration.metadata.capabilities.includes(query.capability)) {
        return false;
      }
    }

    if (query.healthy !== undefined) {
      if (!registration.lastHealthCheck) {
        return !query.healthy;
      }
      if (registration.lastHealthCheck.healthy !== query.healthy) {
        return false;
      }
    }

    return true;
  }

  private async startDependencies(registration: ServiceRegistration): Promise<void> {
    for (const depName of registration.dependsOn) {
      const depIds = this.servicesByName.get(depName);
      if (depIds) {
        for (const depId of depIds) {
          const depRegistration = this.services.get(depId);
          if (depRegistration && depRegistration.status !== ServiceStatus.RUNNING) {
            console.error(`[ServiceRegistry] Starting dependency: ${depName} for ${registration.name}`);
            await this.startService(depId);
          }
        }
      }
    }
  }

  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      return;
    }

    const interval = this.options.healthCheckInterval || 30000;
    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.checkAllHealth();
      } catch (error) {
        console.error('[ServiceRegistry] Error during automated health checks:', error);
      }
    }, interval);

    console.error(`[ServiceRegistry] Started health checks with ${interval}ms interval`);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      console.error('[ServiceRegistry] Stopped health checks');
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }
}