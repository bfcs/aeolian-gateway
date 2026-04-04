'use server';

import { getConfig, setConfig } from "@/lib/server/configs";
import { cleanupLogs } from "@/lib/server/gateway-logic";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";

export async function getSubscriptionUrlAction() {
    return await getConfig("subscription_url");
}

export async function setSubscriptionUrlAction(url: string) {
    await setConfig("subscription_url", url);
    revalidatePath('/admin/settings');
    revalidatePath('/admin/providers');
}

export async function getLogSettingsAction() {
    return {
        log_entry_count: parseInt(await getConfig("log_entry_count") || "50"),
        max_body_chars: parseInt(await getConfig("max_body_chars") || "10000")
    };
}

export async function setLogSettingsAction(settings: { log_entry_count: number, max_body_chars: number }) {
    await setConfig("log_entry_count", String(settings.log_entry_count));
    await setConfig("max_body_chars", String(settings.max_body_chars));

    // Trigger immediate cleanup to enforce the new limit
    try {
        const { env } = getCloudflareContext();
        if (env?.DB) {
            await cleanupLogs(env.DB, settings.log_entry_count);
        }
    } catch (e) {
        console.error("Failed to trigger immediate log cleanup:", e);
    }

    revalidatePath('/admin/settings');
    revalidatePath('/admin/logs');
}
