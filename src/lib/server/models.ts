import { NextRequest, NextResponse } from "next/server";
import { getGatewayKeyByHash } from "@/lib/server/d1";
import { getModelRules, getProviders } from "@/lib/server/providers";

/**
 * 从请求中提取 API Token（支持 Bearer / query key / x-goog-api-key）
 */
function extractToken(req: NextRequest): string {
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.split(" ")[1];
    }
    const url = new URL(req.url);
    const queryKey = url.searchParams.get("key");
    if (queryKey) return queryKey;

    const googKey = req.headers.get("x-goog-api-key");
    if (googKey) return googKey;

    const anthropicKey = req.headers.get("x-api-key");
    if (anthropicKey) return anthropicKey;

    return "";
}

async function getAvailableProviderIds(type: 'openai' | 'google' | 'anthropic'): Promise<Set<string>> {
    const providers = await getProviders();
    const ids = providers
        .filter(p => p.type === type && p.isEnabled && p.keys.some(k => k.isEnabled))
        .map(p => p.id);
    return new Set(ids);
}

/**
 * 处理 /api/v1/models 请求，返回 OpenAI List Models 格式
 */
export async function handleOpenAIModels(req: NextRequest): Promise<NextResponse> {
    const token = extractToken(req);
    if (!token) {
        return NextResponse.json({ error: "Missing or invalid Authorization header, x-goog-api-key or key param" }, { status: 401 });
    }

    const gatewayKey = await getGatewayKeyByHash(token);
    if (!gatewayKey) {
        return NextResponse.json({ error: "Invalid API Key" }, { status: 401 });
    }

    // 从 model_rules 表获取唯一的 OpenAI identifier
    const rules = await getModelRules('openai');
    const availableProviderIds = await getAvailableProviderIds('openai');
    const modelSet = new Set<string>();
    
    rules.forEach(r => {
        if (!r.isEnabled) return;
        if (!r.providerId || !availableProviderIds.has(r.providerId)) return;
        if (gatewayKey.allowed_models?.length && !gatewayKey.allowed_models.includes(r.identifier)) return;
        modelSet.add(r.identifier);
    });

    const models = Array.from(modelSet).sort();
    const now = Math.floor(Date.now() / 1000);

    return NextResponse.json({
        object: "list",
        data: models.map(id => ({
            id,
            object: "model",
            created: now,
            owned_by: "ai-gateway"
        }))
    });
}

/**
 * 处理 /api/v1beta/models 请求，返回 Gemini List Models 格式
 */
export async function handleGeminiModels(req: NextRequest): Promise<NextResponse> {
    const token = extractToken(req);
    if (!token) {
        return NextResponse.json({ error: "Missing or invalid Authorization header, x-goog-api-key or key param" }, { status: 401 });
    }

    const gatewayKey = await getGatewayKeyByHash(token);
    if (!gatewayKey) {
        return NextResponse.json({ error: "Invalid API Key" }, { status: 401 });
    }

    // 从 model_rules 表获取唯一的 Gemini identifier
    const rules = await getModelRules('google');
    const availableProviderIds = await getAvailableProviderIds('google');
    const modelSet = new Set<string>();
    
    rules.forEach(r => {
        if (!r.isEnabled) return;
        if (!r.providerId || !availableProviderIds.has(r.providerId)) return;
        if (gatewayKey.allowed_models?.length && !gatewayKey.allowed_models.includes(r.identifier)) return;
        modelSet.add(r.identifier);
    });

    const models = Array.from(modelSet).sort();

    return NextResponse.json({
        models: models.map(id => {
            const displayName = id.replace('models/', '');
            return {
                name: id.startsWith('models/') ? id : `models/${id}`,
                displayName,
                supportedGenerationMethods: ["generateContent", "streamGenerateContent"]
            };
        })
    });
}

/**
 * 处理 /api/anthropic/models 请求，返回 Anthropic List Models 格式
 */
export async function handleAnthropicModels(req: NextRequest): Promise<NextResponse> {
    const token = extractToken(req);
    if (!token) {
        return NextResponse.json({ error: { type: "authentication_error", message: "Missing or invalid Authorization header, x-goog-api-key, x-api-key or key param" } }, { status: 401 });
    }

    const gatewayKey = await getGatewayKeyByHash(token);
    if (!gatewayKey) {
        return NextResponse.json({ error: { type: "authentication_error", message: "Invalid API Key" } }, { status: 401 });
    }

    // 从 model_rules 表获取唯一的 anthropic identifier
    const rules = await getModelRules('anthropic');
    const availableProviderIds = await getAvailableProviderIds('anthropic');
    const modelSet = new Set<string>();
    
    rules.forEach(r => {
        if (!r.isEnabled) return;
        if (!r.providerId || !availableProviderIds.has(r.providerId)) return;
        if (gatewayKey.allowed_models?.length && !gatewayKey.allowed_models.includes(r.identifier)) return;
        modelSet.add(r.identifier);
    });

    const models = Array.from(modelSet).sort();

    return NextResponse.json({
        type: "model_list",
        data: models.map(id => ({
            type: "model",
            id: id,
            display_name: id,
            created_at: new Date().toISOString()
        })),
        has_more: false,
        first_id: models[0] || null,
        last_id: models[models.length - 1] || null
    });
}
