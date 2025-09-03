import { UnifiedBot } from './UnifiedBot.js';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

export class JavaBotWrapper implements UnifiedBot {
  username: string;
  edition: 'java' = 'java';
  _bot: Bot;
  
  constructor(bot: Bot) {
    this._bot = bot;
    this.username = bot.username;
  }
  
  // Delegate properties to the underlying bot
  get health() { return this._bot.health; }
  get food() { return this._bot.food; }
  get entity() { return this._bot.entity; }
  get inventory() { return this._bot.inventory; }
  get pathfinder() { return (this._bot as any).pathfinder; }
  get pvp() { return (this._bot as any).pvp; }
  
  getPosition(): Vec3 {
    return this._bot.entity?.position || new Vec3(0, 0, 0);
  }
  
  async lookAt(target: Vec3 | { x: number; y: number; z: number }): Promise<void> {
    const vec = target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z);
    await this._bot.lookAt(vec);
  }
  
  async chat(message: string): Promise<void> {
    await this._bot.chat(message);
  }
  
  whisper(username: string, message: string): void {
    this._bot.whisper(username, message);
  }
  
  get navigate() {
    const pathfinder = (this._bot as any).pathfinder;
    if (!pathfinder) return undefined;
    
    return {
      to: async (goal: any) => {
        return new Promise<void>((resolve, reject) => {
          pathfinder.setGoal(goal);
          
          const goalReached = () => {
            pathfinder.removeListener('goal_reached', goalReached);
            pathfinder.removeListener('path_stopped', pathStopped);
            resolve();
          };
          
          const pathStopped = () => {
            pathfinder.removeListener('goal_reached', goalReached);
            pathfinder.removeListener('path_stopped', pathStopped);
            reject(new Error('Path stopped before reaching goal'));
          };
          
          pathfinder.once('goal_reached', goalReached);
          pathfinder.once('path_stopped', pathStopped);
        });
      },
      stop: () => {
        pathfinder.stop();
      }
    };
  }
  
  blockAt(position: Vec3): any {
    return this._bot.blockAt(position);
  }
  
  nearestEntity(filter?: (entity: any) => boolean): any {
    return this._bot.nearestEntity(filter);
  }
  
  async equip(item: any, destination: string): Promise<void> {
    await this._bot.equip(item, destination as any);
  }
  
  async tossStack(item: any, count?: number): Promise<void> {
    await this._bot.tossStack(item);
  }
  
  on(event: string, listener: (...args: any[]) => void): void {
    this._bot.on(event as any, listener);
  }
  
  once(event: string, listener: (...args: any[]) => void): void {
    this._bot.once(event as any, listener);
  }
  
  off(event: string, listener: (...args: any[]) => void): void {
    this._bot.off(event as any, listener);
  }
  
  emit(event: string, ...args: any[]): void {
    this._bot.emit(event as any, ...args);
  }
  
  quit(): void {
    this._bot.quit();
  }
  
  end(): void {
    this._bot.end();
  }
  
  // Java Edition specific methods that are commonly used
  async waitForTicks(ticks: number): Promise<void> {
    return this._bot.waitForTicks(ticks);
  }
  
  async sleep(bedBlock: any): Promise<void> {
    return this._bot.sleep(bedBlock);
  }
  
  async wake(): Promise<void> {
    return this._bot.wake();
  }
  
  async activateBlock(block: any): Promise<void> {
    return this._bot.activateBlock(block);
  }
  
  async dig(block: any): Promise<void> {
    return this._bot.dig(block);
  }
  
  async placeBlock(referenceBlock: any, faceVector: Vec3): Promise<void> {
    return this._bot.placeBlock(referenceBlock, faceVector);
  }
}