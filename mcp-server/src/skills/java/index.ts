// Helper functions for skills

export const validateSkillParams = (
    params: { [key: string]: any },
    requiredKeys: string[],
    skillName: string,
) => {
    requiredKeys.forEach((key) => {
        if (!params.hasOwnProperty(key)) {
            console.error(`Missing required parameter ${key} for skill ${skillName}`);
        }
    });

    return requiredKeys.every((key) => params.hasOwnProperty(key));
};

export const isSignalAborted = (signal: AbortSignal | undefined): boolean =>
    typeof signal !== 'undefined' && signal?.aborted; 

