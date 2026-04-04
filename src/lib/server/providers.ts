import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface ProviderKey {
    id?: string;
    key: string;
    weight: number;
    isEnabled: boolean;
}

export interface ProviderConfig {
    id: string; // uuid
    name: string;
    type: 'openai' | 'google' | 'anthropic';
    baseUrl: string;
    models: string[];
    modelAliases: Record<string, string>;
    keys: ProviderKey[];
    isEnabled: boolean;
    isOnline?: boolean;
    referralText?: string | null;
    referralLink?: string | null;
    homepageUrl?: string | null;
    icon?: string | null; // Provider-specific icon URL from subscription's model_icon
    description?: string;
}

export interface ModelRule {
    id: string;
    identifier: string;
    description: string;
    isAlias: boolean;
    providerId: string | null;
    targetModel: string;
    type: 'openai' | 'google' | 'anthropic';
    weight: number;
    isEnabled: boolean;
    isAutoSynced: boolean;
}

// Internal Database Row Types
interface ModelRuleRow {
    id: string;
    identifier: string;
    description: string | null;
    is_alias: number;
    provider_id: string | null;
    target_model: string;
    type: string;
    weight: number;
    is_enabled: number;
    is_auto_synced: number;
}

interface ProviderRow {
    id: string;
    name: string;
    type: string;
    base_url: string;
    is_enabled: number;
    is_online?: number | null;
    referral_text: string | null;
    referral_link: string | null;
    homepage_url: string | null;
    icon: string | null;
    description: string | null;
}

interface ProviderKeyRow {
    id: string;
    provider_id: string;
    key_value: string;
    weight: number;
    is_enabled: number;
}

function normalizeProviderType(
    value: unknown,
    fallback: ProviderConfig['type'] = 'openai'
): ProviderConfig['type'] {
    if (value === 'openai' || value === 'google' || value === 'anthropic') {
        return value;
    }
    return fallback;
}

export async function getModelRules(type?: string, identifier?: string): Promise<ModelRule[]> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return [];

    let query = `SELECT * FROM model_rules WHERE 1=1`;
    const params: (string | number)[] = [];

    if (type) {
        query += ` AND type = ?`;
        params.push(type);
    }
    if (identifier) {
        query += ` AND identifier = ?`;
        params.push(identifier);
    }

    query += ` ORDER BY is_alias DESC, identifier ASC`;

    const { results } = await env.DB.prepare(query).bind(...params).all<ModelRuleRow>();
    return (results || []).map(r => ({
        id: r.id,
        identifier: r.identifier,
        description: r.description || '',
        isAlias: !!r.is_alias,
        providerId: r.provider_id,
        targetModel: r.target_model,
        type: r.type as 'openai' | 'google' | 'anthropic',
        weight: r.weight,
        isEnabled: !!r.is_enabled,
        isAutoSynced: !!r.is_auto_synced
    }));
}

export async function updateModelRule(rule: ModelRule): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    // 检查冲突
    const { results: existing } = await env.DB.prepare(`SELECT is_alias FROM model_rules WHERE identifier = ? AND id != ? LIMIT 1`).bind(rule.identifier, rule.id).all();
    if (existing && existing.length > 0) {
        const row = existing[0] as any;
        if (row.is_alias !== (rule.isAlias ? 1 : 0)) {
            throw new Error(`冲突：名称 "${rule.identifier}" 已被用作${row.is_alias ? '别名' : '原生模型 ID'}。`);
        }
    }

    await env.DB.prepare(`
        UPDATE model_rules 
        SET identifier = ?, description = ?, is_alias = ?, provider_id = ?, target_model = ?, type = ?, weight = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).bind(
        rule.identifier,
        rule.description || '',
        rule.isAlias ? 1 : 0,
        rule.providerId || null,
        rule.targetModel,
        rule.type,
        rule.weight,
        rule.isEnabled ? 1 : 0,
        rule.id
    ).run();
}

export async function addModelRule(rule: Partial<ModelRule>): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    // 检查冲突
    const { results: existing } = await env.DB.prepare(`SELECT is_alias FROM model_rules WHERE identifier = ? LIMIT 1`).bind(rule.identifier).all();
    if (existing && existing.length > 0) {
        const row = existing[0] as any;
        if (row.is_alias !== (rule.isAlias ? 1 : 0)) {
            throw new Error(`冲突：名称 "${rule.identifier}" 已被用作${row.is_alias ? '别名' : '原生模型 ID'}。`);
        }
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
        INSERT INTO model_rules (id, identifier, description, is_alias, provider_id, target_model, type, weight, is_enabled, is_auto_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        id,
        rule.identifier || '',
        rule.description || '',
        rule.isAlias ? 1 : 0,
        rule.providerId || null,
        rule.targetModel || '',
        rule.type || 'openai',
        rule.weight || 10,
        rule.isEnabled ? 1 : 0,
        0
    ).run();
}

export async function deleteModelRule(id: string): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;
    await env.DB.prepare(`DELETE FROM model_rules WHERE id = ?`).bind(id).run();
}

export async function getProviders(): Promise<ProviderConfig[]> {
    try {
        const { env } = getCloudflareContext();
        if (!env?.DB) {
            console.error("D1 DB binding missing in getProviders");
            return [];
        }

        // Fetch Providers, Keys and Rules
        const { results: providers } = await env.DB.prepare(`SELECT * FROM providers ORDER BY created_at DESC`).all<ProviderRow>();
        const { results: keys } = await env.DB.prepare(`SELECT * FROM provider_keys WHERE is_enabled = 1`).all<ProviderKeyRow>();
        const { results: rules } = await env.DB.prepare(`SELECT * FROM model_rules`).all<ModelRuleRow>();

        return (providers || []).map(p => {
            const providerKeys = (keys || [])
                .filter(k => k.provider_id === p.id)
                .map(k => ({
                    id: k.id,
                    key: k.key_value,
                    weight: k.weight,
                    isEnabled: !!k.is_enabled
                }));

            // Only expose enabled rules; disabled models/aliases should not participate in routing.
            const providerRules = (rules || []).filter(r => r.provider_id === p.id && !!r.is_enabled);
            const models = providerRules.filter(r => r.is_alias === 0).map(r => r.identifier);
            const modelAliases: Record<string, string> = {};
            providerRules.filter(r => r.is_alias === 1).forEach(r => {
                modelAliases[r.identifier] = r.target_model;
            });

            return {
                id: p.id,
                name: p.name,
                type: p.type as 'openai' | 'google' | 'anthropic',
                baseUrl: p.base_url,
                models,
                modelAliases,
                keys: providerKeys,
                isEnabled: !!p.is_enabled,
                isOnline: !!p.is_online,
                referralText: p.referral_text,
                referralLink: p.referral_link,
                homepageUrl: p.homepage_url,
                icon: p.icon || null,
                description: p.description || ''
            };
        });
    } catch (e) {
        console.error("Failed to get providers and keys from D1", e);
        return [];
    }
}

export async function addProvider(provider: ProviderConfig): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    if (!provider?.id) {
        throw new Error("新增 Provider 失败：缺少 provider.id");
    }

    const safeType = normalizeProviderType(provider.type);
    const safeName = provider.name || '';
    const safeBaseUrl = provider.baseUrl || '';
    const safeKeys = Array.isArray(provider.keys) ? provider.keys : [];
    const safeModels = Array.isArray(provider.models) ? provider.models : [];
    const safeModelAliases = provider.modelAliases && typeof provider.modelAliases === 'object' ? provider.modelAliases : {};

    // 1. Create Provider
    await env.DB.prepare(`
        INSERT INTO providers (id, name, type, base_url, is_enabled, is_online, referral_text, referral_link, homepage_url, icon, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        provider.id,
        safeName,
        safeType,
        safeBaseUrl,
        provider.isEnabled ? 1 : 0,
        provider.isOnline ? 1 : 0,
        provider.referralText || null,
        provider.referralLink || null,
        provider.homepageUrl || null,
        provider.icon || null,
        provider.description || ''
    ).run();

    // 2. Create Keys
    if (safeKeys.length > 0) {
        const stmt = env.DB.prepare(`
            INSERT INTO provider_keys (id, provider_id, key_value, weight, is_enabled)
            VALUES (?, ?, ?, ?, ?)
        `);
        const batch = safeKeys.map(k => 
            stmt.bind(k.id || crypto.randomUUID(), provider.id, k.key, k.weight, 1)
        );
        await env.DB.batch(batch);
    }

    // 3. Create Model Rules
    if (safeModels.length > 0) {
        // 检查是否与已存在的别名冲突
        const { results: existingAliases } = await env.DB.prepare(`SELECT identifier FROM model_rules WHERE is_alias = 1`).all();
        const aliasSet = new Set((existingAliases || []).map((r: any) => r.identifier));
        
        const stmt = env.DB.prepare(`
            INSERT INTO model_rules (id, identifier, description, is_alias, provider_id, target_model, type, weight, is_enabled, is_auto_synced)
            VALUES (?, ?, '', 0, ?, ?, ?, 10, 1, 1)
        `);
        const batch = safeModels.map(m => {
            if (aliasSet.has(m)) {
                throw new Error(`冲突：模型 ID "${m}" 与现有的别名重复，请先删除同名别名后再添加此供应商。`);
            }
            return stmt.bind(crypto.randomUUID(), m, provider.id, m, safeType);
        });
        await env.DB.batch(batch);
    }
    
    if (Object.keys(safeModelAliases).length > 0) {
        const stmt = env.DB.prepare(`
            INSERT INTO model_rules (id, identifier, description, is_alias, provider_id, target_model, type, weight, is_enabled, is_auto_synced)
            VALUES (?, ?, '', 1, ?, ?, ?, 10, 1, 0)
        `);
        const batch = Object.entries(safeModelAliases).map(([alias, target]) => 
            stmt.bind(crypto.randomUUID(), alias, provider.id, target, safeType)
        );
        await env.DB.batch(batch);
    }
}

export async function updateProvider(p: ProviderConfig): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    if (!p?.id) {
        throw new Error("更新 Provider 失败：缺少 provider.id");
    }

    const existing = await env.DB.prepare(
        `SELECT name, type, base_url FROM providers WHERE id = ? LIMIT 1`
    ).bind(p.id).first<{ name: string; type: string; base_url: string }>();

    if (!existing) {
        throw new Error(`更新 Provider 失败：未找到 provider.id=${p.id}`);
    }

    const safeType = normalizeProviderType(p.type, normalizeProviderType(existing.type));
    const safeName = p.name ?? existing.name;
    const safeBaseUrl = p.baseUrl ?? existing.base_url;
    const safeKeys = Array.isArray(p.keys) ? p.keys : [];
    const safeModels = Array.isArray(p.models) ? p.models : [];
    const safeModelAliases = p.modelAliases && typeof p.modelAliases === 'object' ? p.modelAliases : {};

    // 1. Update Provider Basic Info
    await env.DB.prepare(`
        UPDATE providers 
        SET name = ?, type = ?, base_url = ?, is_enabled = ?, is_online = ?, referral_text = ?, referral_link = ?, homepage_url = ?, icon = ?, description = ?
        WHERE id = ?
    `).bind(
        safeName,
        safeType,
        safeBaseUrl,
        p.isEnabled ? 1 : 0,
        p.isOnline ? 1 : 0,
        p.referralText || null,
        p.referralLink || null,
        p.homepageUrl || null,
        p.icon || null,
        p.description || '',
        p.id
    ).run();

    // 2. Sync Keys (Simple approach: Delete all and re-insert)
    await env.DB.prepare(`DELETE FROM provider_keys WHERE provider_id = ?`).bind(p.id).run();
    if (safeKeys.length > 0) {
        const stmt = env.DB.prepare(`
            INSERT INTO provider_keys (id, provider_id, key_value, weight, is_enabled)
            VALUES (?, ?, ?, ?, ?)
        `);
        const batch = safeKeys.map(k => 
            stmt.bind(k.id || crypto.randomUUID(), p.id, k.key, k.weight, k.isEnabled ? 1 : 0)
        );
        await env.DB.batch(batch);
    }

    // 3. Sync Model Rules (Only for this provider)
    await env.DB.prepare(`DELETE FROM model_rules WHERE provider_id = ?`).bind(p.id).run();
    if (safeModels.length > 0) {
        // 检查是否与已存在的别名冲突
        const { results: existingAliases } = await env.DB.prepare(`SELECT identifier FROM model_rules WHERE is_alias = 1`).all();
        const aliasSet = new Set((existingAliases || []).map((r: any) => r.identifier));

        const stmt = env.DB.prepare(`
            INSERT INTO model_rules (id, identifier, description, is_alias, provider_id, target_model, type, weight, is_enabled, is_auto_synced)
            VALUES (?, ?, '', 0, ?, ?, ?, 10, 1, 1)
        `);
        const batch = safeModels.map(m => {
            if (aliasSet.has(m)) {
                throw new Error(`冲突：模型 ID "${m}" 与现有的别名重复，请先删除同名别名后再更新此供应商。`);
            }
            return stmt.bind(crypto.randomUUID(), m, p.id, m, safeType);
        });
        await env.DB.batch(batch);
    }
    
    if (Object.keys(safeModelAliases).length > 0) {
        const stmt = env.DB.prepare(`
            INSERT INTO model_rules (id, identifier, description, is_alias, provider_id, target_model, type, weight, is_enabled, is_auto_synced)
            VALUES (?, ?, '', 1, ?, ?, ?, 10, 1, 0)
        `);
        const batch = Object.entries(safeModelAliases).map(([alias, target]) => 
            stmt.bind(crypto.randomUUID(), alias, p.id, target, safeType)
        );
        await env.DB.batch(batch);
    }
}

export async function deleteProvider(id: string): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    await env.DB.prepare(`DELETE FROM provider_keys WHERE provider_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM model_rules WHERE provider_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM providers WHERE id = ?`).bind(id).run();
}
