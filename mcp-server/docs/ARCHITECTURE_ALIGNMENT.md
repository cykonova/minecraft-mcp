# Architecture Alignment with SOLID Principles

## Current State Analysis

### Violations of SOLID Principles

#### Single Responsibility (SRP) Violations
- **Bot Wrappers**: Currently handle movement, inventory, combat, pathfinding, and more
- **Skills**: Mix execution logic with validation, parameter parsing, and error handling
- **SkillsProvider**: Loads skills, wraps them, validates editions, and manages cache

#### Open/Closed (OCP) Violations
- **Adding new editions**: Requires modifying existing bot classes
- **New skill types**: Need changes to SkillsProvider and SkillRegistry
- **Parameter changes**: Require updates across all skills

#### Liskov Substitution (LSP) Violations
- **Bot interfaces**: Java and Bedrock bots have different method signatures
- **Skill execution**: Different parameter expectations break substitutability

#### Interface Segregation (ISP) Violations
- **UnifiedBot interface**: Forces all implementations to have all methods
- **ISkill interface**: Includes properties not needed by all skills

#### Dependency Inversion (DIP) Violations
- **Direct instantiation**: Services created directly instead of injected
- **Concrete dependencies**: Skills depend on concrete bot implementations
- **Hard-coded paths**: File system paths embedded in code

## Target Architecture

### Applying SOLID Principles

#### Single Responsibility (SRP)
```typescript
// Each service has ONE clear responsibility
class PathfindingService {
  // ONLY handles path calculation
  calculatePath(from: Vec3, to: Vec3): Path
}

class MovementService {
  // ONLY handles movement execution
  executeMovement(path: Path): Promise<void>
}

class InventoryService {
  // ONLY handles inventory operations
  manageInventory(): void
}
```

#### Open/Closed (OCP)
```typescript
// Extend through interfaces, not modification
interface IEditionStrategy {
  execute(): void
}

class JavaStrategy implements IEditionStrategy { }
class BedrockStrategy implements IEditionStrategy { }
// Add new editions without modifying existing code
class CustomEditionStrategy implements IEditionStrategy { }
```

#### Liskov Substitution (LSP)
```typescript
// Any bot implementation works with any skill
interface IBot {
  readonly position: Vec3
  readonly health: number
}

// All implementations are interchangeable
class JavaBot implements IBot { }
class BedrockBot implements IBot { }
```

#### Interface Segregation (ISP)
```typescript
// Specific interfaces for specific needs
interface IMovable {
  move(position: Vec3): Promise<void>
}

interface ICombatant {
  attack(target: Entity): Promise<void>
}

interface IBuilder {
  placeBlock(position: Vec3, block: Block): Promise<void>
}

// Skills depend only on what they need
class MoveSkill {
  constructor(private bot: IMovable) { }
}
```

#### Dependency Inversion (DIP)
```typescript
// Depend on abstractions, inject dependencies
@injectable()
class MiningSkill {
  constructor(
    @inject('IPathfindingService') private pathfinding: IPathfindingService,
    @inject('IBlockService') private blocks: IBlockService,
    @inject('IInventoryService') private inventory: IInventoryService
  ) { }
}
```

## Refactoring Strategy

### Phase 1: Service Extraction (Weeks 1-2)
1. **Extract Services**
   - PathfindingService
   - MovementService
   - InventoryService
   - BlockInteractionService
   - CombatService

2. **Setup Dependency Injection**
   - Configure TSyringe container
   - Create service interfaces
   - Register implementations

### Phase 2: Skill Refactoring (Weeks 3-4)
1. **Atomic Skills**
   - Single responsibility each
   - Depend on service interfaces
   - No direct bot access

2. **Composite Skills**
   - Compose atomic skills
   - Use dependency injection
   - Orchestrate via services

### Phase 3: Bot Abstraction (Week 5)
1. **Thin Bot Wrappers**
   - Coordinate services only
   - Delegate all logic to services
   - Edition-agnostic interface

2. **Edition Strategies**
   - Implement edition-specific logic
   - Inject into services
   - Runtime selection

### Phase 4: Testing & Documentation (Week 6)
1. **Unit Tests**
   - Test services in isolation
   - Mock dependencies
   - Validate contracts

2. **Integration Tests**
   - Test service interactions
   - Validate skill execution
   - Performance benchmarks

## Dependency Injection Configuration

### Container Setup
```typescript
// src/config/container.ts
import { container } from 'tsyringe';

// Register services
container.register<IPathfindingService>('IPathfindingService', {
  useClass: PathfindingService
});

container.register<IInventoryService>('IInventoryService', {
  useClass: InventoryService  
});

// Register edition strategies
container.register<IEditionStrategy>('JavaStrategy', {
  useClass: JavaEditionStrategy
});

container.register<IEditionStrategy>('BedrockStrategy', {
  useClass: BedrockEditionStrategy
});
```

### Service Registration
```typescript
// Services self-register with decorators
@injectable()
@singleton()
export class PathfindingService implements IPathfindingService {
  // Implementation
}
```

### Skill Registration
```typescript
// Skills auto-register with decorators
@skill({
  name: 'mineOre',
  edition: 'universal',
  category: 'composite'
})
@injectable()
export class MineOreSkill implements ICompositeSkill {
  constructor(
    @inject('IPathfindingService') private pathfinding: IPathfindingService,
    @inject('MoveSkill') private move: MoveSkill,
    @inject('BreakBlockSkill') private breakBlock: BreakBlockSkill
  ) { }
}
```

## Code Organization

### New Directory Structure
```
src/
├── core/
│   ├── interfaces/      # All interfaces
│   ├── types/           # Type definitions
│   └── decorators/      # Custom decorators
├── services/
│   ├── pathfinding/
│   │   ├── IPathfindingService.ts
│   │   ├── PathfindingService.ts
│   │   └── PathfindingService.test.ts
│   ├── inventory/
│   ├── movement/
│   ├── combat/
│   └── blocks/
├── skills/
│   ├── atomic/          # Single-purpose skills
│   │   ├── movement/
│   │   ├── interaction/
│   │   └── combat/
│   └── composite/       # Multi-skill compositions
│       ├── mining/
│       ├── building/
│       └── games/
├── bots/
│   ├── interfaces/
│   ├── wrappers/        # Thin coordination layers
│   └── strategies/      # Edition-specific logic
└── config/
    ├── container.ts     # DI configuration
    └── tokens.ts        # DI tokens
```

## Migration Checklist

### Pre-Migration
- [ ] Document current functionality
- [ ] Create comprehensive test suite
- [ ] Setup performance benchmarks
- [ ] Backup existing code

### During Migration
- [ ] Maintain backward compatibility
- [ ] Run tests after each change
- [ ] Document breaking changes
- [ ] Update examples

### Post-Migration
- [ ] Validate all functionality
- [ ] Performance comparison
- [ ] Update documentation
- [ ] Train team on new architecture

## Benefits of Alignment

### Immediate Benefits
- **Testability**: Services can be tested in isolation
- **Maintainability**: Clear separation of concerns
- **Flexibility**: Easy to swap implementations
- **Type Safety**: Full TypeScript benefits

### Long-term Benefits
- **Extensibility**: New features without core changes
- **Reusability**: Services used across skills
- **Performance**: Optimized service implementations
- **Community**: Easier for contributors to understand

## Success Metrics

### Code Quality Metrics
- **Cyclomatic Complexity**: < 10 per method
- **Coupling**: Low coupling between modules
- **Cohesion**: High cohesion within modules
- **Test Coverage**: > 80% for services

### Architecture Metrics
- **Dependencies**: All injected, none hardcoded
- **Interfaces**: 100% interface-based programming
- **Responsibilities**: Single responsibility per class
- **Abstraction**: No concrete dependencies

### Performance Metrics
- **Memory**: < 10% overhead from DI
- **Startup**: < 500ms container initialization
- **Runtime**: < 5% performance impact
- **Scalability**: Linear scaling with bot count