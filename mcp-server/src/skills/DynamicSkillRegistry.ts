import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SkillDefinition {
    name: string;
    description: string;
    inputSchema: any;
    handler: (bot: any, params: any, serviceParams: any) => Promise<any>;
    edition: 'java' | 'bedrock' | 'both';
}

export class DynamicSkillRegistry {
    private javaSkills: Map<string, SkillDefinition> = new Map();
    private bedrockSkills: Map<string, SkillDefinition> = new Map();
    private commonSkills: Map<string, SkillDefinition> = new Map();
    private currentEdition: 'java' | 'bedrock' | null = null;

    constructor() {
        this.loadSkills();
    }

    private async loadSkills() {
        // Load Java skills from java/verified directory
        await this.loadSkillsFromDirectory(
            path.join(__dirname, 'java/verified'),
            'java'
        );

        // Load Bedrock skills from bedrock/verified directory
        await this.loadSkillsFromDirectory(
            path.join(__dirname, 'bedrock/verified'),
            'bedrock'
        );

        // Load common skills (that work for both)
        this.loadCommonSkills();

        console.error(`[DynamicSkillRegistry] Loaded ${this.javaSkills.size} Java skills, ${this.bedrockSkills.size} Bedrock skills, ${this.commonSkills.size} common skills`);
    }

    private async loadSkillsFromDirectory(directory: string, edition: 'java' | 'bedrock') {
        // Use compiled directory in dist
        const compiledDir = directory.replace('/src/', '/dist/');
        
        if (!fs.existsSync(compiledDir)) {
            console.error(`[DynamicSkillRegistry] Directory not found: ${compiledDir}`);
            return;
        }

        const files = fs.readdirSync(compiledDir).filter(f => f.endsWith('.js'));
        
        for (const file of files) {
            try {
                const skillPath = path.join(compiledDir, file);
                const skill = await import(skillPath);
                
                // Extract skill name from filename
                const skillName = file.replace('.js', '');
                
                // Look for the named export matching the filename (e.g., sendChat)
                const handler = skill[skillName] || skill.default;
                
                if (handler && typeof handler === 'function') {
                    // Generate metadata based on skill name and edition
                    const definition: SkillDefinition = {
                        name: skillName,
                        description: this.getSkillDescription(skillName, edition),
                        inputSchema: this.getSkillInputSchema(skillName, edition),
                        handler: handler,
                        edition: edition
                    };

                    if (edition === 'java') {
                        this.javaSkills.set(skillName, definition);
                    } else {
                        this.bedrockSkills.set(skillName, definition);
                    }
                }
            } catch (error) {
                console.error(`[DynamicSkillRegistry] Failed to load skill ${file}:`, error);
            }
        }
    }

    private loadCommonSkills() {
        // Define skills that work for both editions
        const commonSkillDefs = [
            {
                name: 'sendChat',
                description: 'Send a chat message in the game',
                inputSchema: {
                    type: "object",
                    properties: {
                        message: {
                            type: "string",
                            description: "The message to send"
                        }
                    },
                    required: ["message"]
                }
            },
            {
                name: 'readChat',
                description: 'Read recent chat messages',
                inputSchema: {
                    type: "object",
                    properties: {
                        count: {
                            type: "number",
                            description: "Number of messages to read (default 10)"
                        }
                    }
                }
            }
        ];

        // These would need actual implementations
        commonSkillDefs.forEach(def => {
            this.commonSkills.set(def.name, {
                ...def,
                handler: async (bot, params) => {
                    // Placeholder - would call appropriate method on bot
                    if (def.name === 'sendChat' && bot.chat) {
                        await bot.chat(params.message);
                        return { success: true };
                    }
                    return { success: false, message: 'Not implemented' };
                },
                edition: 'both'
            });
        });
    }

    /**
     * Set the current edition based on the active bot
     */
    setCurrentEdition(edition: 'java' | 'bedrock' | null) {
        if (this.currentEdition !== edition) {
            this.currentEdition = edition;
            console.error(`[DynamicSkillRegistry] Switched to ${edition || 'no'} edition mode`);
        }
    }

    /**
     * Get all skills available for the current edition
     */
    getAllSkills(): SkillDefinition[] {
        if (!this.currentEdition) {
            return [];
        }

        const skills: SkillDefinition[] = [];

        // Add common skills
        this.commonSkills.forEach(skill => skills.push(skill));

        // Add edition-specific skills
        if (this.currentEdition === 'java') {
            this.javaSkills.forEach(skill => skills.push(skill));
        } else {
            this.bedrockSkills.forEach(skill => skills.push(skill));
        }

        return skills;
    }

    /**
     * Get a specific skill by name
     */
    getSkill(name: string): SkillDefinition | undefined {
        if (!this.currentEdition) {
            return undefined;
        }

        // Check common skills first
        if (this.commonSkills.has(name)) {
            return this.commonSkills.get(name);
        }

        // Check edition-specific skills
        if (this.currentEdition === 'java') {
            return this.javaSkills.get(name);
        } else {
            return this.bedrockSkills.get(name);
        }
    }

    /**
     * Check if a skill is available for the current edition
     */
    isSkillAvailable(name: string): boolean {
        return this.getSkill(name) !== undefined;
    }

    /**
     * Get skill count for each edition
     */
    getSkillCounts() {
        return {
            java: this.javaSkills.size,
            bedrock: this.bedrockSkills.size,
            common: this.commonSkills.size,
            current: this.getAllSkills().length
        };
    }

    /**
     * Get skills for a specific edition without changing current
     */
    getSkillsForEdition(edition: 'java' | 'bedrock'): SkillDefinition[] {
        const skills: SkillDefinition[] = [];
        
        // Add common skills
        this.commonSkills.forEach(skill => skills.push(skill));
        
        // Add edition-specific skills
        if (edition === 'java') {
            this.javaSkills.forEach(skill => skills.push(skill));
        } else {
            this.bedrockSkills.forEach(skill => skills.push(skill));
        }
        
        return skills;
    }
    
    /**
     * Generate skill description based on name and edition
     */
    private getSkillDescription(skillName: string, edition: 'java' | 'bedrock'): string {
        // Convert camelCase to sentence
        const humanReadable = skillName
            .replace(/([A-Z])/g, ' $1')
            .toLowerCase()
            .trim();
        
        return `Execute ${humanReadable} skill for ${edition === 'bedrock' ? 'Bedrock' : 'Java'} Edition`;
    }
    
    /**
     * Generate input schema based on skill name
     * TODO: This should be improved to read actual parameters from the skills
     */
    private getSkillInputSchema(skillName: string, edition: 'java' | 'bedrock'): any {
        // Basic schemas for common skills
        const commonSchemas: Record<string, any> = {
            sendChat: {
                type: "object",
                properties: {
                    message: { type: "string", description: "The message to send" },
                    delay: { type: "number", description: "Optional delay in milliseconds" }
                },
                required: ["message"]
            },
            readChat: {
                type: "object",
                properties: {
                    count: { type: "number", description: "Number of messages to read" }
                }
            },
            lookAround: {
                type: "object",
                properties: {
                    radius: { type: "number", description: "Search radius in blocks" }
                }
            },
            // Add more schemas as needed
        };
        
        return commonSchemas[skillName] || {
            type: "object",
            properties: {},
            description: `Parameters for ${skillName} skill`
        };
    }
}