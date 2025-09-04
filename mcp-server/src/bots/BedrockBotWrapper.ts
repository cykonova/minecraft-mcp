import { injectable } from 'tsyringe';
import { UnifiedBot } from './UnifiedBot.js';
import { createClient, Client } from './bedrock/patchedBedrockProtocol.js';
import { Vec3 } from 'vec3';
import { BlockRegistry } from '../services/BlockRegistry.js';
import { IPathfindingService } from '../services/pathfinding/IPathfindingService.js';
import { IMovementService } from '../services/movement/IMovementService.js';
import { IInventoryService } from '../services/inventory/IInventoryService.js';
import { IBlockInteractionService } from '../services/blocks/IBlockInteractionService.js';
import { ICombatService } from '../services/combat/ICombatService.js';
import { PathfindingService } from '../services/pathfinding/PathfindingService.js';
import { BedrockProtocolHelpers } from './bedrock/BedrockProtocolHelpers.js';
import { getContainer } from '../config/container.js';
import { TOKENS } from '../config/tokens.js';

interface ChatMessage {
  timestamp: number;
  username: string;
  message: string;
  type: string;
}

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
  private chatHistory: ChatMessage[] = [];
  private blockRegistry: BlockRegistry;
  private pathfindingService: IPathfindingService;
  private movementService?: IMovementService;
  private inventoryService?: IInventoryService;
  private blockInteractionService?: IBlockInteractionService;
  private combatService?: ICombatService;
  private protocolHelpers: BedrockProtocolHelpers;
  private inventoryData: Map<number, any> = new Map();
  private selectedSlot: number = 0;
  
  health?: number;
  food?: number;
  entity?: any;
  inventory?: any;
  
  constructor(
    client: Client, 
    username: string, 
    pathfindingService?: IPathfindingService,
    movementService?: IMovementService,
    inventoryService?: IInventoryService,
    blockInteractionService?: IBlockInteractionService,
    combatService?: ICombatService
  ) {
    this._bot = client;
    this.username = username;
    this.blockRegistry = new BlockRegistry('1.20');
    
    // Use provided service or get from container, fallback to direct instantiation
    if (pathfindingService) {
      this.pathfindingService = pathfindingService;
    } else {
      try {
        const container = getContainer();
        this.pathfindingService = container.resolve(TOKENS.PathfindingService);
        console.error(`[BedrockBotWrapper] Using injected PathfindingService for ${username}`);
      } catch (error) {
        // Fallback to direct instantiation if container isn't configured
        console.warn(`[BedrockBotWrapper] Container not available, creating PathfindingService directly for ${username}:`, error);
        this.pathfindingService = new PathfindingService(this.blockRegistry);
      }
    }

    // Set other services
    this.movementService = movementService;
    this.inventoryService = inventoryService;
    this.blockInteractionService = blockInteractionService;
    this.combatService = combatService;
    
    this.protocolHelpers = new BedrockProtocolHelpers(client);
    this.setupEventHandlers();
  }
  
  static async create(options: {
    host: string;
    port?: number;
    username: string;
    offline?: boolean;
    version?: string;
  }, services?: {
    pathfindingService?: IPathfindingService;
    movementService?: IMovementService;
    inventoryService?: IInventoryService;
    blockInteractionService?: IBlockInteractionService;
    combatService?: ICombatService;
  }): Promise<BedrockBotWrapper> {
    return new Promise((resolve, reject) => {
      try {
        // TODO: Fix Bedrock server connection issue
        // Current issue: Server at perseus.local:19132 disconnects immediately
        // Server is running Minecraft Bedrock 1.21.102.1 in Docker container
        // 
        // Investigation findings:
        // 1. The working gateway at /Users/jack/Source/minecraft_server/gateway uses:
        //    - A patched client that adds support for 1.21.102.1 by mapping it to protocol 819
        //    - Falls back to version 1.21.100 after patching
        //    - Uses CommonJS require() to patch before importing
        //    - Sets skipPing: true
        // 
        // 2. Our attempt to patch failed because:
        //    - We're using ES modules, not CommonJS
        //    - bedrock-protocol objects are frozen/non-extensible in ES module context
        //    - Can't modify supportedVersions after import
        // 
        // 3. Server logs show: "requires Xbox Live authentication"
        //    - May need to handle auth differently for this server
        // 
        // 4. Current workaround: Using version 1.21.100 (closest supported)
        //    - Still results in "Server requested disconnect" error
        // 
        // Possible solutions to explore:
        // - Create a CommonJS shim to patch before ES module loads
        // - Fork bedrock-protocol to add 1.21.102.1 support
        // - Investigate Xbox Live auth requirements
        // - Check if server has specific connection requirements
        
        const client = createClient({
          host: options.host,
          port: options.port || 19132, // Default Bedrock port
          username: options.username,
          offline: options.offline !== false, // Default to offline mode
          version: (options.version || '1.21.102.1') as any, // Now supported via patch
          skipPing: true // Skip server ping to avoid version check issues
        });
        
        const wrapper = new BedrockBotWrapper(
          client, 
          options.username,
          services?.pathfindingService,
          services?.movementService,
          services?.inventoryService,
          services?.blockInteractionService,
          services?.combatService
        );
        
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
    // Track inventory updates
    this._bot.on('inventory_slot', (packet: any) => {
      if (packet.window_id === 0) { // Player inventory
        this.inventoryData.set(packet.slot, packet.item);
        this.updateInventory();
      }
    });
    
    // Track held item changes
    this._bot.on('mob_equipment', (packet: any) => {
      if (packet.runtime_entity_id === this._bot.entityId) {
        this.selectedSlot = packet.selected_slot;
      }
    });
    
    // Track chunk data
    this._bot.on('level_chunk', (packet: any) => {
      const chunkKey = `${packet.x},${packet.z}`;
      this.chunks.set(chunkKey, packet);
    });
    
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
      if (packet.type === 'chat' || packet.type === 'raw' || packet.type === 'translation') {
        const message = packet.message || packet.text || '';
        const sender = packet.source_name || 'Server';
        
        // Store in chat history
        this.chatHistory.push({
          timestamp: Date.now(),
          username: sender,
          message: message,
          type: packet.type
        });
        
        // Keep only last 100 messages
        if (this.chatHistory.length > 100) {
          this.chatHistory.shift();
        }
        
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
  
  blockAt(position: Vec3 | { x: number; y: number; z: number }): any {
    const pos = position instanceof Vec3 ? position : new Vec3(position.x, position.y, position.z);
    const chunkX = Math.floor(pos.x / 16);
    const chunkZ = Math.floor(pos.z / 16);
    const chunkKey = `${chunkX},${chunkZ}`;
    
    const chunkData = this.chunks.get(chunkKey);
    if (!chunkData) {
      return {
        position: pos,
        name: 'air',
        type: 0
      };
    }
    
    // For now, return a simplified block representation
    // Full implementation would parse chunk data
    return {
      position: pos,
      name: 'unknown',
      type: 1
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
    if (!item) return;
    
    // Delegate to inventory service if available
    if (this.inventoryService) {
      const result = await this.inventoryService.equipItem(this, item.name || `item_${item.network_id}`, destination as any);
      if (!result.success) {
        throw new Error(result.message);
      }
      return;
    }

    // Fallback to direct protocol implementation
    // Find the item in inventory
    let itemSlot = -1;
    for (const [slot, invItem] of this.inventoryData.entries()) {
      if (invItem && invItem.network_id === item.network_id) {
        itemSlot = slot;
        break;
      }
    }
    
    if (itemSlot === -1) {
      throw new Error(`Item ${item.name || item.network_id} not found in inventory`);
    }
    
    // Map destination to target slot
    let targetSlot: number;
    switch (destination) {
      case 'hand':
        targetSlot = this.selectedSlot; // Hotbar slot
        break;
      case 'head':
        targetSlot = 5; // Helmet slot
        break;
      case 'torso':
        targetSlot = 6; // Chestplate slot
        break;
      case 'legs':
        targetSlot = 7; // Leggings slot
        break;
      case 'feet':
        targetSlot = 8; // Boots slot
        break;
      case 'off-hand':
        targetSlot = 45; // Offhand slot
        break;
      default:
        throw new Error(`Unknown destination: ${destination}`);
    }
    
    // Swap items using protocol helpers
    await this.protocolHelpers.swapItems(
      0, itemSlot, // From player inventory
      0, targetSlot, // To equipment slot
      item,
      this.inventoryData.get(targetSlot)
    );
  }
  
  async tossStack(item: any, count?: number): Promise<void> {
    if (!item) return;
    
    // Delegate to inventory service if available
    if (this.inventoryService) {
      const result = await this.inventoryService.dropItem(this, {
        name: item.name || `item_${item.network_id}`,
        count: count || item.count || 1
      });
      if (!result.success) {
        throw new Error(result.message);
      }
      return;
    }

    // Fallback to direct protocol implementation
    // Find the item in inventory
    let itemSlot = -1;
    for (const [slot, invItem] of this.inventoryData.entries()) {
      if (invItem && invItem.network_id === item.network_id) {
        itemSlot = slot;
        break;
      }
    }
    
    if (itemSlot === -1) {
      throw new Error(`Item ${item.name || item.network_id} not found in inventory`);
    }
    
    // Select the item slot if it's in hotbar
    if (itemSlot >= 0 && itemSlot <= 8) {
      await this.protocolHelpers.selectHotbarSlot(itemSlot);
    }
    
    // Drop the item
    const dropCount = count || item.count || 1;
    await this.protocolHelpers.dropItem(dropCount);
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
  
  emit(event: string, ...args: any[]): void {
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
    const from = new Vec3(this.position.x, this.position.y, this.position.z);
    const to = new Vec3(position.x, position.y, position.z);
    
    // For short distances, move directly
    if (from.distanceTo(to) < 2) {
      await this.protocolHelpers.moveStep(from, to);
      this.position = position;
    } else {
      // For longer distances, move in straight line with steps
      const steps = Math.ceil(from.distanceTo(to) / 1.5);
      const deltaX = (to.x - from.x) / steps;
      const deltaY = (to.y - from.y) / steps;
      const deltaZ = (to.z - from.z) / steps;
      
      for (let i = 1; i <= steps; i++) {
        const nextPos = new Vec3(
          from.x + deltaX * i,
          from.y + deltaY * i,
          from.z + deltaZ * i
        );
        await this.protocolHelpers.moveStep(
          new Vec3(this.position.x, this.position.y, this.position.z),
          nextPos
        );
        this.position = { x: nextPos.x, y: nextPos.y, z: nextPos.z };
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }
  
  getPlayers(): any[] {
    return Array.from(this.players.values());
  }
  
  getInventory(): any {
    const slots: any[] = [];
    for (let i = 0; i < 36; i++) {
      slots[i] = this.inventoryData.get(i) || null;
    }
    
    return {
      slots,
      selected: this.selectedSlot
    };
  }
  
  private updateInventory(): void {
    this.inventory = this.getInventory();
  }
  
  async navigateTo(position: Vec3 | { x: number; y: number; z: number }, options?: any): Promise<void> {
    const target = position instanceof Vec3 ? position : new Vec3(position.x, position.y, position.z);
    const start = new Vec3(this.position.x, this.position.y, this.position.z);
    
    // Calculate path using PathfindingService
    const path = this.pathfindingService.calculatePath(
      start,
      target,
      (pos) => this.blockAt(pos),
      options
    );
    
    if (!path || path.length === 0) {
      throw new Error(`No path found to ${target}`);
    }
    
    // Follow the path
    for (const waypoint of path) {
      await this.protocolHelpers.moveStep(
        new Vec3(this.position.x, this.position.y, this.position.z),
        waypoint
      );
      this.position = { x: waypoint.x, y: waypoint.y, z: waypoint.z };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  async digBlock(position: Vec3): Promise<void> {
    // Delegate to block interaction service if available
    if (this.blockInteractionService) {
      await this.blockInteractionService.breakBlock(this, position);
      return;
    }

    // Fallback to direct protocol implementation
    await this.protocolHelpers.startBreakBlock(position);
    
    // Calculate break time based on block hardness
    const block = this.blockAt(position);
    const hardness = this.blockRegistry.getHardness(block?.type || 0);
    const breakTime = Math.max(50, hardness * 1000);
    
    await new Promise(resolve => setTimeout(resolve, breakTime));
    await this.protocolHelpers.stopBreakBlock(position);
  }
  
  async placeBlock(referenceBlock: any, face: Vec3): Promise<void> {
    // Delegate to block interaction service if available
    if (this.blockInteractionService) {
      const position = referenceBlock.position.plus(face);
      await this.blockInteractionService.placeBlock(this, position, 'unknown', {
        referenceBlock,
        face
      });
      return;
    }

    // Fallback to direct protocol implementation
    const position = referenceBlock.position.plus(face);
    await this.protocolHelpers.placeBlock(position);
  }
  
  async activateBlock(block: any): Promise<void> {
    // Delegate to block interaction service if available
    if (this.blockInteractionService) {
      await this.blockInteractionService.activateBlock(this, block.position);
      return;
    }

    // Fallback to direct protocol implementation
    await this.protocolHelpers.openContainer(block.position);
  }
  
  async useItem(): Promise<void> {
    await this.protocolHelpers.useItem();
  }
  
  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }
  
  addChatMessage(username: string, message: string, type: string = 'manual'): void {
    this.chatHistory.push({
      timestamp: Date.now(),
      username,
      message,
      type
    });
    
    // Keep only last 100 messages
    if (this.chatHistory.length > 100) {
      this.chatHistory.shift();
    }
  }
}