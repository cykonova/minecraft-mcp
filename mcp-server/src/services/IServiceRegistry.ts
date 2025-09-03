/**
 * Interface for the central service registry
 * Provides service registration, discovery, and management capabilities
 */

import { EventEmitter } from 'events';

/**
 * Service status enumeration
 */
export enum ServiceStatus {
  REGISTERED = 'registered',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  UNHEALTHY = 'unhealthy'
}

/**
 * Service health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  status: ServiceStatus;
  message?: string;
  timestamp: Date;
  responseTime?: number;
  metadata?: Record<string, any>;
}

/**
 * Service metadata information
 */
export interface ServiceMetadata {
  name: string;
  version: string;
  description?: string;
  dependencies: string[];
  tags?: string[];
  endpoints?: string[];
  capabilities?: string[];
  configuration?: Record<string, any>;
}

/**
 * Service registration information
 */
export interface ServiceRegistration {
  id: string;
  name: string;
  metadata: ServiceMetadata;
  status: ServiceStatus;
  instance: any;
  healthCheck?: () => Promise<HealthCheckResult>;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  registeredAt: Date;
  lastHealthCheck?: HealthCheckResult;
  dependsOn: string[];
  dependents: Set<string>;
}

/**
 * Service discovery query options
 */
export interface ServiceQuery {
  name?: string;
  tag?: string;
  capability?: string;
  status?: ServiceStatus;
  version?: string;
  healthy?: boolean;
}

/**
 * Service lifecycle events
 */
export interface ServiceEvents {
  'service:registered': (registration: ServiceRegistration) => void;
  'service:deregistered': (serviceId: string) => void;
  'service:started': (serviceId: string) => void;
  'service:stopped': (serviceId: string) => void;
  'service:error': (serviceId: string, error: Error) => void;
  'service:health:changed': (serviceId: string, health: HealthCheckResult) => void;
  'registry:ready': () => void;
  'registry:shutdown': () => void;
}

/**
 * Service registry options
 */
export interface ServiceRegistryOptions {
  healthCheckInterval?: number;
  startupTimeout?: number;
  shutdownTimeout?: number;
  enableAutoHealthChecks?: boolean;
  enableDependencyResolution?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Central service registry interface
 */
export interface IServiceRegistry extends EventEmitter {
  /**
   * Register a service with the registry
   */
  register<T>(
    name: string,
    instance: T,
    metadata: Partial<ServiceMetadata>,
    options?: {
      healthCheck?: () => Promise<HealthCheckResult>;
      onStart?: () => Promise<void>;
      onStop?: () => Promise<void>;
      dependencies?: string[];
    }
  ): Promise<string>;

  /**
   * Deregister a service from the registry
   */
  deregister(serviceId: string): Promise<void>;

  /**
   * Get a service by ID
   */
  getService<T>(serviceId: string): T | null;

  /**
   * Get a service by name (returns first match)
   */
  getServiceByName<T>(name: string): T | null;

  /**
   * Get all services matching a name
   */
  getServicesByName<T>(name: string): T[];

  /**
   * Discover services using query criteria
   */
  discover<T>(query: ServiceQuery): T[];

  /**
   * Get service registration information
   */
  getRegistration(serviceId: string): ServiceRegistration | null;

  /**
   * Get all service registrations
   */
  getAllRegistrations(): ServiceRegistration[];

  /**
   * List all registered service names
   */
  listServices(): string[];

  /**
   * Check if a service is registered
   */
  hasService(serviceId: string): boolean;

  /**
   * Check if a service with name exists
   */
  hasServiceByName(name: string): boolean;

  /**
   * Start a specific service
   */
  startService(serviceId: string): Promise<void>;

  /**
   * Stop a specific service
   */
  stopService(serviceId: string): Promise<void>;

  /**
   * Start all registered services (respecting dependencies)
   */
  startAll(): Promise<void>;

  /**
   * Stop all registered services (reverse dependency order)
   */
  stopAll(): Promise<void>;

  /**
   * Restart a service
   */
  restartService(serviceId: string): Promise<void>;

  /**
   * Perform health check on a specific service
   */
  checkHealth(serviceId: string): Promise<HealthCheckResult>;

  /**
   * Perform health check on all services
   */
  checkAllHealth(): Promise<Map<string, HealthCheckResult>>;

  /**
   * Get health status of all services
   */
  getHealthSummary(): {
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
  };

  /**
   * Get services that depend on a given service
   */
  getDependents(serviceId: string): string[];

  /**
   * Get services that a given service depends on
   */
  getDependencies(serviceId: string): string[];

  /**
   * Resolve dependency order for service startup
   */
  resolveDependencyOrder(): string[];

  /**
   * Wait for a service to be available
   */
  waitForService(serviceId: string, timeout?: number): Promise<void>;

  /**
   * Wait for services to be available
   */
  waitForServices(serviceIds: string[], timeout?: number): Promise<void>;

  /**
   * Get registry statistics
   */
  getStats(): {
    totalServices: number;
    runningServices: number;
    stoppedServices: number;
    errorServices: number;
    uptime: number;
    lastHealthCheck?: Date;
  };

  /**
   * Enable/disable automatic health checks
   */
  setAutoHealthChecks(enabled: boolean): void;

  /**
   * Gracefully shutdown the registry
   */
  shutdown(): Promise<void>;

  /**
   * Check if the registry is ready
   */
  isReady(): boolean;

  /**
   * Get configuration for the registry
   */
  getOptions(): ServiceRegistryOptions;

  /**
   * Update registry options
   */
  updateOptions(options: Partial<ServiceRegistryOptions>): void;
}