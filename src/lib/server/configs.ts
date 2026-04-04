import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getConfig(key: string): Promise<string | null> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return null;

    try {
        const result: any = await env.DB.prepare(`SELECT value FROM configs WHERE key = ?`).bind(key).first();
        if (result) {
            return result.value || null;
        }
        return null;
    } catch (e) {
        console.error("Failed to get config:", e);
        return null;
    }
}

export async function setConfig(key: string, value: string): Promise<void> {
    const { env } = getCloudflareContext();
    if (!env?.DB) return;

    try {
        await env.DB.prepare(`
            INSERT INTO configs (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).bind(key, value).run();
    } catch (e) {
        console.error("Failed to set config:", e);
    }
}
