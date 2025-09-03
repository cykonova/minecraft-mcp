/**
 * Atomic Skills Index
 * 
 * This file exports all atomic skills organized by category.
 * Atomic skills are the fundamental building blocks that perform single, well-defined operations.
 */

// Movement Skills
export { MoveToPosition } from './movement/MoveToPosition.js';

// Interaction Skills  
export { BreakBlock } from './interaction/BreakBlock.js';
export { PlaceBlock } from './interaction/PlaceBlock.js';

// Inventory Skills
export { PickupItem } from './inventory/PickupItem.js';
export { EquipItem } from './inventory/EquipItem.js';

// Combat Skills
export { AttackEntity } from './combat/AttackEntity.js';

// Communication Skills
export { SendMessage } from './communication/SendMessage.js';

/**
 * Registry of all atomic skills by category
 */
export const AtomicSkillRegistry = {
  movement: [
    'MoveToPosition',
  ],
  interaction: [
    'BreakBlock',
    'PlaceBlock',
  ],
  inventory: [
    'PickupItem',
    'EquipItem',
  ],
  combat: [
    'AttackEntity',
  ],
  communication: [
    'SendMessage',
  ],
};

/**
 * Get all atomic skill class constructors
 * Note: Import individual skills as needed from their respective modules
 */

/**
 * Get atomic skill names by category
 */
export const getAtomicSkillNamesByCategory = (category: keyof typeof AtomicSkillRegistry): string[] => {
  return AtomicSkillRegistry[category] || [];
};