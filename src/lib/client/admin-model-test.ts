export type ModelTestProviderType = 'openai' | 'google' | 'anthropic';

export interface ModelTestKeyInput {
    key: string;
    weight?: number | null;
}

export interface ModelTestAttempt {
    keyPreview: string;
    error: string;
    status?: number;
    nextKeyPreview?: string;
}

export interface AdminModelTestPayload {
    providerName?: string;
    baseUrl: string;
    type: ModelTestProviderType;
    modelId: string;
    keys: ModelTestKeyInput[];
}

export interface AdminModelTestResult {
    success: boolean;
    duration?: number;
    error?: string;
    data?: unknown;
    attempts?: ModelTestAttempt[];
    usedKey?: string;
}

const DEFAULT_KEY_WEIGHT = 10;

export function parseWeightedKeysInput(keysInput: string): ModelTestKeyInput[] {
    return keysInput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split(/\s+/);
            const key = parts[0]?.trim();
            const parsedWeight = parts.length > 1 ? Number.parseInt(parts[1], 10) : DEFAULT_KEY_WEIGHT;
            const weight = Number.isNaN(parsedWeight) ? DEFAULT_KEY_WEIGHT : parsedWeight;
            return { key, weight };
        })
        .filter((item) => !!item.key && (item.weight ?? DEFAULT_KEY_WEIGHT) > 0);
}

export async function callAdminModelTest(payload: AdminModelTestPayload): Promise<AdminModelTestResult> {
    const res = await fetch('/api/admin/model-test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const result = (await res.json().catch(() => null)) as (Partial<AdminModelTestResult> & { error?: string }) | null;

    if (!res.ok) {
        throw new Error(result?.error || `请求失败: ${res.status}`);
    }

    return (result || { success: false, error: '空响应' }) as AdminModelTestResult;
}
