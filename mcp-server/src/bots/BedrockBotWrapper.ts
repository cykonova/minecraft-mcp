import { UnifiedBot } from './UnifiedBot.js';
import { createClient, Client } from 'bedrock-protocol';
import { Vec3 } from 'vec3';

export class BedrockBotWrapper implements UnifiedBot {
  username: string;
  edition: 'bedrock' = 'bedrock';
  _bot: Client;
  
  private position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private yaw: number = 0;
  private pitch: number = 0;
  private players: Map<string, any> = new Map();
  private entities: Map<number, any> = new Map();
  private chunks: Map<string, any> = new Map();
  private eventHandlers: Map<string, Set<Function>> = new Map();
  
  health?: number;
  food?: number;
  entity?: any;
  inventory?: any;
  
  constructor(client: Client, username: string) {
    this._bot = client;
    this.username = username;
    this.setupEventHandlers();
  }
  
  static async create(options: {
    host: string;
    port?: number;
    username: string;
    offline?: boolean;
    version?: string;
  }): Promise<BedrockBotWrapper> {
    return new Promise((resolve, reject) => {
      try {
        const client = createClient({
          host: options.host,
          port: options.port || 19132, // Default Bedrock port
          username: options.username,
          offline: options.offline !== false, // Default to offline mode
          version: (options.version || '1.20.80') as any, // Latest Bedrock version
          skipPing: true
        });
        
        const wrapper = new BedrockBotWrapper(client, options.username);
        
        // Wait for spawn event
        client.once('spawn', () => {
          console.error(`[BedrockBot] ${options.username} spawned successfully`);
          resolve(wrapper);
        });
        
        client.once('error', (error: Error) => {
          console.error(`[BedrockBot] ${options.username} connection error:`, error);
          reject(error);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  private setupEventHandlers(): void {
    // Track position updates
    this._bot.on('move_player', (packet: any) => {
      if (packet.runtime_id === this._bot.entityId) {
        this.position = {
          x: packet.position.x,
          y: packet.position.y,
          z: packet.position.z
        };
        this.entity = {
          position: new Vec3(this.position.x, this.position.y, this.position.z)
        };
        this.emit('move', this.position);
      }
    });
    
    // Track health updates
    this._bot.on('update_attributes', (packet: any) => {
      if (packet.runtime_entity_id === this._bot.entityId) {
        for (const attr of packet.attributes || []) {
          if (attr.name === 'minecraft:health') {
            this.health = attr.value;
            this.emit('health');
          } else if (attr.name === 'minecraft:player.hunger') {
            this.food = attr.value;
          }
        }
      }
    });
    
    // Track chat messages
    this._bot.on('text', (packet: any) => {
      if (packet.type === 'chat' || packet.type === 'raw') {
        const message = packet.message || packet.text || '';
        const sender = packet.source_name || 'Server';
        this.emit('chat', { 
          message, 
          username: sender,
          type: packet.type 
        });
      }
    });
    
    // Track player list
    this._bot.on('player_list', (packet: any) => {
      if (packet.records?.type === 'add') {
        for (const record of packet.records.records) {
          this.players.set(record.uuid, {
            username: record.username,
            uuid: record.uuid,
            entityId: record.entity_unique_id
          });
        }
      } else if (packet.records?.type === 'remove') {
        for (const record of packet.records.records) {
          this.players.delete(record.uuid);
        }
      }
    });
    
    // Track errors and disconnections
    this._bot.on('error', (error: Error) => {
      this.emit('error', error);
    });
    
    this._bot.on('disconnect', (packet: any) => {
      const reason = packet?.message || 'Unknown reason';
      this.emit('kicked', reason);
      this.emit('end', reason);
    });
  }
  
  getPosition(): { x: number; y: number; z: number } {
    return { ...this.position };
  }
  
  async lookAt(target: Vec3 | { x: number; y: number; z: number }): Promise<void> {
    // Calculate yaw and pitch to look at target
    const dx = target.x - this.position.x;
    const dy = target.y - (this.position.y + 1.62); // Eye height
    const dz = target.z - this.position.z;
    
    const distance = Math.sqrt(dx * dx + dz * dz);
    this.yaw = Math.atan2(-dx, dz) * (180 / Math.PI);
    this.pitch = Math.atan2(-dy, distance) * (180 / Math.PI);
    
    // Send rotation packet
    const packet = {
      runtime_id: this._bot.entityId || 0n,
      position: this.position,
      pitch: this.pitch,
      yaw: this.yaw,
      head_yaw: this.yaw,
      mode: 'normal',
      on_ground: true,
      runtime_entity_id: this._bot.entityId || 0n,
      tick: 0n
    };
    
    this._bot.queue('move_player', packet);
  }
  
  async chat(message: string): Promise<void> {
    if (!message || typeof message !== 'string') {
      throw new Error(`Invalid message: ${message}`);
    }
    
    // Check if it's a command
    if (message.startsWith('/')) {
      // Send as command
      const requestId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this._bot.queue('command_request', {
        command: message,
        origin: {
          type: 'player',
          uuid: '',
          request_id: requestId
        },
        internal: false,
        version: 1
      });
    } else {
      // Send as chat
      const packet = {
        type: 'chat',
        needs_translation: false,
        source_name: this.username,
        xuid: '',
        platform_chat_id: '',
        filtered_message: '',
        message
      };
      this._bot.queue('text', packet);
    }
  }
  
  whisper(username: string, message: string): void {
    this.chat(`/msg ${username} ${message}`);
  }
  
  blockAt(position: Vec3): any {
    // Simplified block lookup - would need chunk data parsing
    return {
      position,
      name: 'unknown',
      type: 0
    };
  }
  
  nearestEntity(filter?: (entity: any) => boolean): any {
    let nearest = null;
    let minDistance = Infinity;
    
    // Check players
    for (const player of this.players.values()) {
      if (filter && !filter(player)) continue;
      
      const distance = this.calculateDistance(player.position || this.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = player;
      }
    }
    
    // Check other entities
    for (const entity of this.entities.values()) {
      if (filter && !filter(entity)) continue;
      
      const distance = this.calculateDistance(entity.position || this.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = entity;
      }
    }
    
    return nearest;
  }
  
  private calculateDistance(targetPos: { x: number; y: number; z: number }): number {
    const dx = targetPos.x - this.position.x;
    const dy = targetPos.y - this.position.y;
    const dz = targetPos.z - this.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  async equip(item: any, destination: string): Promise<void> {
    // Bedrock inventory management is different
    // This would need proper implementation based on bedrock-protocol
    console.error(`[BedrockBot] equip not fully implemented for Bedrock`);
  }
  
  async tossStack(item: any, count?: number): Promise<void> {
    // Bedrock item dropping
    console.error(`[BedrockBot] tossStack not fully implemented for Bedrock`);
  }
  
  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(listener);
    
    // Also register on the underlying client for native events
    this._bot.on(event as any, listener);
  }
  
  once(event: string, listener: (...args: any[]) => void): void {
    const onceWrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }
  
  off(event: string, listener: (...args: any[]) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(listener);
    }
    this._bot.off(event as any, listener);
  }
  
  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[BedrockBot] Error in event handler for ${event}:`, error);
        }
      }
    }
  }
  
  quit(): void {
    this._bot.disconnect();
  }
  
  end(): void {
    this.quit();
  }
  
  // Bedrock-specific methods that might be needed
  async moveTo(position: { x: number; y: number; z: number }): Promise<void> {
    this.position = position;
    
    const packet = {
      runtime_id: this._bot.entityId || 0n,
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      pitch: this.pitch,
      yaw: this.yaw,
      head_yaw: this.yaw,
      mode: 'normal',
      on_ground: true,
      runtime_entity_id: this._bot.entityId || 0n,
      tick: 0n
    };
    
    this._bot.queue('move_player', packet);
  }
  
  getPlayers(): any[] {
    return Array.from(this.players.values());
  }
  
  getInventory(): any {
    // Simplified inventory - would need proper implementation
    return {
      slots: [],
      selected: 0
    };
  }
}