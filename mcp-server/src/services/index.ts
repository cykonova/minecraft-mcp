/**
 * Main services index - exports all core services
 */

// Core service registry
export { ServiceRegistry } from './ServiceRegistry.js';
export * from './IServiceRegistry.js';

// Skills provider
export { SkillsProvider } from './SkillsProvider.js';

// Block services
export { BlockRegistry } from './BlockRegistry.js';
export { IBlockInteractionService } from './blocks/IBlockInteractionService.js';
export { BlockInteractionService } from './blocks/BlockInteractionService.js';

// Inventory services
export { IInventoryService } from './inventory/IInventoryService.js';
export { InventoryService } from './inventory/InventoryService.js';
export { IInventoryStrategy } from './inventory/strategies/IInventoryStrategy.js';
export { JavaInventoryStrategy } from './inventory/strategies/JavaInventoryStrategy.js';
export { BedrockInventoryStrategy } from './inventory/strategies/BedrockInventoryStrategy.js';

// Movement services
export { IMovementService } from './movement/IMovementService.js';
export { MovementService } from './movement/MovementService.js';

// Pathfinding services
export { IPathfindingService } from './pathfinding/IPathfindingService.js';
export { PathfindingService } from './pathfinding/PathfindingService.js';

// Combat services
export { ICombatService } from './combat/ICombatService.js';
export { CombatService } from './combat/CombatService.js';
export { ThreatAssessment } from './combat/ThreatAssessment.js';
export { ICombatStrategy } from './combat/strategies/ICombatStrategy.js';
export { MeleeStrategy } from './combat/strategies/MeleeStrategy.js';
export { RangedStrategy } from './combat/strategies/RangedStrategy.js';
export { DefensiveStrategy } from './combat/strategies/DefensiveStrategy.js';