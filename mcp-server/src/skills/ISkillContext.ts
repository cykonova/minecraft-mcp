import { AnyBot } from '../types.js';
import { ISkillServiceParams } from '../types/skillType.js';

/**
 * Execution context for all skills containing the bot, parameters, and service functions
 */
export interface ISkillContext {
    /**
     * The bot instance (Java, Bedrock, or Universal)
     */
    bot: AnyBot;

    /**
     * Skill-specific parameters passed by the caller
     */
    params: Record<string, any>;

    /**
     * Service parameters for skill execution management
     */
    serviceParams: ISkillServiceParams;

    /**
     * Skill metadata for this execution
     */
    metadata: {
        name: string;
        edition: 'java' | 'bedrock' | 'universal';
        category: 'verified' | 'library' | 'composite';
        version?: string;
    };

    /**
     * Abort signal for cancelling execution
     */
    signal?: AbortSignal;
}

/**
 * Factory for creating skill contexts
 */
export class SkillContextFactory {
    /**
     * Create a skill context from individual components
     */
    static create(
        bot: AnyBot,
        params: Record<string, any>,
        serviceParams: ISkillServiceParams,
        metadata: {
            name: string;
            edition: 'java' | 'bedrock' | 'universal';
            category: 'verified' | 'library' | 'composite';
            version?: string;
        }
    ): ISkillContext {
        return {
            bot,
            params,
            serviceParams,
            metadata,
        };
    }

    /**
     * Create a skill context with default service parameters
     */
    static createWithDefaults(
        bot: AnyBot,
        params: Record<string, any>,
        metadata: {
            name: string;
            edition: 'java' | 'bedrock' | 'universal';
            category: 'verified' | 'library' | 'composite';
            version?: string;
        }
    ): ISkillContext {
        const defaultServiceParams: ISkillServiceParams = {
            cancelExecution: () => {
                console.warn(`[SkillContext] Cancel execution called for ${metadata.name}`);
            },
            signal: undefined,
            resetTimeout: () => {
                console.log(`[SkillContext] Timeout reset for ${metadata.name}`);
            },
            getStatsData: () => ({}),
            setStatsData: () => true,
        };

        return this.create(bot, params, defaultServiceParams, metadata);
    }
}