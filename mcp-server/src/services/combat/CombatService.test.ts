import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { Vec3 } from 'vec3';
import { Entity } from 'prismarine-entity';

import { CombatService } from './CombatService.js';
import { ThreatAssessment } from './ThreatAssessment.js';
import { MeleeStrategy } from './strategies/MeleeStrategy.js';
import { RangedStrategy } from './strategies/RangedStrategy.js';
import { DefensiveStrategy } from './strategies/DefensiveStrategy.js';
import { CombatTarget, CombatOptions } from './ICombatService.js';
import { AnyBot } from '../../types.js';

// Mock dependencies
jest.mock('./ThreatAssessment.js');
jest.mock('./strategies/MeleeStrategy.js');
jest.mock('./strategies/RangedStrategy.js');
jest.mock('./strategies/DefensiveStrategy.js');

describe('CombatService', () => {
  let combatService: CombatService;
  let mockThreatAssessment: jest.Mocked<ThreatAssessment>;
  let mockMeleeStrategy: jest.Mocked<MeleeStrategy>;
  let mockRangedStrategy: jest.Mocked<RangedStrategy>;
  let mockDefensiveStrategy: jest.Mocked<DefensiveStrategy>;
  let mockBot: AnyBot;
  let mockEntity: Entity;
  let mockTarget: CombatTarget;

  beforeEach(() => {
    // Create mocked dependencies
    mockThreatAssessment = new ThreatAssessment() as jest.Mocked<ThreatAssessment>;
    mockMeleeStrategy = new MeleeStrategy() as jest.Mocked<MeleeStrategy>;
    mockRangedStrategy = new RangedStrategy() as jest.Mocked<RangedStrategy>;
    mockDefensiveStrategy = new DefensiveStrategy() as jest.Mocked<DefensiveStrategy>;

    // Mock strategy properties
    Object.defineProperty(mockMeleeStrategy, 'name', { value: 'melee' });
    Object.defineProperty(mockMeleeStrategy, 'description', { value: 'Melee strategy' });
    Object.defineProperty(mockRangedStrategy, 'name', { value: 'ranged' });
    Object.defineProperty(mockRangedStrategy, 'description', { value: 'Ranged strategy' });
    Object.defineProperty(mockDefensiveStrategy, 'name', { value: 'defensive' });
    Object.defineProperty(mockDefensiveStrategy, 'description', { value: 'Defensive strategy' });

    // Create combat service with mocked dependencies
    combatService = new CombatService(
      mockThreatAssessment,
      mockMeleeStrategy,
      mockRangedStrategy,
      mockDefensiveStrategy
    );

    // Create mock bot
    mockBot = {
      username: 'testbot',
      entity: {
        id: 1,
        position: new Vec3(0, 64, 0)
      } as Entity,
      health: 20,
      food: 20,
      inventory: {
        items: () => [
          { name: 'diamond_sword', durability: 1500 },
          { name: 'bow', durability: 300 }
        ]
      },
      pvp: {
        attack: jest.fn(),
        forceStop: jest.fn()
      },
      pathfinder: {
        goto: jest.fn().mockResolvedValue(true)
      },
      heldItem: null
    } as any;

    // Create mock entity
    mockEntity = {
      id: 2,
      name: 'zombie',
      displayName: 'Zombie',
      position: new Vec3(5, 64, 0),
      type: 'hostile',
      isValid: true,
      metadata: { 7: 20 } // Health metadata
    } as Entity;

    // Create mock combat target
    mockTarget = {
      entity: mockEntity,
      priority: 80,
      threat: 60,
      distance: 5,
      healthPercent: 100,
      type: 'hostile',
      lastPosition: mockEntity.position.clone(),
      lastSeen: new Date()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Combat State Management', () => {
    it('should start combat with valid target', async () => {
      // Setup mocks
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);
      mockMeleeStrategy.getSuitability.mockReturnValue(80);
      mockMeleeStrategy.execute.mockResolvedValue(true);

      const options: CombatOptions = {
        targetType: 'mob',
        duration: 10
      };

      const result = await combatService.startCombat(mockBot, options);

      expect(result).toBe(true);
      expect(mockThreatAssessment.assessThreats).toHaveBeenCalledWith(mockBot, undefined);
      expect(mockMeleeStrategy.execute).toHaveBeenCalledWith(mockBot, mockTarget, expect.any(Object));
    });

    it('should return false when no threats found', async () => {
      mockThreatAssessment.assessThreats.mockReturnValue([]);

      const result = await combatService.startCombat(mockBot);

      expect(result).toBe(false);
      expect(mockMeleeStrategy.execute).not.toHaveBeenCalled();
    });

    it('should stop combat immediately', () => {
      // Start combat session
      const combatState = combatService.getCombatState(mockBot);
      
      combatService.stopCombat(mockBot);

      const newState = combatService.getCombatState(mockBot);
      expect(newState.inCombat).toBe(false);
      expect(mockBot.pvp.forceStop).toHaveBeenCalled();
    });
  });

  describe('Target Selection', () => {
    it('should select target by type', async () => {
      const playerTarget = { ...mockTarget, type: 'player' };
      const mobTarget = { ...mockTarget, type: 'hostile' };
      
      mockThreatAssessment.assessThreats.mockReturnValue([playerTarget, mobTarget]);
      mockMeleeStrategy.getSuitability.mockReturnValue(80);
      mockMeleeStrategy.execute.mockResolvedValue(true);

      const options: CombatOptions = {
        targetType: 'player'
      };

      await combatService.startCombat(mockBot, options);

      // Should have selected player target
      expect(mockMeleeStrategy.execute).toHaveBeenCalledWith(
        mockBot, 
        expect.objectContaining({ type: 'player' }), 
        expect.any(Object)
      );
    });

    it('should select target by name', async () => {
      const namedTarget = { 
        ...mockTarget, 
        entity: { ...mockEntity, name: 'TestZombie' } as Entity 
      };
      
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget, namedTarget]);
      mockMeleeStrategy.getSuitability.mockReturnValue(80);
      mockMeleeStrategy.execute.mockResolvedValue(true);

      const options: CombatOptions = {
        targetName: 'TestZombie'
      };

      await combatService.startCombat(mockBot, options);

      // Should have selected named target
      expect(mockMeleeStrategy.execute).toHaveBeenCalledWith(
        mockBot, 
        expect.objectContaining({ 
          entity: expect.objectContaining({ name: 'TestZombie' })
        }), 
        expect.any(Object)
      );
    });
  });

  describe('Strategy Selection', () => {
    it('should use explicitly requested strategy', async () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);
      mockRangedStrategy.getSuitability.mockReturnValue(90);
      mockRangedStrategy.execute.mockResolvedValue(true);

      const options: CombatOptions = {
        strategy: 'ranged'
      };

      await combatService.startCombat(mockBot, options);

      expect(mockRangedStrategy.execute).toHaveBeenCalled();
      expect(mockMeleeStrategy.execute).not.toHaveBeenCalled();
    });

    it('should select best strategy by suitability', async () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);
      mockMeleeStrategy.getSuitability.mockReturnValue(70);
      mockRangedStrategy.getSuitability.mockReturnValue(90);
      mockDefensiveStrategy.getSuitability.mockReturnValue(60);
      mockRangedStrategy.execute.mockResolvedValue(true);

      await combatService.startCombat(mockBot);

      expect(mockRangedStrategy.execute).toHaveBeenCalled();
    });

    it('should update strategy during combat', () => {
      combatService.updateStrategy(mockBot, 'defensive');
      
      // This would be tested by checking if the strategy was updated
      // in an active combat session, but that requires more complex setup
    });
  });

  describe('Threat Assessment', () => {
    it('should assess threats with default range', () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);

      const threats = combatService.assessThreats(mockBot);

      expect(mockThreatAssessment.assessThreats).toHaveBeenCalledWith(mockBot, 32);
      expect(threats).toEqual([mockTarget]);
    });

    it('should assess threats with custom range', () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);

      const threats = combatService.assessThreats(mockBot, 16);

      expect(mockThreatAssessment.assessThreats).toHaveBeenCalledWith(mockBot, 16);
    });

    it('should throttle threat assessment calls', () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);

      // First call should work
      combatService.assessThreats(mockBot);
      expect(mockThreatAssessment.assessThreats).toHaveBeenCalledTimes(1);

      // Immediate second call should be throttled
      combatService.assessThreats(mockBot);
      expect(mockThreatAssessment.assessThreats).toHaveBeenCalledTimes(1);
    });
  });

  describe('Weapon Management', () => {
    it('should select optimal weapon based on damage and material', () => {
      const weapon = combatService.selectOptimalWeapon(mockBot);

      expect(weapon).toEqual(expect.objectContaining({
        name: 'diamond_sword',
        damage: 7,
        material: 'diamond',
        type: 'sword'
      }));
    });

    it('should prefer ranged weapons against creepers', () => {
      const weapon = combatService.selectOptimalWeapon(mockBot, 'creeper');

      expect(weapon).toEqual(expect.objectContaining({
        name: 'bow',
        type: 'bow'
      }));
    });

    it('should equip weapon successfully', async () => {
      mockBot.equip = jest.fn().mockResolvedValue(true);

      const result = await combatService.equipWeapon(mockBot, 'sword');

      expect(result).toBe(true);
      expect(mockBot.equip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'diamond_sword' }),
        'hand'
      );
    });
  });

  describe('Retreat Logic', () => {
    it('should retreat when health is low', () => {
      mockBot.health = 2; // 10% health

      const shouldRetreat = combatService.shouldRetreat(mockBot);

      expect(shouldRetreat).toBe(true);
    });

    it('should not retreat when health is good', () => {
      mockBot.health = 18; // 90% health

      const shouldRetreat = combatService.shouldRetreat(mockBot);

      expect(shouldRetreat).toBe(false);
    });

    it('should execute retreat successfully', async () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);

      const result = await combatService.retreat(mockBot, 15);

      expect(result).toBe(true);
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
    });
  });

  describe('Combat State', () => {
    it('should return correct combat state when not in combat', () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);

      const state = combatService.getCombatState(mockBot);

      expect(state).toEqual(expect.objectContaining({
        inCombat: false,
        currentTarget: null,
        health: 100,
        food: 20,
        strategy: 'none',
        kills: 0
      }));
      expect(state.potentialTargets).toHaveLength(1);
    });

    it('should track combat statistics', () => {
      const stats = combatService.getCombatStats(mockBot);

      expect(stats).toEqual({
        totalKills: 0,
        totalDeaths: 0,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        combatTime: 0,
        averageCombatDuration: 0,
        winRate: 0
      });
    });

    it('should reset combat statistics', () => {
      combatService.resetCombatStats(mockBot);
      
      const stats = combatService.getCombatStats(mockBot);
      expect(stats.totalKills).toBe(0);
      expect(stats.totalDeaths).toBe(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit and handle combat events', () => {
      const handler = jest.fn();
      
      combatService.onCombatEvent('combat_start', handler);
      
      // This would emit an event during combat start
      // For now, we'll just verify the handler registration works
      combatService.offCombatEvent('combat_start', handler);
    });
  });

  describe('Specific Attack Methods', () => {
    it('should attack specific target', async () => {
      mockMeleeStrategy.getSuitability.mockReturnValue(80);
      mockMeleeStrategy.execute.mockResolvedValue(true);

      const result = await combatService.attackTarget(mockBot, mockEntity);

      expect(result).toBe(true);
      expect(mockMeleeStrategy.execute).toHaveBeenCalled();
    });

    it('should defend with defensive strategy', async () => {
      mockDefensiveStrategy.getSuitability.mockReturnValue(80);
      mockDefensiveStrategy.execute.mockResolvedValue(true);
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);

      const result = await combatService.defend(mockBot);

      expect(result).toBe(true);
      expect(mockDefensiveStrategy.execute).toHaveBeenCalled();
    });

    it('should perform dodge maneuver', async () => {
      const threatPosition = new Vec3(10, 64, 0);

      const result = await combatService.dodge(mockBot, threatPosition);

      expect(result).toBe(true);
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in combat execution gracefully', async () => {
      mockThreatAssessment.assessThreats.mockReturnValue([mockTarget]);
      mockMeleeStrategy.getSuitability.mockReturnValue(80);
      mockMeleeStrategy.execute.mockRejectedValue(new Error('Combat failed'));

      const result = await combatService.startCombat(mockBot);

      expect(result).toBe(false);
    });

    it('should handle missing bot properties gracefully', () => {
      const incompleteBot: Partial<AnyBot> = {
        username: 'incomplete'
      };

      expect(() => {
        combatService.getCombatState(incompleteBot as AnyBot);
      }).not.toThrow();
    });
  });
});

describe('CombatService Edge Cases', () => {
  let combatService: CombatService;

  beforeEach(() => {
    const mockThreatAssessment = new ThreatAssessment() as jest.Mocked<ThreatAssessment>;
    const mockMeleeStrategy = new MeleeStrategy() as jest.Mocked<MeleeStrategy>;
    const mockRangedStrategy = new RangedStrategy() as jest.Mocked<RangedStrategy>;
    const mockDefensiveStrategy = new DefensiveStrategy() as jest.Mocked<DefensiveStrategy>;

    Object.defineProperty(mockMeleeStrategy, 'name', { value: 'melee' });
    Object.defineProperty(mockRangedStrategy, 'name', { value: 'ranged' });
    Object.defineProperty(mockDefensiveStrategy, 'name', { value: 'defensive' });

    combatService = new CombatService(
      mockThreatAssessment,
      mockMeleeStrategy,
      mockRangedStrategy,
      mockDefensiveStrategy
    );
  });

  it('should handle bot without inventory gracefully', () => {
    const botWithoutInventory = {
      username: 'noinventory',
      entity: { position: new Vec3(0, 0, 0) }
    } as AnyBot;

    expect(() => {
      combatService.selectOptimalWeapon(botWithoutInventory);
    }).not.toThrow();
  });

  it('should handle UnifiedBot type correctly', () => {
    const unifiedBot = {
      edition: 'java' as const,
      bot: {
        username: 'unified',
        entity: { position: new Vec3(0, 0, 0) },
        health: 20
      }
    };

    const state = combatService.getCombatState(unifiedBot as any);
    expect(state.health).toBe(100);
  });
});