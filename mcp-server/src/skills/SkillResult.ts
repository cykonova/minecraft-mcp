/**
 * Standard result types for all skills
 */

/**
 * Success result with optional data
 */
export interface SkillSuccess<T = any> {
    success: true;
    data?: T;
    message?: string;
    observations?: string[];
}

/**
 * Error result with error details
 */
export interface SkillError {
    success: false;
    error: string;
    code?: string;
    details?: any;
}

/**
 * Union type for all skill results
 */
export type SkillResult<T = any> = SkillSuccess<T> | SkillError;

/**
 * Helper functions for creating skill results
 */
export class SkillResults {
    /**
     * Create a success result
     */
    static success<T = any>(data?: T, message?: string, observations?: string[]): SkillSuccess<T> {
        return {
            success: true,
            data,
            message,
            observations,
        };
    }

    /**
     * Create an error result
     */
    static error(error: string, code?: string, details?: any): SkillError {
        return {
            success: false,
            error,
            code,
            details,
        };
    }

    /**
     * Create an error result from an exception
     */
    static fromError(err: unknown, code?: string): SkillError {
        const error = err instanceof Error ? err.message : String(err);
        return {
            success: false,
            error,
            code,
            details: err instanceof Error ? err.stack : undefined,
        };
    }

    /**
     * Check if a result is successful
     */
    static isSuccess<T>(result: SkillResult<T>): result is SkillSuccess<T> {
        return result.success === true;
    }

    /**
     * Check if a result is an error
     */
    static isError<T>(result: SkillResult<T>): result is SkillError {
        return result.success === false;
    }
}