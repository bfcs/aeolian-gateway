import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getAdminPassword() {
    let env: Record<string, unknown> = {};
    try {
        const ctx = getCloudflareContext();
        env = (ctx.env || {}) as unknown as Record<string, unknown>;
    } catch {
        // Fallback for dev mode
    }
    
    return (process.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD || '') as string;
}
