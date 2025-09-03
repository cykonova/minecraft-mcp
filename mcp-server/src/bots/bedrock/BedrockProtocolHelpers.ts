import { Vec3 } from 'vec3';

export class BedrockProtocolHelpers {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  async moveStep(from: Vec3, to: Vec3, onGround: boolean = true): Promise<void> {
    const steps = 5;
    const deltaX = (to.x - from.x) / steps;
    const deltaY = (to.y - from.y) / steps;
    const deltaZ = (to.z - from.z) / steps;

    for (let i = 1; i <= steps; i++) {
      const intermediatePos = new Vec3(
        from.x + deltaX * i,
        from.y + deltaY * i,
        from.z + deltaZ * i
      );

      this.client.queue('move_player', {
        runtime_entity_id: this.client.entityId,
        position: { 
          x: intermediatePos.x, 
          y: intermediatePos.y + 1.62, 
          z: intermediatePos.z 
        },
        pitch: 0,
        yaw: this.calculateYaw(from, to),
        head_yaw: this.calculateYaw(from, to),
        mode: 'normal',
        on_ground: onGround,
        riding_runtime_entity_id: 0,
        tick: BigInt(0)
      });

      await this.delay(50);
    }
  }

  async clickInventorySlot(
    windowId: number, 
    slot: number, 
    button: number = 0
  ): Promise<void> {
    this.client.queue('inventory_transaction', {
      transaction: {
        transaction_type: 'normal',
        actions: [{
          source_type: 'container',
          inventory_id: windowId,
          slot: slot,
          old_item: { network_id: 0 },
          new_item: { network_id: 0 }
        }],
        transaction_data: {}
      }
    });

    await this.delay(100);
  }

  async startBreakBlock(position: Vec3): Promise<void> {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'start_break',
      position: { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) },
      face: 1
    });
  }

  async stopBreakBlock(position: Vec3): Promise<void> {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'stop_break',
      position: { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) },
      face: 1
    });
  }

  async placeBlock(position: Vec3, face: number = 1, hand: 'main' | 'off' = 'main'): Promise<void> {
    const blockPos = {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z)
    };

    this.client.queue('inventory_transaction', {
      transaction: {
        transaction_type: 'use_item',
        actions: [],
        transaction_data: {
          action_type: 1,
          block_position: blockPos,
          face: face,
          hotbar_slot: this.client.selected_slot ?? 0,
          held_item: { network_id: 0 },
          player_position: this.client.position,
          click_position: { x: 0.5, y: 0.5, z: 0.5 }
        }
      }
    });

    await this.delay(100);
  }

  async useItem(hand: 'main' | 'off' = 'main'): Promise<void> {
    this.client.queue('inventory_transaction', {
      transaction: {
        transaction_type: 'use_item',
        actions: [],
        transaction_data: {
          action_type: 0,
          hotbar_slot: this.client.selected_slot ?? 0,
          held_item: { network_id: 0 },
          player_position: this.client.position
        }
      }
    });

    await this.delay(100);
  }

  async dropItem(count: number = 1): Promise<void> {
    this.client.queue('inventory_transaction', {
      transaction: {
        transaction_type: 'normal',
        actions: [{
          source_type: 'world_interaction',
          inventory_id: 0,
          slot: 0,
          old_item: { network_id: 0 },
          new_item: { network_id: 0 }
        }],
        transaction_data: {}
      }
    });

    await this.delay(100);
  }

  async selectHotbarSlot(slot: number): Promise<void> {
    if (slot < 0 || slot > 8) {
      throw new Error('Hotbar slot must be between 0 and 8');
    }

    this.client.queue('mob_equipment', {
      runtime_entity_id: this.client.entityId,
      selected_slot: slot,
      slot: slot,
      item: { network_id: 0 }
    });

    this.client.selected_slot = slot;
    await this.delay(50);
  }

  async interactWithEntity(entityId: bigint, action: 'interact' | 'attack' = 'interact'): Promise<void> {
    this.client.queue('interact', {
      target_runtime_entity_id: entityId,
      action_type: action === 'attack' ? 'attack' : 'interact',
      position: this.client.position
    });

    await this.delay(100);
  }

  async openContainer(position: Vec3): Promise<void> {
    const blockPos = {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z)
    };

    this.client.queue('inventory_transaction', {
      transaction: {
        transaction_type: 'use_item',
        actions: [],
        transaction_data: {
          action_type: 0,
          block_position: blockPos,
          face: 1,
          hotbar_slot: this.client.selected_slot ?? 0,
          held_item: { network_id: 0 },
          player_position: this.client.position,
          click_position: { x: 0.5, y: 0.5, z: 0.5 }
        }
      }
    });

    await this.delay(200);
  }

  async closeContainer(windowId: number): Promise<void> {
    this.client.queue('container_close', {
      window_id: windowId,
      server: false
    });

    await this.delay(100);
  }

  async sendChat(message: string): Promise<void> {
    this.client.queue('text', {
      type: 'chat',
      needs_translation: false,
      source_name: this.client.username,
      message: message,
      parameters: [],
      xuid: '',
      platform_chat_id: ''
    });
  }

  async startSneaking(): Promise<void> {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'start_sneak'
    });
  }

  async stopSneaking(): Promise<void> {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'stop_sneak'
    });
  }

  async startSprinting(): Promise<void> {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'start_sprint'
    });
  }

  async stopSprinting(): Promise<void> {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'stop_sprint'
    });
  }

  async jump(): Promise<void> {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'jump'
    });

    await this.delay(50);
  }

  private calculateYaw(from: Vec3, to: Vec3): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const yaw = Math.atan2(-dx, dz);
    return (yaw * 180) / Math.PI;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendInventoryAction(
    sourceType: string,
    windowId: number,
    slot: number,
    item: any
  ): Promise<void> {
    this.client.queue('inventory_transaction', {
      transaction: {
        transaction_type: 'normal',
        actions: [{
          source_type: sourceType,
          inventory_id: windowId,
          slot: slot,
          old_item: item || { network_id: 0 },
          new_item: { network_id: 0 }
        }],
        transaction_data: {}
      }
    });

    await this.delay(100);
  }

  async swapItems(
    fromWindowId: number,
    fromSlot: number,
    toWindowId: number,
    toSlot: number,
    fromItem: any,
    toItem: any
  ): Promise<void> {
    this.client.queue('inventory_transaction', {
      transaction: {
        transaction_type: 'normal',
        actions: [
          {
            source_type: 'container',
            inventory_id: fromWindowId,
            slot: fromSlot,
            old_item: fromItem || { network_id: 0 },
            new_item: toItem || { network_id: 0 }
          },
          {
            source_type: 'container',
            inventory_id: toWindowId,
            slot: toSlot,
            old_item: toItem || { network_id: 0 },
            new_item: fromItem || { network_id: 0 }
          }
        ],
        transaction_data: {}
      }
    });

    await this.delay(100);
  }
}