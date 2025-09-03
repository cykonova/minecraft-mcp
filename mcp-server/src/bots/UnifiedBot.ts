import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

export interface UnifiedBot {
  username: string;
  edition: 'java' | 'bedrock';
  
  // Core properties
  health?: number;
  food?: number;
  entity?: any;
  inventory?: any;
  
  // Position and movement
  getPosition(): Vec3 | { x: number; y: number; z: number };
  lookAt(target: Vec3 | { x: number; y: number; z: number }): Promise<void>;
  
  // Chat and commands
  chat(message: string): Promise<void>;
  whisper(username: string, message: string): void;
  
  // Navigation (Java Edition specific - will need adaptation for Bedrock)
  pathfinder?: any;
  navigate?: {
    to: (goal: any) => Promise<void>;
    stop: () => void;
  };
  
  // Combat (if available)
  pvp?: any;
  
  // World interaction
  blockAt(position: Vec3): any;
  nearestEntity(filter?: (entity: any) => boolean): any;
  
  // Inventory management
  equip(item: any, destination: string): Promise<void>;
  tossStack(item: any, count?: number): Promise<void>;
  
  // Events
  on(event: string, listener: (...args: any[]) => void): void;
  once(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
  
  // Control
  quit(): void;
  end(): void;
  
  // Additional methods for compatibility
  waitForTicks?(ticks: number): Promise<void>;
  sleep?(bedBlock: any): Promise<void>;
  wake?(): Promise<void>;
  activateBlock?(block: any): Promise<void>;
  dig?(block: any): Promise<void>;
  placeBlock?(referenceBlock: any, faceVector: Vec3): Promise<void>;
  
  // Bedrock-specific methods
  digBlock?(position: Vec3): Promise<void>;
  moveTo?(position: { x: number; y: number; z: number }): Promise<void>;
  navigateTo?(position: Vec3 | { x: number; y: number; z: number }, options?: any): Promise<void>;
  useItem?(): Promise<void>;
  
  // Chat history (Bedrock-specific but can be implemented for Java too)
  getChatHistory?(): Array<{ timestamp: number; username: string; message: string; type: string }>;
  addChatMessage?(username: string, message: string, type: string): void;
  
  // Player list (optional)
  getPlayers?(): any[];
  
  // Raw bot access (for edition-specific operations)
  _bot: Bot | any; // Bot for Java, Client for Bedrock
}

export function isUnifiedBot(obj: any): obj is UnifiedBot {
  return obj && 
    typeof obj.username === 'string' &&
    typeof obj.edition === 'string' &&
    (obj.edition === 'java' || obj.edition === 'bedrock') &&
    typeof obj.chat === 'function' &&
    typeof obj.getPosition === 'function';
}