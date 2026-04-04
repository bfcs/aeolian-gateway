import { getCloudflareContext } from "@opennextjs/cloudflare";
import crypto from "crypto";

// Types matching our schema
export interface GatewayKey {
    id: string;
    key_hash: string;
    name: string;
    description: string;
    allowed_models: string[];
    is_enabled: boolean;
    created_at: string;
}

export type NewGatewayKey = Omit<GatewayKey, 'id' | 'created_at'>;

function parseStringArray(value: unknown): string[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(String(value));
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === "string");
    } catch {
        return [];
    }
}

export async function getGatewayKeys(): Promise<GatewayKey[]> {
    try {
        const { env } = getCloudflareContext();
        if (!env?.DB) throw new Error("D1 Binding 'DB' not found");
        
        const { results } = await env.DB.prepare(`SELECT * FROM gateway_keys ORDER BY created_at DESC`).all();

        return results.map((r: any) => ({
            id: r.id,
            key_hash: r.key_hash,
            name: r.name,
            description: r.description || '',
            allowed_models: parseStringArray(r.allowed_models),
            is_enabled: !!r.is_enabled,
            created_at: r.created_at
        }));
    } catch (e) {
        console.error("Error fetching gateway keys:", e);
        return [];
    }
}

export async function createGatewayKey(data: NewGatewayKey): Promise<void> {
    const { env } = getCloudflareContext();
    const id = crypto.randomUUID();
    await env.DB.prepare(`
    INSERT INTO gateway_keys (id, key_hash, name, description, allowed_models, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
        id,
        data.key_hash,
        data.name,
        data.description || '',
        JSON.stringify(data.allowed_models),
        data.is_enabled ? 1 : 0
    ).run();
}

export async function updateGatewayKey(id: string, data: { name?: string; description?: string; allowed_models?: string[] }): Promise<void> {
    const { env } = getCloudflareContext();
    const sets: string[] = [];
    const binds: any[] = [];

    if (data.name !== undefined) {
        sets.push("name = ?");
        binds.push(data.name);
    }
    if (data.description !== undefined) {
        sets.push("description = ?");
        binds.push(data.description);
    }
    if (data.allowed_models !== undefined) {
        sets.push("allowed_models = ?");
        binds.push(JSON.stringify(data.allowed_models));
    }

    if (sets.length === 0) return;

    binds.push(id);
    await env.DB.prepare(`UPDATE gateway_keys SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();
}

export async function deleteGatewayKey(id: string): Promise<void> {
    const { env } = getCloudflareContext();
    await env.DB.prepare(`DELETE FROM gateway_keys WHERE id = ?`).bind(id).run();
}

export async function toggleGatewayKey(id: string, isEnabled: boolean): Promise<void> {
    const { env } = getCloudflareContext();
    await env.DB.prepare(`UPDATE gateway_keys SET is_enabled = ? WHERE id = ?`)
        .bind(isEnabled ? 1 : 0, id)
        .run();
}

export async function getGatewayKeyByHash(key: string): Promise<GatewayKey | null> {
    const { env } = getCloudflareContext();
    const result = await env.DB.prepare(`SELECT * FROM gateway_keys WHERE key_hash = ? AND is_enabled = 1`).bind(key).first();
    if (!result) return null;
    return {
        id: String(result.id),
        key_hash: String(result.key_hash),
        name: String(result.name),
        description: String(result.description || ''),
        allowed_models: parseStringArray(result.allowed_models),
        is_enabled: !!result.is_enabled,
        created_at: String(result.created_at || '')
    } as GatewayKey;
}

// --- Playground Projects ---

export interface PlaygroundProject {
    id: string;
    name: string;
    state: any;
    updated_at: string;
    created_at: string;
}

export type NewPlaygroundProject = {
    name: string;
    state: any;
};

export async function getPlaygroundProjects(): Promise<PlaygroundProject[]> {
    const { env } = getCloudflareContext();
    const { results } = await env.DB.prepare(`SELECT * FROM playground_projects ORDER BY updated_at DESC`).all();
    return results.map((r: any) => ({
        ...r,
        state: r.state ? JSON.parse(r.state) : null
    }));
}

export async function getPlaygroundProject(id: string): Promise<PlaygroundProject | null> {
    const { env } = getCloudflareContext();
    const result: any = await env.DB.prepare(`SELECT * FROM playground_projects WHERE id = ?`).bind(id).first();
    if (!result) return null;
    return {
        ...result,
        state: result.state ? JSON.parse(result.state) : null
    };
}

export async function createPlaygroundProject(data: NewPlaygroundProject): Promise<PlaygroundProject> {
    const { env } = getCloudflareContext();
    if (!env?.DB) {
        console.error("[D1] 数据库绑定 'DB' 未找到");
        throw new Error("数据库连接失败");
    }

    try {
        const id = crypto.randomUUID();
        const result = await env.DB.prepare(`
            INSERT INTO playground_projects (id, name, state, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) RETURNING *
        `).bind(id, data.name, JSON.stringify(data.state)).first();

        if (!result) {
            throw new Error("数据库未返回创建结果");
        }

        return {
            ...result,
            state: result.state ? JSON.parse(result.state as string) : null
        } as PlaygroundProject;
    } catch (e) {
        console.error("[D1] createPlaygroundProject 发生异常:", e);
        throw e;
    }
}

export async function updatePlaygroundProject(id: string, data: Partial<NewPlaygroundProject>): Promise<void> {
    const { env } = getCloudflareContext();
    const sets: string[] = [];
    const binds: any[] = [];

    if (data.name !== undefined) {
        sets.push("name = ?");
        binds.push(data.name);
    }
    if (data.state !== undefined) {
        sets.push("state = ?");
        binds.push(JSON.stringify(data.state));
    }

    sets.push("updated_at = CURRENT_TIMESTAMP");
    binds.push(id);

    if (sets.length > 1) { // includes updated_at
        await env.DB.prepare(`UPDATE playground_projects SET ${sets.join(", ")} WHERE id = ?`)
            .bind(...binds)
            .run();
    }
}

export async function deletePlaygroundProject(id: string): Promise<void> {
    const { env } = getCloudflareContext();
    await env.DB.prepare(`DELETE FROM playground_projects WHERE id = ?`).bind(id).run();
}

/**
 * Cleanup Logs
 */
export async function cleanupLogs(): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    try {
        await env.DB.prepare(`
            DELETE FROM request_logs 
            WHERE id NOT IN (
                SELECT id FROM request_logs 
                ORDER BY timestamp DESC 
                LIMIT 50
            )
        `).run();
    } catch (e) {
        console.error("Failed to aggressively cleanup logs", e);
    }
}

/**
 * Utility function to migrate existing auto-incremented integer IDs to UUIDs.
 */
export async function migrateIdsToUuid(): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    const tables = ["gateway_keys", "playground_projects", "provider_keys", "model_rules"];
    
    for (const table of tables) {
        try {
            // First find all integer ids
            const { results } = await env.DB.prepare(`SELECT id FROM ${table}`).all();
            
            const updates = [];
            for (const row of results) {
                // If it's a number or looks like a number, change it
                if (typeof row.id === "number" || (typeof row.id === "string" && !row.id.includes("-"))) {
                    const newId = crypto.randomUUID();
                    updates.push(env.DB.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).bind(newId, row.id));
                }
            }

            if (updates.length > 0) {
                await env.DB.batch(updates);

            }
        } catch (e) {
            console.error(`Failed to migrate IDs in ${table}:`, e);
        }
    }
}
