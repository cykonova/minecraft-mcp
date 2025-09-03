/**
 * Demonstration of MovementService usage
 * This file shows how to use the MovementService with both Java and Bedrock bots
 */

import { Vec3 } from 'vec3';
import { MovementService } from './MovementService.js';
import { PathfindingService } from '../pathfinding/PathfindingService.js';
import { BlockRegistry } from '../BlockRegistry.js';
import { UnifiedBot } from '../../bots/UnifiedBot.js';
import { MovementType, MovementOptions } from './IMovementService.js';

/**
 * Example usage of MovementService with a Java bot
 */
async function demonstrateJavaBotMovement(bot: UnifiedBot) {
  console.log('=== Java Bot Movement Demonstration ===');
  
  // Create MovementService with dependencies
  const blockRegistry = new BlockRegistry('1.20');
  const pathfindingService = new PathfindingService(blockRegistry);
  const movementService = new MovementService(pathfindingService, blockRegistry);

  try {
    // Example 1: Basic movement
    console.log('\n1. Basic Movement:');
    const target1 = new Vec3(10, 64, 0);
    const result1 = await movementService.moveTo(bot, target1, {
      speed: 1.0,
      timeout: 10000
    });
    
    if (result1.success) {
      console.log(`✓ Successfully moved to ${target1} in ${result1.timeTaken}ms`);
      console.log(`  Distance traveled: ${result1.distanceTraveled.toFixed(2)} blocks`);
    } else {
      console.log(`✗ Movement failed: ${result1.error}`);
    }

    // Example 2: Sprint movement  
    console.log('\n2. Sprint Movement:');
    await movementService.sprint(bot, true);
    const target2 = new Vec3(20, 64, 0);
    const result2 = await movementService.moveTo(bot, target2, {
      sprint: true,
      timeout: 8000
    });
    
    if (result2.success) {
      console.log(`✓ Sprint completed to ${target2}`);
    }
    await movementService.sprint(bot, false);

    // Example 3: Jumping
    console.log('\n3. Jumping:');
    const jumpResult = await movementService.jump(bot);
    if (jumpResult.success) {
      console.log(`✓ Jump completed, height gained: ${jumpResult.distanceTraveled.toFixed(2)}`);
    }

    // Example 4: Path following
    console.log('\n4. Path Following:');
    const path = [
      new Vec3(25, 64, 0),
      new Vec3(25, 64, 5),
      new Vec3(20, 64, 5),
      new Vec3(20, 64, 0)
    ];
    
    const pathResult = await movementService.followPath(bot, path, {
      speed: 1.2,
      smoothPath: true
    });
    
    if (pathResult.success) {
      console.log(`✓ Path completed, total distance: ${pathResult.distanceTraveled.toFixed(2)} blocks`);
    }

    // Example 5: Movement validation
    console.log('\n5. Movement Validation:');
    const farTarget = new Vec3(1000, 64, 0);
    const validation = await movementService.validateMovement(bot, farTarget);
    
    console.log(`Can move to far target: ${validation.canMove}`);
    if (validation.warnings.length > 0) {
      console.log(`Warnings: ${validation.warnings.join(', ')}`);
    }
    if (validation.errors.length > 0) {
      console.log(`Errors: ${validation.errors.join(', ')}`);
    }

    // Example 6: Obstacle detection
    console.log('\n6. Obstacle Detection:');
    const obstacleTarget = new Vec3(30, 64, 0);
    const obstacles = await movementService.detectObstacles(bot, obstacleTarget);
    console.log(`Found ${obstacles.length} obstacles on path to ${obstacleTarget}`);
    
    obstacles.forEach((obstacle, i) => {
      console.log(`  ${i + 1}. ${obstacle.name} at ${obstacle.position} (severity: ${obstacle.severity})`);
    });

  } catch (error) {
    console.error('Movement demonstration failed:', error);
  }
}

/**
 * Example usage of MovementService with a Bedrock bot
 */
async function demonstrateBedrockBotMovement(bot: UnifiedBot) {
  console.log('\n=== Bedrock Bot Movement Demonstration ===');
  
  const blockRegistry = new BlockRegistry('1.20');
  const pathfindingService = new PathfindingService(blockRegistry);
  const movementService = new MovementService(pathfindingService, blockRegistry);

  try {
    // Example 1: Smooth movement
    console.log('\n1. Smooth Movement:');
    const start = new Vec3(0, 64, 0);
    const target = new Vec3(15, 64, 0);
    
    const smoothResult = await movementService.smoothMove(bot, start, target, 3000, 'ease-out');
    if (smoothResult.success) {
      console.log(`✓ Smooth movement completed in ${smoothResult.timeTaken}ms`);
    }

    // Example 2: Swimming (if in water)
    console.log('\n2. Swimming Movement:');
    const waterTarget = new Vec3(10, 62, 0);
    const swimResult = await movementService.swim(bot, waterTarget, {
      speed: 0.8,
      timeout: 15000
    });
    
    if (swimResult.success) {
      console.log(`✓ Swimming completed to ${waterTarget}`);
    } else {
      console.log(`Swimming not applicable or failed: ${swimResult.error}`);
    }

    // Example 3: Alternative position finding
    console.log('\n3. Finding Alternative Position:');
    const blockedTarget = new Vec3(100, 100, 100); // Likely blocked
    const alternative = await movementService.findAlternativePosition(bot, blockedTarget, 5);
    
    if (alternative) {
      console.log(`✓ Found alternative position: ${alternative}`);
      const altResult = await movementService.moveTo(bot, alternative);
      if (altResult.success) {
        console.log(`✓ Successfully moved to alternative position`);
      }
    } else {
      console.log('No alternative position found');
    }

    // Example 4: Speed optimization
    console.log('\n4. Speed Optimization:');
    const terrainTypes = ['normal', 'water', 'ice', 'soul_sand'];
    
    terrainTypes.forEach(terrain => {
      const speed = movementService.calculateOptimalSpeed(bot, new Vec3(50, 64, 0), terrain);
      console.log(`Optimal speed for ${terrain}: ${speed.toFixed(2)}x`);
    });

    // Example 5: Emergency stop
    console.log('\n5. Emergency Stop:');
    setTimeout(async () => {
      const stopResult = await movementService.emergencyStop(bot);
      console.log(`Emergency stop result: ${stopResult ? 'Success' : 'Failed'}`);
    }, 1000);

  } catch (error) {
    console.error('Bedrock movement demonstration failed:', error);
  }
}

/**
 * Demonstrate movement state tracking
 */
function demonstrateStateTracking(bot: UnifiedBot, movementService: MovementService) {
  console.log('\n=== Movement State Tracking ===');
  
  // Get initial state
  let state = movementService.getMovementState(bot);
  console.log('Initial state:', JSON.stringify(state, null, 2));
  
  // Simulate state changes
  movementService.sprint(bot, true).then(() => {
    state = movementService.getMovementState(bot);
    console.log('After starting sprint:', JSON.stringify(state, null, 2));
    
    return movementService.sneak(bot, true);
  }).then(() => {
    state = movementService.getMovementState(bot);
    console.log('After starting sneak:', JSON.stringify(state, null, 2));
    
    return movementService.stop(bot);
  }).then(() => {
    state = movementService.getMovementState(bot);
    console.log('After stopping:', JSON.stringify(state, null, 2));
  }).catch(console.error);
}

/**
 * Demonstrate reachability testing
 */
async function demonstrateReachabilityTesting(bot: UnifiedBot, movementService: MovementService) {
  console.log('\n=== Reachability Testing ===');
  
  const testPositions = [
    new Vec3(5, 64, 0),    // Close
    new Vec3(50, 64, 0),   // Medium distance
    new Vec3(500, 64, 0),  // Far
    new Vec3(10, 200, 0),  // High up
    new Vec3(10, 0, 0)     // Very low
  ];
  
  for (const pos of testPositions) {
    try {
      const canReach = await movementService.canReach(bot, pos, { 
        timeout: 5000,
        allowJump: true 
      });
      console.log(`Position ${pos}: ${canReach ? '✓ Reachable' : '✗ Not reachable'}`);
    } catch (error) {
      console.log(`Position ${pos}: Error checking reachability`);
    }
  }
}

// Export demonstration functions for use in other contexts
export {
  demonstrateJavaBotMovement,
  demonstrateBedrockBotMovement,
  demonstrateStateTracking,
  demonstrateReachabilityTesting
};

// Example of how to run demonstrations (commented out to prevent auto-execution)
/*
async function runDemonstrations() {
  // These would need actual bot instances
  const javaBot: UnifiedBot = {} as any; // Your Java bot instance
  const bedrockBot: UnifiedBot = {} as any; // Your Bedrock bot instance
  
  await demonstrateJavaBotMovement(javaBot);
  await demonstrateBedrockBotMovement(bedrockBot);
  
  const movementService = new MovementService(
    new PathfindingService(new BlockRegistry('1.20')),
    new BlockRegistry('1.20')
  );
  
  demonstrateStateTracking(javaBot, movementService);
  await demonstrateReachabilityTesting(javaBot, movementService);
}

// Uncomment to run:
// runDemonstrations().catch(console.error);
*/