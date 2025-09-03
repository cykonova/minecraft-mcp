# Skill Dependency Architecture

## Overview
This document outlines the dependency structure for skills, showing how complex behaviors are composed from simpler atomic operations using dependency injection.

## Skill Hierarchy

### Level 0: Core Services (Injected)
These are not skills but foundational services that skills depend on:
- `IPathfindingService` - Path calculation
- `IBlockService` - Block data and properties
- `IInventoryService` - Inventory management
- `IMovementService` - Movement execution
- `ICommunicationService` - Chat and commands

### Level 1: Atomic Skills
Single-purpose skills with no skill dependencies:

#### Movement Atoms
- `WalkSkill` - Basic walking
- `JumpSkill` - Jump action
- `SwimSkill` - Swimming movement
- `SprintSkill` - Sprint movement
- `SneakSkill` - Sneak movement

#### Interaction Atoms
- `BreakBlockSkill` - Break single block
- `PlaceBlockSkill` - Place single block
- `ClickSkill` - Click interaction
- `UseItemSkill` - Use held item
- `ActivateBlockSkill` - Activate block (doors, chests)

#### Inventory Atoms
- `PickupItemSkill` - Pick up dropped item
- `DropItemSkill` - Drop held item
- `EquipItemSkill` - Equip item to slot
- `SelectSlotSkill` - Select hotbar slot
- `TransferItemSkill` - Move item between slots

#### Combat Atoms
- `AttackSkill` - Single attack
- `BlockSkill` - Shield block
- `DodgeSkill` - Dodge movement

### Level 2: Basic Composite Skills
Skills that combine atomic skills:

#### Navigation Composites
```typescript
@injectable()
class NavigateToPositionSkill {
  constructor(
    @inject(WalkSkill) private walk: WalkSkill,
    @inject(JumpSkill) private jump: JumpSkill,
    @inject(IPathfindingService) private pathfinding: IPathfindingService
  ) {}
}
```

#### Mining Composites
```typescript
@injectable()
class MineBlockSkill {
  constructor(
    @inject(BreakBlockSkill) private breakBlock: BreakBlockSkill,
    @inject(PickupItemSkill) private pickup: PickupItemSkill,
    @inject(NavigateToPositionSkill) private navigate: NavigateToPositionSkill
  ) {}
}
```

#### Building Composites
```typescript
@injectable()
class BuildWallSkill {
  constructor(
    @inject(PlaceBlockSkill) private place: PlaceBlockSkill,
    @inject(SelectSlotSkill) private select: SelectSlotSkill,
    @inject(NavigateToPositionSkill) private navigate: NavigateToPositionSkill
  ) {}
}
```

### Level 3: Advanced Composite Skills
Complex behaviors combining multiple composites:

#### Follow Player
```typescript
@injectable()
class FollowPlayerSkill {
  constructor(
    @inject(NavigateToPositionSkill) private navigate: NavigateToPositionSkill,
    @inject(SwimSkill) private swim: SwimSkill,
    @inject(SprintSkill) private sprint: SprintSkill,
    @inject(ICommunicationService) private comm: ICommunicationService
  ) {}
}
```

#### Mine Ore Vein
```typescript
@injectable()
class MineOreVeinSkill {
  constructor(
    @inject(MineBlockSkill) private mine: MineBlockSkill,
    @inject(IBlockService) private blocks: IBlockService,
    @inject(IInventoryService) private inventory: IInventoryService
  ) {}
}
```

#### Build Structure
```typescript
@injectable()
class BuildStructureSkill {
  constructor(
    @inject(BuildWallSkill) private buildWall: BuildWallSkill,
    @inject(PlaceBlockSkill) private place: PlaceBlockSkill,
    @inject(NavigateToPositionSkill) private navigate: NavigateToPositionSkill,
    @inject(IInventoryService) private inventory: IInventoryService
  ) {}
}
```

### Level 4: Game-Specific Skills
Specialized skills for mini-games:

#### Guard Player
```typescript
@injectable()
class GuardPlayerSkill {
  constructor(
    @inject(FollowPlayerSkill) private follow: FollowPlayerSkill,
    @inject(AttackSkill) private attack: AttackSkill,
    @inject(BlockSkill) private block: BlockSkill,
    @inject(DodgeSkill) private dodge: DodgeSkill,
    @inject(ICombatService) private combat: ICombatService
  ) {}
}
```

## Dependency Graph Examples

### Simple Mining Task
```
MineOreSkill
├── NavigateToPositionSkill
│   ├── WalkSkill
│   ├── JumpSkill
│   └── IPathfindingService
├── MineBlockSkill
│   ├── BreakBlockSkill
│   └── PickupItemSkill
└── IInventoryService
```

### Complex Building Task
```
BuildHouseSkill
├── BuildStructureSkill
│   ├── BuildWallSkill
│   │   ├── PlaceBlockSkill
│   │   └── NavigateToPositionSkill
│   ├── PlaceBlockSkill
│   └── IInventoryService
├── CraftItemSkill
│   ├── OpenCraftingTableSkill
│   └── IInventoryService
└── GatherMaterialsSkill
    ├── MineOreVeinSkill
    └── ChopTreeSkill
```

## Dependency Injection Patterns

### Atomic Skill Pattern
```typescript
@skill({ type: 'atomic', name: 'breakBlock' })
@injectable()
export class BreakBlockSkill implements IAtomicSkill {
  constructor(
    @inject('IBlockService') private blocks: IBlockService
  ) {}
  
  async execute(context: SkillContext): Promise<SkillResult> {
    // Single responsibility: break one block
    const block = await this.blocks.getBlock(context.position);
    return await this.blocks.breakBlock(block);
  }
}
```

### Composite Skill Pattern
```typescript
@skill({ type: 'composite', name: 'mineOre' })
@injectable()
export class MineOreSkill implements ICompositeSkill {
  constructor(
    @inject(NavigateToPositionSkill) private navigate: NavigateToPositionSkill,
    @inject(BreakBlockSkill) private breakBlock: BreakBlockSkill,
    @inject(PickupItemSkill) private pickup: PickupItemSkill,
    @inject('IPathfindingService') private pathfinding: IPathfindingService
  ) {}
  
  async execute(context: SkillContext): Promise<SkillResult> {
    // Orchestrate multiple skills
    await this.navigate.execute({ position: context.orePosition });
    await this.breakBlock.execute({ position: context.orePosition });
    await this.pickup.execute({ radius: 3 });
    return { success: true, items: context.items };
  }
}
```

## Circular Dependency Prevention

### Detection Strategy
1. Build dependency graph at startup
2. Detect cycles using DFS
3. Throw error if cycle detected
4. Log dependency chain for debugging

### Prevention Patterns
1. **Use Interfaces**: Depend on interfaces, not concrete classes
2. **Lazy Loading**: Use factory pattern for circular deps
3. **Event-Based**: Use events instead of direct dependencies
4. **Service Locator**: For unavoidable circles (last resort)

## Testing Skill Dependencies

### Unit Testing Pattern
```typescript
describe('MineOreSkill', () => {
  let skill: MineOreSkill;
  let mockNavigate: jest.Mocked<NavigateToPositionSkill>;
  let mockBreak: jest.Mocked<BreakBlockSkill>;
  
  beforeEach(() => {
    mockNavigate = createMock<NavigateToPositionSkill>();
    mockBreak = createMock<BreakBlockSkill>();
    
    skill = new MineOreSkill(mockNavigate, mockBreak, ...);
  });
  
  it('should navigate before breaking', async () => {
    await skill.execute(context);
    expect(mockNavigate.execute).toHaveBeenCalledBefore(
      mockBreak.execute
    );
  });
});
```

### Integration Testing Pattern
```typescript
describe('Mining Integration', () => {
  let container: Container;
  
  beforeEach(() => {
    container = createTestContainer();
    // Register real implementations
  });
  
  it('should mine ore end-to-end', async () => {
    const skill = container.resolve(MineOreSkill);
    const result = await skill.execute(context);
    expect(result.success).toBe(true);
  });
});
```

## Skill Versioning

### Version Compatibility
```typescript
@skill({ 
  name: 'mineOre',
  version: '2.0.0',
  compatibleWith: ['1.x', '2.x']
})
export class MineOreSkillV2 { }
```

### Dependency Version Resolution
1. Skills declare version requirements
2. Container resolves compatible versions
3. Warn on version mismatch
4. Fail on incompatible versions

## Performance Considerations

### Dependency Resolution
- **Startup**: Resolve all dependencies once
- **Caching**: Cache resolved dependency graphs
- **Lazy**: Load skills only when needed
- **Pooling**: Reuse skill instances

### Memory Management
- **Singleton**: Services as singletons
- **Transient**: Skills as transient (stateless)
- **Scoped**: Per-bot skill instances
- **Cleanup**: Proper disposal of resources

## Best Practices

### Do's
1. **Small Skills**: Keep atomic skills focused
2. **Clear Dependencies**: Explicit injection
3. **Interface-Based**: Depend on interfaces
4. **Testable**: Mock dependencies easily
5. **Documented**: Clear dependency documentation

### Don'ts
1. **God Skills**: Avoid skills that do everything
2. **Hidden Dependencies**: No service locator pattern
3. **Circular Deps**: Prevent circular dependencies
4. **State in Skills**: Keep skills stateless
5. **Direct Instantiation**: Always use DI

## Future Enhancements

### Dynamic Skill Composition
- Runtime skill composition based on context
- AI-driven skill selection
- Learning optimal skill combinations

### Skill Marketplace
- Share skills between instances
- Download community skills
- Version management system

### Visual Skill Editor
- Drag-drop skill composition
- Visual dependency graph
- Real-time validation