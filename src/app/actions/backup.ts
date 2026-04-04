'use server';

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";

export async function exportConfigAction() {
    const { env } = getCloudflareContext();
    if (!env?.DB) throw new Error("D1 数据库未绑定");

    const [
        { results: providers },
        { results: providerKeys },
        { results: modelRules },
        { results: gatewayKeys },
        { results: playgroundProjects }
    ] = await env.DB.batch([
        env.DB.prepare(`SELECT * FROM providers`),
        env.DB.prepare(`SELECT * FROM provider_keys`),
        env.DB.prepare(`SELECT * FROM model_rules`),
        env.DB.prepare(`SELECT * FROM gateway_keys`),
        env.DB.prepare(`SELECT * FROM playground_projects`)
    ]);

    const stripDatesAndReferrals = (arr: any[]) => arr.map(({ created_at, updated_at, referral_text, referral_link, ...rest }: any) => rest);
    const stripDates = (arr: any[]) => arr.map(({ created_at, updated_at, ...rest }: any) => rest);
    const stripGatewayKeyFields = (arr: any[]) => arr.map((item: any) => ({
        id: item.id,
        key_hash: item.key_hash,
        name: item.name,
        description: item.description || '',
        allowed_models: item.allowed_models,
        is_enabled: item.is_enabled
    }));

    return {
        version: "1.0",
        timestamp: new Date().toISOString(),
        data: {
            providers: stripDatesAndReferrals(providers as any[]),
            providerKeys: stripDates(providerKeys as any[]),
            modelRules: stripDates(modelRules as any[]),
            gatewayKeys: stripGatewayKeyFields(gatewayKeys as any[]),
            playgroundProjects: stripDates(playgroundProjects as any[])
        }
    };
}

export async function importConfigAction(backupData: any) {
    const { env } = getCloudflareContext();
    if (!env?.DB) throw new Error("D1 数据库未绑定");

    if (!backupData || backupData.version !== "1.0" || !backupData.data) {
        throw new Error("无效的备份文件格式");
    }

    const { providers, providerKeys, modelRules, gatewayKeys, playgroundProjects } = backupData.data;

    try {
        const statements: any[] = [];

        // 1. 导入 Providers
        if (Array.isArray(providers)) {
            for (const p of providers) {
                statements.push(env.DB.prepare(`
                    INSERT OR REPLACE INTO providers (id, name, type, base_url, is_enabled, is_online, referral_text, referral_link, homepage_url, icon, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    p.id,
                    p.name,
                    p.type,
                    p.base_url,
                    p.is_enabled,
                    p.is_online ?? 0,
                    p.referral_text || null,
                    p.referral_link || null,
                    p.homepage_url || null,
                    p.icon || null,
                    p.description || ''
                ));
            }
        }

        // 2. 导入 Provider Keys
        if (Array.isArray(providerKeys)) {
            for (const k of providerKeys) {
                statements.push(env.DB.prepare(`
                    INSERT OR REPLACE INTO provider_keys (id, provider_id, key_value, weight, is_enabled)
                    VALUES (?, ?, ?, ?, ?)
                `).bind(k.id, k.provider_id, k.key_value, k.weight, k.is_enabled));
            }
        }

        // 3. 导入 Model Rules
        if (Array.isArray(modelRules)) {
            for (const r of modelRules) {
                statements.push(env.DB.prepare(`
                    INSERT OR REPLACE INTO model_rules (id, identifier, description, is_alias, provider_id, target_model, type, weight, is_enabled, is_auto_synced)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(r.id, r.identifier, r.description, r.is_alias, r.provider_id, r.target_model, r.type, r.weight, r.is_enabled, r.is_auto_synced));
            }
        }

        // 4. 导入 Gateway Keys
        if (Array.isArray(gatewayKeys)) {
            for (const g of gatewayKeys) {
                statements.push(env.DB.prepare(`
                    INSERT OR REPLACE INTO gateway_keys (id, key_hash, name, description, allowed_models, is_enabled)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).bind(g.id, g.key_hash, g.name, g.description, g.allowed_models, g.is_enabled));
            }
        }

        // 5. 导入 Playground Projects
        if (Array.isArray(playgroundProjects)) {
            for (const pj of playgroundProjects) {
                statements.push(env.DB.prepare(`
                    INSERT OR REPLACE INTO playground_projects (id, name, state)
                    VALUES (?, ?, ?)
                `).bind(pj.id, pj.name, pj.state));
            }
        }



        if (statements.length > 0) {
            await env.DB.batch(statements);
        }

        revalidatePath('/admin/settings');
        revalidatePath('/admin/providers');
        revalidatePath('/admin/aliases');
        revalidatePath('/admin/keys');

        return { success: true, count: statements.length };
    } catch (e: any) {
        console.error("导入失败:", e);
        throw new Error("数据库导入失败: " + e.message);
    }
}
