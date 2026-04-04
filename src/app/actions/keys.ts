'use server'

import { revalidatePath } from "next/cache";
import { createGatewayKey, deleteGatewayKey, getGatewayKeys, toggleGatewayKey, updateGatewayKey, NewGatewayKey } from "@/lib/server/d1";
import { getModelRules } from "@/lib/server/providers";

export async function fetchGatewayKeys() {
    return await getGatewayKeys();
}

const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function normalizeModelList(models: string[]): string[] {
    return Array.from(
        new Set(
            models
                .map((m) => m.trim())
                .filter(Boolean)
        )
    );
}

async function validateAllowedModels(models: string[]): Promise<string[]> {
    const normalized = normalizeModelList(models);
    const malformed = normalized.filter((m) => !MODEL_ID_PATTERN.test(m));
    if (malformed.length > 0) {
        throw new Error(`模型 ID 格式不合法: ${malformed[0]}`);
    }

    if (normalized.length === 0) return normalized;

    const rules = await getModelRules();
    const availableModelSet = new Set(
        rules
            .filter((r) => r.isEnabled)
            .map((r) => r.identifier)
    );
    const invalid = normalized.filter((m) => !availableModelSet.has(m));
    if (invalid.length > 0) {
        throw new Error(`模型不存在或未启用: ${invalid[0]}`);
    }

    return normalized;
}

export async function createKeyAction(name: string, description: string = '', models: string[] = []) {
    try {
        // Generate a random key starting with sk-gateway-
        const key = 'sk-gateway-' + crypto.randomUUID().replace(/-/g, '');
        const validatedModels = await validateAllowedModels(models);

        const newKey: NewGatewayKey = {
            key_hash: key,
            name,
            description,
            allowed_models: validatedModels, // Empty means all
            is_enabled: true
        };

        await createGatewayKey(newKey);
        revalidatePath("/admin/keys");
        return { success: true, key }; // Return the key so UI can show it
    } catch (e: any) {
        return { success: false, error: e?.message || "创建失败" };
    }
}

export async function updateKeyAction(id: string, name: string, description: string, models: string[] = []) {
    try {
        const validatedModels = await validateAllowedModels(models);
        await updateGatewayKey(id, { name, description, allowed_models: validatedModels });
        revalidatePath("/admin/keys");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message || "更新失败" };
    }
}

export async function deleteKeyAction(id: string) {
    await deleteGatewayKey(id);
    revalidatePath("/admin/keys");
    return { success: true };
}

export async function toggleKeyAction(id: string, currentState: boolean) {
    await toggleGatewayKey(id, !currentState);
    revalidatePath("/admin/keys");
    return { success: true };
}
