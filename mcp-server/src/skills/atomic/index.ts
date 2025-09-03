/**
 * Atomic Skills Index
 * 
 * This file exports all atomic skills organized by category.
 * Atomic skills are the fundamental building blocks that perform single, well-defined operations.
 */

// Movement Skills
export { MoveToPosition } from './movement/MoveToPosition.js';
export { GoToPlayer } from './movement/GoToPlayer.js';
export { GoToLocation } from './movement/GoToLocation.js';

// Interaction Skills  
export { BreakBlock } from './interaction/BreakBlock.js';
export { PlaceBlock } from './interaction/PlaceBlock.js';

// Inventory Skills
export { PickupItem } from './inventory/PickupItem.js';
export { EquipItem } from './inventory/EquipItem.js';
export { EquipItemSkill } from './inventory/EquipItemSkill.js';
export { DropItem } from './inventory/DropItem.js';
export { EatFood } from './inventory/EatFood.js';
export { OpenInventory } from './inventory/OpenInventory.js';

// Combat Skills
export { AttackEntity } from './combat/AttackEntity.js';
export { AttackSomeone } from './combat/AttackSomeone.js';

// Communication Skills
export { SendMessage } from './communication/SendMessage.js';
export { SendChat } from './communication/SendChat.js';
export { ReadChat } from './communication/ReadChat.js';

// Basic Action Skills
export { Rest } from './basic/Rest.js';

/**
 * Registry of all atomic skills by category
 */
export const AtomicSkillRegistry = {
  movement: [
    'MoveToPosition',
    'GoToPlayer', 
    'GoToLocation',
  ],
  interaction: [
    'BreakBlock',
    'PlaceBlock',
  ],
  inventory: [
    'PickupItem',
    'EquipItem',
    'EquipItemSkill',
    'DropItem',
    'EatFood', 
    'OpenInventory',
  ],
  combat: [
    'AttackEntity',
    'AttackSomeone',
  ],
  communication: [
    'SendMessage',
    'SendChat',
    'ReadChat',
  ],
  basic: [
    'Rest',
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