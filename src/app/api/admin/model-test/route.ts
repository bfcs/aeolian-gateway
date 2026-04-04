import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { assertAdminAuth } from "@/lib/server/auth";
import { writeLogToD1 } from "@/lib/server/gateway-logic";

type ProviderType = 'openai' | 'google' | 'anthropic';

type KeyInput = {
    key?: string;
    weight?: number | null;
};

type ModelTestBody = {
    providerName?: string;
    baseUrl?: string;
    type?: ProviderType;
    modelId?: string;
    keys?: KeyInput[];
};

type NormalizedKey = {
    key: string;
    weight: number;
};

const DEFAULT_KEY_WEIGHT = 10;

function normalizeKeys(keys: unknown): NormalizedKey[] {
    if (!Array.isArray(keys)) return [];
    return keys
        .map((item) => {
            const key = typeof item?.key === 'string' ? item.key.trim() : '';
            const rawWeight = typeof item?.weight === 'number' ? item.weight : DEFAULT_KEY_WEIGHT;
            const weight = Number.isFinite(rawWeight) ? rawWeight : DEFAULT_KEY_WEIGHT;
            return { key, weight };
        })
        .filter((item) => !!item.key && item.weight > 0);
}

function maskKey(key: string): string {
    if (!key) return 'N/A';
    if (key.length <= 6) return `${key.slice(0, 2)}***`;
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function buildRequest(
    baseUrl: string,
    type: ProviderType,
    apiKey: string,
    modelId: string
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    let url = baseUrl;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (!url.endsWith('/')) url += '/';

    if (type === 'google') {
        const normalizedModelId = modelId.replace('models/', '');
        url += `models/${normalizedModelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
        return {
            url,
            headers,
            body: {
                contents: [{ parts: [{ text: 'Hi' }] }]
            }
        };
    }

    if (type === 'anthropic') {
        url += 'messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        return {
            url,
            headers,
            body: {
                model: modelId,
                max_tokens: 64,
                messages: [{ role: 'user', content: 'Hi' }]
            }
        };
    }

    url += 'chat/completions';
    headers.Authorization = `Bearer ${apiKey}`;
    return {
        url,
        headers,
        body: {
            model: modelId,
            messages: [{ role: 'user', content: 'Hi' }]
        }
    };
}

function buildLogRequestPath(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.searchParams.has('key')) {
            parsed.searchParams.set('key', '[REDACTED]');
        }
        return parsed.toString();
    } catch {
        return url.replace(/([?&]key=)[^&]+/i, '$1[REDACTED]');
    }
}

function extractUsage(responseText: string) {
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    try {
        const data = JSON.parse(responseText);
        promptTokens = data.usage?.prompt_tokens || data.usageMetadata?.promptTokenCount || 0;
        completionTokens = data.usage?.completion_tokens || data.usageMetadata?.candidatesTokenCount || 0;
        if (!promptTokens) promptTokens = data.usage?.input_tokens || 0;
        if (!completionTokens) completionTokens = data.usage?.output_tokens || 0;
        totalTokens = data.usage?.total_tokens || data.usageMetadata?.totalTokenCount || (promptTokens + completionTokens);
    } catch {}

    return { promptTokens, completionTokens, totalTokens };
}

function parseJsonSafely(text: string) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

type ParsedUpstreamError = {
    message: string;
    status?: string;
    code?: string;
    type?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function readString(obj: Record<string, unknown> | null, key: string): string | undefined {
    if (!obj) return undefined;
    const value = obj[key];
    return typeof value === 'string' ? value : undefined;
}

function readStringOrNumber(obj: Record<string, unknown> | null, key: string): string | undefined {
    if (!obj) return undefined;
    const value = obj[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return undefined;
}

function extractUpstreamError(responseText: string): ParsedUpstreamError {
    const parsed = parseJsonSafely(responseText);
    const root = asRecord(parsed);
    const errorObj = asRecord(root?.error);
    const message = readString(errorObj, 'message')
        || readString(root, 'message')
        || responseText.substring(0, 300)
        || '上游请求失败';
    const status = readString(errorObj, 'status') || readString(root, 'status');
    const code = readStringOrNumber(errorObj, 'code') || readStringOrNumber(root, 'code');
    const type = readString(errorObj, 'type') || readString(root, 'type');
    return { message, status, code, type };
}

function containsAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
}

function isAuthFailureByProvider(providerType: ProviderType, httpStatus: number, parsedError: ParsedUpstreamError): boolean {
    const normalized = `${parsedError.message} ${parsedError.status || ''} ${parsedError.code || ''} ${parsedError.type || ''}`.toLowerCase();
    const hasApiKeyWords = containsAny(normalized, ['api key', 'api_key', 'x-api-key']);
    const hasAuthWords = containsAny(normalized, ['auth', 'authentication', 'unauthorized', 'invalid', 'expired', 'revoked', 'leaked', 'not valid', 'not found', 'missing']);

    if (providerType === 'openai') {
        return httpStatus === 401 || containsAny(normalized, [
            'authenticationerror',
            'invalid authentication',
            'invalid_api_key',
            'incorrect api key provided',
            'invalid api key'
        ]);
    }

    if (providerType === 'anthropic') {
        return httpStatus === 401 || containsAny(normalized, ['authentication_error']) || (hasApiKeyWords && hasAuthWords);
    }

    // Gemini: official docs list 403 PERMISSION_DENIED for key permission issues and blocked-key message.
    if (httpStatus === 401) return true;
    if (containsAny(normalized, ['your api key was reported as leaked', 'api key not valid', 'please pass a valid api key'])) {
        return true;
    }
    if ((httpStatus === 403 || (parsedError.status || '').toUpperCase() === 'PERMISSION_DENIED') && hasApiKeyWords) {
        return true;
    }
    if (containsAny(normalized, ['api_key_invalid'])) {
        return true;
    }
    return false;
}

export async function POST(req: NextRequest) {
    const isAuth = await assertAdminAuth();
    if (!isAuth) {
        return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    let body: ModelTestBody;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "无效请求体" }, { status: 400 });
    }

    const providerName = body.providerName?.trim() || 'manual-test';
    const baseUrl = body.baseUrl?.trim() || '';
    const modelId = body.modelId?.trim() || '';
    const type = (body.type || 'openai') as ProviderType;
    const keys = normalizeKeys(body.keys);

    if (!baseUrl || !modelId) {
        return NextResponse.json({ error: "缺少必要字段：baseUrl/modelId" }, { status: 400 });
    }

    if (keys.length === 0) {
        return NextResponse.json({ error: "未找到可用 key（仅测试 weight > 0 的 key）" }, { status: 400 });
    }

    const start = Date.now();
    const { env } = getCloudflareContext();
    const attempts: Array<{ keyPreview: string; error: string; status?: number; nextKeyPreview?: string }> = [];

    for (let i = 0; i < keys.length; i++) {
        const current = keys[i];
        const currentKeyPreview = maskKey(current.key);
        const nextKeyPreview = i < keys.length - 1 ? maskKey(keys[i + 1].key) : undefined;

        const { url, headers, body: upstreamBody } = buildRequest(baseUrl, type, current.key, modelId);
        const logRequestPath = buildLogRequestPath(url);
        const requestBodyStr = JSON.stringify(upstreamBody);
        const attemptStart = Date.now();

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: requestBodyStr,
                next: { revalidate: 0 }
            });

            const responseText = await res.text();
            const attemptDuration = Date.now() - attemptStart;
            const { promptTokens, completionTokens, totalTokens } = extractUsage(responseText);

            if (env) {
                await writeLogToD1(env, {
                    gatewayKeyName: `手动测试:${currentKeyPreview}`,
                    providerName,
                    providerType: type,
                    model: modelId,
                    status: res.status,
                    duration: attemptDuration,
                    promptTokens,
                    completionTokens,
                    totalTokens,
                    errorMessage: res.ok ? "" : responseText.substring(0, 500),
                    isStream: false,
                    requestMethod: "POST",
                    requestPath: logRequestPath,
                    requestBody: requestBodyStr,
                    responseBody: responseText
                });
            }

            if (res.ok) {
                return NextResponse.json({
                    success: true,
                    duration: Date.now() - start,
                    usedKey: currentKeyPreview,
                    data: parseJsonSafely(responseText) ?? responseText,
                    attempts
                });
            }

            const parsedError = extractUpstreamError(responseText);
            const errorSummary = `${res.status} ${parsedError.message}`;
            const shouldRotateKey = isAuthFailureByProvider(type, res.status, parsedError);

            attempts.push({
                keyPreview: currentKeyPreview,
                status: res.status,
                error: errorSummary,
                nextKeyPreview: shouldRotateKey ? nextKeyPreview : undefined
            });

            if (shouldRotateKey && nextKeyPreview) {
                continue;
            }

            if (shouldRotateKey) {
                return NextResponse.json({
                    success: false,
                    duration: Date.now() - start,
                    error: "全部 key 失效",
                    attempts
                });
            }

            return NextResponse.json({
                success: false,
                duration: Date.now() - start,
                error: errorSummary,
                attempts
            });
        } catch (error: unknown) {
            const attemptDuration = Date.now() - attemptStart;
            const errorMessage = error instanceof Error ? error.message : '请求失败';
            const errorStack = error instanceof Error ? (error.stack || '') : '';

            if (env) {
                await writeLogToD1(env, {
                    gatewayKeyName: `手动测试:${currentKeyPreview}`,
                    providerName,
                    providerType: type,
                    model: modelId,
                    status: 500,
                    duration: attemptDuration,
                    errorMessage,
                    requestMethod: "POST",
                    requestPath: logRequestPath,
                    requestBody: requestBodyStr,
                    responseBody: errorStack
                });
            }

            attempts.push({
                keyPreview: currentKeyPreview,
                status: 500,
                error: errorMessage
            });

            return NextResponse.json({
                success: false,
                duration: Date.now() - start,
                error: errorMessage,
                attempts
            });
        }
    }

    return NextResponse.json({
        success: false,
        duration: Date.now() - start,
        error: "全部 key 失效",
        attempts
    });
}
