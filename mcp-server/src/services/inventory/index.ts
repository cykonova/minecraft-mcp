/**
 * Inventory Service Module Exports
 */

export { IInventoryService } from './IInventoryService.js';
export { InventoryService } from './InventoryService.js';
export { IInventoryStrategy } from './strategies/IInventoryStrategy.js';
export { JavaInventoryStrategy } from './strategies/JavaInventoryStrategy.js';
export { BedrockInventoryStrategy } from './strategies/BedrockInventoryStrategy.js';

export type {
  InventoryItem,
  InventoryState,
  EquipmentDestination,
  FindItemOptions,
  MoveItemOptions,
  DropItemOptions,
  InventoryOptimizationOptions,
  InventoryOperationResult
} from './IInventoryService.js';