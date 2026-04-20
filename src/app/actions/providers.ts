'use server';

import crypto from "crypto";
import { getProviders, addProvider, updateProvider, deleteProvider, ProviderConfig, getModelRules, ModelRule, addModelRule, updateModelRule, deleteModelRule } from "@/lib/server/providers";
import { getConfig } from "@/lib/server/configs";
import { revalidatePath } from "next/cache";

export type SubscriptionProvider = {
    id?: string;
    name?: string;
    type?: 'openai' | 'google' | 'anthropic' | string;
    description?: string;
    base_url?: string;
    baseUrl?: string;
    homepage_url?: string;
    icon?: string;
    model_icon?: string;
    free_models?: string[] | string;
    referral_text?: string;
    referral_link?: string;
    tips?: string;
    models?: string[];
    model_aliases?: Record<string, string>;
};

function getSubscriptionKey(p: SubscriptionProvider) {
    return p.id || `${p.name || ''}::${p.type || ''}`;
}

async function fetchSubscriptionPayload(url?: string) {
    const targetUrl = url || await getConfig("subscription_url");
    if (!targetUrl) throw new Error("未提供或未配置订阅 URL");

    const res = await fetch(targetUrl, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`无法从 URL 获取数据: ${res.statusText}`);
    const data: any = await res.json();
    if (!data || !Array.isArray(data.providers)) {
        throw new Error("格式错误: 预期包含 'providers' 数组的 JSON");
    }
    return { data, targetUrl };
}

function normalizeSubscriptionProvider(p: SubscriptionProvider) {
    const freeModels = Array.isArray(p.free_models)
        ? p.free_models
        : (p.free_models ? [p.free_models] : []);
    const models = Array.isArray(p.models) ? p.models : undefined;
    const modelAliases = p.model_aliases && typeof p.model_aliases === 'object' ? p.model_aliases : undefined;

    return {
        id: p.id,
        name: p.name,
        type: p.type,
        description: p.description || '',
        base_url: p.base_url || p.baseUrl || '',
        homepage_url: p.homepage_url || '',
        icon: p.icon || p.model_icon || '',
        free_models: freeModels,
        referral_text: p.referral_text || '',
        referral_link: p.referral_link || '',
        tips: p.tips || '',
        models,
        model_aliases: modelAliases
    } as SubscriptionProvider;
}

export async function fetchProviders() {
    return await getProviders();
}

export async function fetchRules(type?: 'openai' | 'google') {
    return await getModelRules(type);
}

export async function createRule(rule: Partial<ModelRule>) {
    await addModelRule(rule);
    revalidatePath('/admin/aliases');
    return rule;
}

export async function updateRuleAction(rule: ModelRule) {
    await updateModelRule(rule);
    revalidatePath('/admin/aliases');
    return rule;
}

export async function deleteRuleAction(id: string) {
    await deleteModelRule(id);
    revalidatePath('/admin/aliases');
}

type AvailableModelsWithProvidersPayload = {
    modelsByType: Record<string, string[]>;
    modelProvidersByType: Record<string, Record<string, string[]>>;
};

async function getAvailableModelsPayload(): Promise<AvailableModelsWithProvidersPayload> {
    // 从 model_rules 表中收集所有唯一的 identifier
    const rules = await getModelRules();
    const allProviders = await getProviders();
    const providerNameById = new Map(allProviders.map((provider) => [provider.id, provider.name]));

    const modelsByType: Record<string, string[]> = {
        "模型别名组": [],
        openai: [],
        google: [],
        anthropic: []
    };
    const modelProvidersByType: Record<string, Record<string, string[]>> = {
        openai: {},
        google: {},
        anthropic: {}
    };

    rules.forEach(r => {
        if (!r.isEnabled) return;
        if (r.isAlias) {
            if (!modelsByType["模型别名组"].includes(r.identifier)) {
                modelsByType["模型别名组"].push(r.identifier);
            }
        } else {
            if (modelsByType[r.type] && !modelsByType[r.type].includes(r.identifier)) {
                modelsByType[r.type].push(r.identifier);
            } else if (!modelsByType[r.type]) {
                modelsByType[r.type] = [r.identifier];
            }

            const providerName = r.providerId ? providerNameById.get(r.providerId) : null;
            if (providerName) {
                const providersForModel = modelProvidersByType[r.type][r.identifier] || [];
                if (!providersForModel.includes(providerName)) {
                    modelProvidersByType[r.type][r.identifier] = [...providersForModel, providerName].sort((a, b) => a.localeCompare(b));
                }
            }
        }
    });

    // 加入已经配置了 API keys 且 models 列表不为空的具体 Provider
    allProviders.forEach(p => {
        if (p.isEnabled && p.keys && p.keys.length > 0 && p.models && p.models.length > 0) {
            // 使用 Provider 的名称作为 key，避免显示 UUID
            modelsByType[p.name] = p.models;
        }
    });

    // 为每个分组排序
    Object.keys(modelsByType).forEach(key => {
        modelsByType[key].sort();
    });

    return {
        modelsByType,
        modelProvidersByType
    };
}

export async function fetchAvailableModels() {
    const payload = await getAvailableModelsPayload();
    return payload.modelsByType;
}

export async function fetchAvailableModelsWithProviders() {
    return await getAvailableModelsPayload();
}

export async function createProvider(provider: ProviderConfig) {
    try {
        provider.id = crypto.randomUUID();
        await addProvider(provider);
        revalidatePath('/admin/providers');
        revalidatePath('/admin/aliases');
        return { success: true, provider };
    } catch (e: any) {
        console.error("创建供应商失败:", e);
        return { success: false, error: e.message };
    }
}

export async function updateProviderAction(provider: ProviderConfig) {
    try {
        await updateProvider(provider);
        revalidatePath('/admin/providers');
        revalidatePath('/admin/aliases');
        return { success: true, provider };
    } catch (e: any) {
        console.error("更新供应商失败:", e);
        return { success: false, error: e.message };
    }
}

export async function deleteProviderAction(id: string) {
    try {
        await deleteProvider(id);
        revalidatePath('/admin/providers');
        revalidatePath('/admin/aliases');
        return { success: true };
    } catch (e: any) {
        console.error("删除供应商失败:", e);
        return { success: false, error: e.message };
    }
}

export async function fetchRemoteModels(baseUrl: string, apiKey: string, type: 'openai' | 'google'): Promise<string[]> {
    try {
        let url = baseUrl;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (type === 'google') {
            // Google (Gemini)
            if (!url.endsWith('/')) url += '/';
            url += `models?key=${apiKey}`;
        } else {
            // OpenAI
            if (!url.endsWith('/')) url += '/';
            url += 'models';
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const res = await fetch(url, { headers, next: { revalidate: 0 } });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`API 错误: ${res.status} ${err}`);
        }

        const data: any = await res.json();
        
        if (type === 'openai') {
            // OpenAI format: { data: [{ id: "..." }, ...] }
            return (data.data || []).map((m: any) => m.id);
        } else {
            // Gemini format: { models: [{ name: "models/...", ... }, ...] }
            return (data.models || []).map((m: any) => m.name);
        }
    } catch (e) {
        console.error("获取远程模型失败:", e);
        throw e;
    }
}

export async function fetchSubscriptionProvidersAction(url?: string) {
    try {
        const { data, targetUrl } = await fetchSubscriptionPayload(url);
        const providers = data.providers.map((p: SubscriptionProvider) => normalizeSubscriptionProvider(p));
        return { success: true, providers, url: targetUrl };
    } catch (e: any) {
        return { success: false, error: e.message, providers: [] as SubscriptionProvider[] };
    }
}

export async function subscribeProvidersAction(params?: { url?: string; providerKeys?: string[] }) {
    try {
        const { data } = await fetchSubscriptionPayload(params?.url);
        const selectedKeys = params?.providerKeys?.length ? new Set(params.providerKeys) : null;
        const sourceProviders = (data.providers as SubscriptionProvider[])
            .map(p => normalizeSubscriptionProvider(p))
            .filter(p => (selectedKeys ? selectedKeys.has(getSubscriptionKey(p)) : true));

        const existingProviders = await getProviders();
        let count = 0;
        
        for (const p of sourceProviders) {
            if (p.name && p.type && p.base_url) {
                // 只按 UUID 判断是否已存在
                const existing = p.id ? existingProviders.find(ep => ep.id === p.id) : undefined;

                if (existing) {
                    // 如果已存在，则更新配置 (Base URL 和 模型参数)
                    // 但必须保留用户本地手动填入的 API Keys 和 启停状态
                    const updatedProvider: ProviderConfig = {
                        ...existing,
                        name: p.name || existing.name,
                        type: p.type as 'openai' | 'google' | 'anthropic',
                        baseUrl: p.base_url,
                        models: p.models || existing.models,
                        modelAliases: p.model_aliases || existing.modelAliases,
                        keys: existing.keys,
                        isEnabled: existing.isEnabled,
                        isOnline: true,
                        referralText: p.referral_text ? p.referral_text : null, // 强制覆盖，如果订阅中没有则设为 null
                        referralLink: p.referral_link ? p.referral_link : null, // 强制覆盖
                        homepageUrl: p.homepage_url || existing.homepageUrl || null,
                        icon: p.icon || existing.icon || null,
                        description: p.description ?? existing.description ?? ''
                    };
                    await updateProvider(updatedProvider);
                } else {
                    // 如果不存在，则当成新的 Provider 新增注入
                    const provider: ProviderConfig = {
                        id: p.id || crypto.randomUUID(),
                        name: p.name,
                        type: p.type as 'openai' | 'google' | 'anthropic',
                        baseUrl: p.base_url,
                        isEnabled: true,
                        isOnline: true,
                        keys: [],
                        models: p.models || [],
                        modelAliases: p.model_aliases || {},
                        referralText: p.referral_text || null,
                        referralLink: p.referral_link || null,
                        homepageUrl: p.homepage_url || null,
                        icon: p.icon || null,
                        description: p.description || ''
                    };
                    await addProvider(provider);
                }
                count++;
            }
        }
        
        revalidatePath('/admin/providers');
        revalidatePath('/admin/aliases');
        return { success: true, count };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
