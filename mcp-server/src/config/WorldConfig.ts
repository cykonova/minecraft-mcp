import * as fs from 'fs';
import * as path from 'path';

export interface World {
  name: string;
  host: string;
  port: number;
  edition: 'java' | 'bedrock';
  version?: string;
  offline?: boolean;
  description?: string;
  auth?: {
    username?: string;
    password?: string;
  };
}

export interface WorldsConfig {
  worlds: { [key: string]: World };
  defaultWorld?: string;
}

export class WorldConfigManager {
  private config: WorldsConfig;
  private configPath: string;

  constructor(configPath?: string) {
    // Look for worlds.json in multiple locations
    const possiblePaths = [
      configPath,
      path.join(process.cwd(), 'worlds.json'),
      path.join(__dirname, '../../worlds.json'),
      path.join(__dirname, '../../../worlds.json'),
      '/app/worlds.json', // For Docker
    ].filter(Boolean) as string[];

    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        this.configPath = tryPath;
        break;
      }
    }

    if (!this.configPath) {
      // Create default config if none exists
      this.configPath = path.join(process.cwd(), 'worlds.json');
      this.config = this.getDefaultConfig();
      this.save();
      process.stderr.write(`[WorldConfig] Created default worlds.json at ${this.configPath}\n`);
    } else {
      this.load();
      process.stderr.write(`[WorldConfig] Loaded worlds from ${this.configPath}\n`);
    }
  }

  private getDefaultConfig(): WorldsConfig {
    return {
      worlds: {
        local: {
          name: "Local Development",
          host: "localhost",
          port: 25565,
          edition: "java",
          description: "Local Minecraft Java Edition server"
        },
        "local-bedrock": {
          name: "Local Bedrock",
          host: "localhost",
          port: 19132,
          edition: "bedrock",
          version: "1.21.102.1",
          offline: true,
          description: "Local Minecraft Bedrock server"
        }
      },
      defaultWorld: "local"
    };
  }

  private load(): void {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
    } catch (error) {
      process.stderr.write(`[WorldConfig] Error loading worlds.json: ${error}\n`);
      this.config = this.getDefaultConfig();
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      process.stderr.write(`[WorldConfig] Error saving worlds.json: ${error}\n`);
    }
  }

  getWorld(worldId: string): World | undefined {
    return this.config.worlds[worldId];
  }

  getDefaultWorld(): World | undefined {
    if (this.config.defaultWorld) {
      return this.config.worlds[this.config.defaultWorld];
    }
    // Return first world if no default
    const firstKey = Object.keys(this.config.worlds)[0];
    return firstKey ? this.config.worlds[firstKey] : undefined;
  }

  getAllWorlds(): { [key: string]: World } {
    return this.config.worlds;
  }

  getWorldList(): string[] {
    return Object.keys(this.config.worlds);
  }

  addWorld(id: string, world: World): void {
    this.config.worlds[id] = world;
    this.save();
  }

  removeWorld(id: string): boolean {
    if (this.config.worlds[id]) {
      delete this.config.worlds[id];
      if (this.config.defaultWorld === id) {
        this.config.defaultWorld = Object.keys(this.config.worlds)[0];
      }
      this.save();
      return true;
    }
    return false;
  }

  setDefaultWorld(id: string): boolean {
    if (this.config.worlds[id]) {
      this.config.defaultWorld = id;
      this.save();
      return true;
    }
    return false;
  }

  getWorldDescription(worldId: string): string {
    const world = this.getWorld(worldId);
    if (!world) return `Unknown world: ${worldId}`;
    
    return `${world.name} (${world.edition} ${world.host}:${world.port})`;
  }
}