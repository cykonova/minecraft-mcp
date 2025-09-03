import { injectable, singleton } from 'tsyringe';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { ISkill, IJavaSkill, IBedrockSkill, SkillModule } from '../skills/ISkill.js';
import { BotWithLogger, AnyBot } from '../types.js';
import { isUnifiedBot } from '../bots/UnifiedBot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Service for dynamically loading and providing skills based on edition
 */
@injectable()
@singleton()
export class SkillsProvider {
  private skillCache: Map<string, ISkill> = new Map();
  private skillPaths: Map<string, string> = new Map();

  constructor() {
    this.initializeSkillPaths();
  }

  /**
   * Initialize skill paths for quick lookup
   */
  private initializeSkillPaths(): void {
    // This will be populated as skills are discovered
    console.error('[SkillsProvider] Initialized');
  }

  /**
   * Get a skill for a specific bot, automatically selecting the correct edition
   */
  async getSkillForBot(skillName: string, bot: AnyBot): Promise<ISkill | null> {
    const edition = this.getBotEdition(bot);
    return this.getSkill(skillName, edition);
  }

  /**
   * Get a skill by name and edition
   */
  async getSkill(skillName: string, edition: 'java' | 'bedrock'): Promise<ISkill | null> {
    const cacheKey = `${edition}-${skillName}`;
    
    // Check cache first
    if (this.skillCache.has(cacheKey)) {
      return this.skillCache.get(cacheKey)!;
    }

    // Try to load the skill
    const skill = await this.loadSkill(skillName, edition);
    if (skill) {
      this.skillCache.set(cacheKey, skill);
    }

    return skill;
  }

  /**
   * Load a skill from disk
   */
  private async loadSkill(skillName: string, edition: 'java' | 'bedrock'): Promise<ISkill | null> {
    // Try verified first, then library
    const categories: ('verified' | 'library')[] = ['verified', 'library'];
    
    for (const category of categories) {
      const skillPath = this.getSkillPath(skillName, edition, category);
      
      if (existsSync(skillPath)) {
        try {
          const skill = await this.loadSkillFromPath(skillPath, skillName, edition, category);
          if (skill) {
            console.error(`[SkillsProvider] Loaded ${edition} ${category} skill: ${skillName}`);
            return skill;
          }
        } catch (error) {
          console.error(`[SkillsProvider] Failed to load skill ${skillName} from ${skillPath}:`, error);
        }
      }
    }

    // If Bedrock skill not found, try to fall back to Java with a warning
    if (edition === 'bedrock') {
      console.error(`[SkillsProvider] Bedrock skill '${skillName}' not found, attempting Java fallback`);
      const javaSkill = await this.getSkill(skillName, 'java');
      if (javaSkill) {
        console.warn(`[SkillsProvider] WARNING: Using Java skill '${skillName}' for Bedrock bot - may not work correctly`);
        return javaSkill;
      }
    }

    console.error(`[SkillsProvider] Skill '${skillName}' not found for ${edition} edition`);
    return null;
  }

  /**
   * Load a skill from a specific path
   */
  private async loadSkillFromPath(
    skillPath: string,
    skillName: string,
    edition: 'java' | 'bedrock',
    category: 'verified' | 'library'
  ): Promise<ISkill | null> {
    try {
      const skillModuleUrl = pathToFileURL(skillPath).href;
      const skillModule: SkillModule = await import(skillModuleUrl);
      
      // Get the skill function
      const skillFunction = skillModule[skillName] || skillModule.default;
      
      if (!skillFunction || typeof skillFunction !== 'function') {
        console.error(`[SkillsProvider] No valid skill function found in ${skillPath}`);
        return null;
      }

      // Create skill wrapper
      const skill: ISkill = {
        name: skillName,
        description: `${edition} ${category} skill: ${skillName}`,
        edition: edition as any,
        category,
        execute: async (bot: AnyBot, args: any) => {
          // Validate bot edition matches skill edition
          const botEdition = this.getBotEdition(bot);
          if (botEdition !== edition) {
            console.warn(`[SkillsProvider] Warning: Using ${edition} skill with ${botEdition} bot`);
          }
          
          return skillFunction(bot, args);
        }
      };

      return skill;
    } catch (error) {
      console.error(`[SkillsProvider] Failed to load skill from ${skillPath}:`, error);
      return null;
    }
  }

  /**
   * Get the path to a skill file
   */
  private getSkillPath(skillName: string, edition: 'java' | 'bedrock', category: 'verified' | 'library'): string {
    // Go up from services directory to get to src, then to skills
    // __dirname is at: mcp-server/dist/services
    // Skills are at: mcp-server/dist/skills/{edition}/{category}
    return join(__dirname, '..', 'skills', edition, category, `${skillName}.js`);
  }

  /**
   * Determine bot edition
   */
  private getBotEdition(bot: AnyBot): 'java' | 'bedrock' {
    if (isUnifiedBot(bot)) {
      return bot.edition;
    }
    // Default to Java for BotWithLogger
    return 'java';
  }

  /**
   * List all available skills for an edition
   */
  async listSkills(edition: 'java' | 'bedrock'): Promise<string[]> {
    const skills: string[] = [];
    const categories: ('verified' | 'library')[] = ['verified', 'library'];
    
    for (const category of categories) {
      const categoryPath = join(__dirname, '..', 'skills', edition, category);
      
      if (existsSync(categoryPath)) {
        try {
          const { readdirSync } = await import('fs');
          const files = readdirSync(categoryPath);
          
          for (const file of files) {
            if (file.endsWith('.js') && !file.startsWith('index')) {
              skills.push(file.replace('.js', ''));
            }
          }
        } catch (error) {
          console.error(`[SkillsProvider] Failed to list skills in ${categoryPath}:`, error);
        }
      }
    }
    
    return [...new Set(skills)]; // Remove duplicates
  }

  /**
   * Clear skill cache
   */
  clearCache(): void {
    this.skillCache.clear();
    console.error('[SkillsProvider] Cache cleared');
  }

  /**
   * Check if a skill exists for an edition
   */
  async skillExists(skillName: string, edition: 'java' | 'bedrock'): Promise<boolean> {
    const categories: ('verified' | 'library')[] = ['verified', 'library'];
    
    for (const category of categories) {
      const skillPath = this.getSkillPath(skillName, edition, category);
      if (existsSync(skillPath)) {
        return true;
      }
    }
    
    return false;
  }
}