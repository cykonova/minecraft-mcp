/**
 * Skill Base Classes Export Module
 * 
 * This module provides the complete skill hierarchy for the Minecraft MCP server:
 * 
 * - BaseSkill: Abstract base class with common functionality
 * - AtomicSkill: Enhanced atomic skill implementation  
 * - CompositeSkill: Enhanced composite skill implementation
 * - Legacy support through BaseAtomicSkill and BaseCompositeSkill
 */

// Core interfaces and types
export { ISkill, IJavaSkill, IBedrockSkill, IUniversalSkill, SkillMetadata, SkillModule, isContextBasedSkill, isLegacySkill, createSkillDefinition } from './ISkill.js';
export { IAtomicSkill, AtomicSkillConstructor } from './IAtomicSkill.js';
export { ICompositeSkill, SkillDependencyMap, ExecutionPlan, ExecutionStep, ExecutionProgress, CompositeSkillConstructor } from './ICompositeSkill.js';
export { ISkillContext, SkillContextFactory } from './ISkillContext.js';
export { SkillResult, SkillSuccess, SkillError, SkillResults } from './SkillResult.js';

// Base classes
export { BaseSkill, SkillLifecycleHooks, ExecutionMetrics, ValidationResult } from './BaseSkill.js';

// Legacy base classes (maintained for backward compatibility)
export { BaseAtomicSkill } from './IAtomicSkill.js';
export { BaseCompositeSkill } from './ICompositeSkill.js';

// Enhanced skill classes (recommended for new implementations)
export { AtomicSkill } from './AtomicSkill.js';
export { CompositeSkill } from './CompositeSkill.js';

// Atomic Skills
export * from './atomic/index.js';

// Composite Skills
export * from './composite/index.js';

// Dependency injection system
export * from './decorators/skillDependency.js';
export * from './dependency-system.js';

// Utility types for skill creation
export type SkillConstructor<T = any> = new (...args: any[]) => T;