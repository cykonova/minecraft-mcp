# MovementService

The MovementService provides a unified, edition-agnostic interface for bot movement operations in Minecraft Java and Bedrock editions.

## Features

- **Edition Support**: Works with both Java Edition (via Mineflayer) and Bedrock Edition bots
- **Movement Types**: Walk, run, sprint, sneak, jump, swim, fly, and stop operations
- **Pathfinding Integration**: Uses PathfindingService for complex navigation (Java Edition)
- **Movement Validation**: Pre-validates movements and detects obstacles
- **Smooth Interpolation**: Provides smooth movement transitions
- **State Tracking**: Tracks movement state per bot instance
- **Error Recovery**: Includes recovery mechanisms for stuck states
- **Obstacle Detection**: Identifies and analyzes movement obstacles
- **Alternative Paths**: Finds alternative positions when direct movement fails

## Usage

### Basic Movement

```typescript
import { MovementService } from './services/movement/MovementService.js';
import { Vec3 } from 'vec3';

const movementService = container.resolve('MovementService');
const target = new Vec3(10, 64, 0);

// Basic movement
const result = await movementService.moveTo(bot, target, {
  speed: 1.0,
  timeout: 10000,
  tolerance: 1.0
});

if (result.success) {
  console.log(`Moved ${result.distanceTraveled} blocks in ${result.timeTaken}ms`);
}
```

### Advanced Movement Operations

```typescript
// Sprint to target
await movementService.sprint(bot, true);
await movementService.moveTo(bot, target, { sprint: true });

// Jump
const jumpResult = await movementService.jump(bot, 1.2);

// Swim (for water navigation)
const swimResult = await movementService.swim(bot, waterTarget);

// Follow a path
const path = [pos1, pos2, pos3];
const pathResult = await movementService.followPath(bot, path);

// Smooth interpolated movement
const smoothResult = await movementService.smoothMove(
  bot, startPos, endPos, 3000, 'ease-out'
);
```

### Movement Validation

```typescript
// Validate before moving
const validation = await movementService.validateMovement(bot, target);

if (!validation.canMove) {
  console.log('Errors:', validation.errors);
  
  // Try alternative position
  if (validation.alternative) {
    await movementService.moveTo(bot, validation.alternative);
  }
}
```

### Obstacle Detection

```typescript
const obstacles = await movementService.detectObstacles(bot, target);

obstacles.forEach(obstacle => {
  console.log(`${obstacle.type} obstacle: ${obstacle.name} at ${obstacle.position}`);
  console.log(`Severity: ${obstacle.severity}, Bypassable: ${obstacle.bypassable}`);
});
```

### State Management

```typescript
// Get current movement state
const state = movementService.getMovementState(bot);
console.log('Is moving:', state.isMoving);
console.log('Is sprinting:', state.isSprinting);

// Emergency stop
await movementService.emergencyStop(bot);

// Recovery from stuck state
const recovered = await movementService.recoverFromStuck(bot, 3);
```

## Configuration

The MovementService accepts various options for customizing movement behavior:

### MovementOptions

- `speed`: Movement speed modifier (0.1 to 2.0)
- `sprint`: Whether to sprint during movement  
- `sneak`: Whether to sneak during movement
- `allowJump`: Whether jumping is allowed
- `timeout`: Maximum time for movement (milliseconds)
- `tolerance`: Distance tolerance for reaching target
- `avoidObstacles`: Whether to avoid obstacles
- `smoothPath`: Whether to smooth movement path
- `validateMovement`: Whether to validate before moving

## Edition Differences

### Java Edition
- Uses Mineflayer pathfinding for complex navigation
- Direct control state management (sprint, sneak, jump)
- Advanced pathfinding with obstacle avoidance
- Full integration with mineflayer-pathfinder plugin

### Bedrock Edition  
- Direct position-based movement using protocol
- Smooth interpolation for natural movement
- Simplified obstacle detection
- Limited control state management

## Dependencies

- `PathfindingService`: For path calculation (primarily Java Edition)
- `BlockRegistry`: For block type information and obstacle analysis
- `Vec3`: For 3D position vectors
- `UnifiedBot`: Bot abstraction layer

## Error Handling

The service includes comprehensive error handling:

- **Movement Failures**: Returns detailed error information
- **Timeout Handling**: Respects timeout limits
- **Obstacle Recovery**: Attempts alternative routes
- **State Recovery**: Handles stuck or error states
- **Emergency Stops**: Immediate halt capabilities

## Testing

The service includes comprehensive unit tests covering:

- Basic movement operations
- Error conditions and edge cases
- Edition-specific behavior
- State management
- Validation and obstacle detection
- Recovery mechanisms

See `MovementService.test.ts` for detailed test coverage.

## Integration

The MovementService is registered as a singleton in the dependency injection container and can be injected into other services or skills:

```typescript
import { inject, injectable } from 'tsyringe';
import { IMovementService } from './services/movement/IMovementService.js';
import { TOKENS } from './config/tokens.js';

@injectable()
export class MySkill {
  constructor(
    @inject(TOKENS.MovementService) private movementService: IMovementService
  ) {}
  
  async executeMovement(bot: UnifiedBot, target: Vec3) {
    return await this.movementService.moveTo(bot, target);
  }
}
```