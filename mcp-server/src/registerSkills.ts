import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { BotManager } from './botManager.js';
import { loadSkills } from './skillRegistry.js';
import { getContainer } from './container.js';
import { TOKENS } from './config/tokens.js';

/**
 * Register all available skills as MCP tools
 */
export async function registerSkills(server: Server, botManager: BotManager): Promise<void> {
    const container = getContainer();
    const skillRegistry = container.resolve(TOKENS.SkillRegistry);
    const skillsProvider = container.resolve(TOKENS.SkillsProvider);
    
    // Load all skills
    const skills = await loadSkills(skillsProvider);
    for (const skill of skills) {
        skillRegistry.registerSkill(skill);
    }
    
    // Store skill registry reference on botManager for convenience
    (botManager as any).skillRegistry = skillRegistry;
    
    console.error(`[MCP] Loaded ${skillRegistry.getAllSkills().length} skills`);
}