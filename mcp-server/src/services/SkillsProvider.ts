import { injectable, singleton } from 'tsyringe';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { ISkill, IJavaSkill, IBedrockSkill, SkillModule } from '../skills/ISkill.js';
import { BotWithLogger, AnyBot } from '../types.js';
import { isUnifiedBot } from '../bots/UnifiedBot.js';
import { ISkillContext, SkillContextFactory } from '../skills/ISkillContext.js';
import { ISkillServiceParams, ISkillParams } from '../types/skillType.js';

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

    // No fallback - skill must exist for the specified edition
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

      // Detect skill signature to determine if it's legacy or context-based
      const skillSignature = this.detectSkillSignature(skillFunction);
      console.error(`[SkillsProvider] Detected ${skillSignature} signature for ${skillName}`);
      
      // Create skill wrapper
      const skill: ISkill = {
        name: skillName,
        description: `${edition} ${category} skill: ${skillName}`,
        edition: edition as any,
        category,
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        execute: async (bot: AnyBot, args: any, serviceParams?: ISkillServiceParams) => {
          // Validate bot edition matches skill edition
          const botEdition = this.getBotEdition(bot);
          if (botEdition !== edition) {
            console.warn(`[SkillsProvider] Warning: Using ${edition} skill with ${botEdition} bot`);
          }
          
          console.error(`[SkillsProvider] Executing ${skillSignature} skill '${skillName}' with args:`, args);
          
          // Handle different skill signatures
          if (skillSignature === 'context-based') {
            // Create skill context for new-style skills
            const context = SkillContextFactory.createWithDefaults(
              bot,
              args,
              {
                name: skillName,
                edition: edition as 'java' | 'bedrock' | 'universal',
                category,
              }
            );
            
            // Override service params if provided
            if (serviceParams) {
              context.serviceParams = serviceParams;
            }
            
            console.error(`[SkillsProvider] Calling context-based skill with context`);
            return skillFunction(context);
          } else {
            // Legacy skill signature: (bot, params, serviceParams)
            const defaultServiceParams: ISkillServiceParams = {
              cancelExecution: () => {
                console.warn(`[SkillsProvider] Cancel execution called for ${skillName}`);
              },
              signal: undefined,
              resetTimeout: () => {
                console.log(`[SkillsProvider] Timeout reset for ${skillName}`);
              },
              getStatsData: () => ({}),
              setStatsData: () => true,
            };
            
            const finalServiceParams = serviceParams || defaultServiceParams;
            console.error(`[SkillsProvider] Calling legacy skill with (bot, params, serviceParams)`);
            return skillFunction(bot, args, finalServiceParams);
          }
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
   * Detect skill signature by analyzing function parameters
   * @param skillFunction The skill function to analyze
   * @returns 'legacy' for (bot, params, serviceParams) or 'context-based' for (context)
   */
  private detectSkillSignature(skillFunction: Function): 'legacy' | 'context-based' {
    // Get function string and extract parameters
    const funcStr = skillFunction.toString();
    
    // Look for function declaration patterns
    const asyncFunctionMatch = funcStr.match(/async\s*(?:function)?\s*[^(]*\(([^)]*)\)/);
    const functionMatch = asyncFunctionMatch || funcStr.match(/(?:function)?\s*[^(]*\(([^)]*)\)/);
    
    if (functionMatch) {
      const params = functionMatch[1]
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      
      console.error(`[SkillsProvider] Function parameters detected:`, params);
      
      // Context-based skills have 1 parameter (context)
      // Legacy skills have 3 parameters (bot, params, serviceParams)
      if (params.length === 1) {
        return 'context-based';
      } else if (params.length === 3) {
        return 'legacy';
      } else {
        console.warn(`[SkillsProvider] Unusual parameter count ${params.length}, defaulting to legacy`);
        return 'legacy';
      }
    }
    
    console.warn(`[SkillsProvider] Could not detect skill signature, defaulting to legacy`);
    return 'legacy';
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