import { ProviderConfig } from '@/lib/server/providers';

export const formatError = (err: string) => {
    if (!err) return "";
    try {
        const jsonStart = err.indexOf('{');
        const jsonEnd = err.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const prefix = err.substring(0, jsonStart).trim();
            const jsonPart = err.substring(jsonStart, jsonEnd + 1);
            const suffix = err.substring(jsonEnd + 1).trim();
            const parsed = JSON.parse(jsonPart);
            return (prefix ? prefix + "\n" : "") + JSON.stringify(parsed, null, 2) + (suffix ? "\n" + suffix : "");
        }
    } catch { }
    return err;
};

export const buildModelSet = (providers: ProviderConfig[]) => {
    const set = new Set<string>();
    providers
        .filter(p => p.isEnabled && p.keys?.some(k => k.isEnabled))
        .forEach(p => {
            (p.models || []).forEach(m => set.add(m.toLowerCase()));
            Object.keys(p.modelAliases || {}).forEach(m => set.add(m.toLowerCase()));
        });
    return set;
};

export const buildAvailableModelSet = (availableModels: Record<string, string[]>) => {
    const set = new Set<string>();
    Object.values(availableModels || {}).forEach(models => {
        if (!Array.isArray(models)) return;
        models.forEach(m => set.add(m.toLowerCase()));
    });
    return set;
};
