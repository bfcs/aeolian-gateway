import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getGatewayKeyByHash } from "@/lib/server/d1";
import { getProviders, getModelRules } from "@/lib/server/providers";
import { executeUpstreamRequest, writeLogToD1 } from "@/lib/server/gateway-logic";

type ProviderType = 'openai' | 'google' | 'anthropic';

function getContext() {
    // @ts-ignore
    if (typeof getCloudflareContext === 'function') { return getCloudflareContext(); }
    throw new Error("找不到 getCloudflareContext");
}

function normalizePathSuffix(pathSuffix: string): string {
    return (pathSuffix || "").replace(/^\/+|\/+$/g, "").toLowerCase();
}

function isMultipartFormData(contentType: string | null): boolean {
    return (contentType || "").toLowerCase().includes("multipart/form-data");
}

function cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function extractGeminiThoughtCarrier(message: Record<string, any>): Record<string, any> | null {
    if (message.extra_content && typeof message.extra_content === "object") {
        return cloneJsonValue(message.extra_content);
    }
    if (typeof message.thought_signature === "string" && message.thought_signature) {
        return { google: { thought_signature: message.thought_signature } };
    }
    if (typeof message.google?.thought_signature === "string" && message.google.thought_signature) {
        return { google: { thought_signature: message.google.thought_signature } };
    }
    return null;
}

function appendSummaryValue(summary: Record<string, unknown>, key: string, value: unknown) {
    if (!(key in summary)) {
        summary[key] = value;
        return;
    }
    const current = summary[key];
    summary[key] = Array.isArray(current) ? [...current, value] : [current, value];
}

function summarizeFormData(formData: FormData): string {
    const summary: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
            appendSummaryValue(summary, key, value);
            continue;
        }
        appendSummaryValue(summary, key, {
            name: value.name,
            type: value.type,
            size: value.size,
        });
    }
    return JSON.stringify(summary);
}

function cloneFormData(formData: FormData): FormData {
    const copy = new FormData();
    for (const [key, value] of formData.entries()) {
        copy.append(key, value);
    }
    return copy;
}

const GEMINI_OPENAI_COMPAT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

function normalizeBaseUrl(baseUrl: string): string {
    return (baseUrl || "").replace(/\/+$/, "");
}

function isGeminiOpenAICompatibleBaseUrl(baseUrl: string): boolean {
    return normalizeBaseUrl(baseUrl) === GEMINI_OPENAI_COMPAT_BASE_URL;
}

function stripGoogleModelPrefix(model: string): string {
    return model.startsWith("models/") ? model.slice("models/".length) : model;
}

function addUniqueModelVariant(variants: string[], model: string | null | undefined) {
    const normalized = (model || "").trim();
    if (!normalized || variants.includes(normalized)) return;
    variants.push(normalized);
}

function extractPathModel(pathSuffix: string): string | null {
    const modelMatch = pathSuffix.match(/models\/([^/:]+)/);
    return modelMatch?.[1] ? `models/${modelMatch[1]}` : null;
}

function buildRequestedModelVariants({
    requestedModel,
    explicitProviderType,
    pathSuffix,
}: {
    requestedModel: string,
    explicitProviderType: ProviderType | null,
    pathSuffix: string,
}): string[] {
    const variants: string[] = [];
    const routeHintType = inferProviderTypeFromPath(pathSuffix);
    const pathModel = extractPathModel(pathSuffix);

    addUniqueModelVariant(variants, requestedModel);
    addUniqueModelVariant(variants, pathModel);

    const shouldAddGoogleVariants = explicitProviderType === 'google' || routeHintType === 'google' || !!pathModel;
    if (shouldAddGoogleVariants) {
        for (const model of [...variants]) {
            const stripped = stripGoogleModelPrefix(model);
            addUniqueModelVariant(variants, stripped);
            addUniqueModelVariant(variants, `models/${stripped}`);
        }
    }

    return variants;
}

function inferProviderTypeFromPath(pathSuffix: string): ProviderType | null {
    const normalized = normalizePathSuffix(pathSuffix);
    if (!normalized) return null;

    // Anthropic-style endpoint
    if (normalized === 'messages' || normalized.endsWith('/messages')) {
        return 'anthropic';
    }

    // Google native endpoint
    if (normalized.includes(':generatecontent') || normalized.includes(':streamgeneratecontent')) {
        return 'google';
    }

    // OpenAI-style endpoints
    const openaiRoutePatterns = [
        'chat/completions',
        'responses',
        'embeddings',
        'audio/speech',
        'audio/transcriptions',
        'images/generations',
    ];
    if (openaiRoutePatterns.some(pattern => normalized === pattern || normalized.endsWith(`/${pattern}`))) {
        return 'openai';
    }

    return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const start = Date.now();
    let gatewayKeyName = "anonymous", requestedModel = "unknown", thinkingLevel: string | undefined = undefined;
    const { path: segments = [] } = await params;
    const pathSegments = [...segments];
    let explicitProviderType: ProviderType | null = null;
    if (pathSegments[0] === 'openai') { explicitProviderType = 'openai'; pathSegments.shift(); }
    else if (pathSegments[0] === 'google') { explicitProviderType = 'google'; pathSegments.shift(); }
    else if (pathSegments[0] === 'anthropic') { explicitProviderType = 'anthropic'; pathSegments.shift(); }
    const pathSuffix = pathSegments.join('/');

    let env: any = null, ctx: any = null;
    try { const cfContext = getContext(); env = cfContext?.env; ctx = cfContext?.ctx; } catch (e) { }

    let bodyText = "";
    let body: any = null;
    let multipartFormData: FormData | null = null;
    const sendError = async (status: number, msg: string, details?: any) => {
        await writeLogToD1(env, { gatewayKeyName, providerName: "gateway", model: requestedModel, status, duration: Date.now() - start, errorMessage: details ? `${msg}: ${details}` : msg, isStream: false, requestMethod: "POST", requestPath: new URL(req.url).pathname, requestBody: bodyText, responseBody: JSON.stringify({ error: msg, details }) });
        return NextResponse.json({ error: msg, details }, { status });
    };

    try {
        const token = req.headers.get("Authorization")?.split(" ")[1]
            || new URL(req.url).searchParams.get("key")
            || req.headers.get("x-goog-api-key")
            || req.headers.get("x-api-key")
            || "";
        if (!token) return await sendError(401, "缺少 API 密钥");
        const gatewayKey = await getGatewayKeyByHash(token);
        if (!gatewayKey) return await sendError(401, "无效的 API 密钥");
        gatewayKeyName = gatewayKey.name;

        const requestContentType = req.headers.get("Content-Type");
        if (isMultipartFormData(requestContentType)) {
            multipartFormData = await req.formData();
            bodyText = summarizeFormData(multipartFormData);
            const multipartModel = multipartFormData.get("model");
            if (typeof multipartModel === "string" && multipartModel.trim()) {
                requestedModel = multipartModel.trim();
            }

        } else {
            bodyText = await req.text();
        }

        if (bodyText && !multipartFormData) {
            try {
                body = JSON.parse(bodyText);
                requestedModel = body.model || requestedModel;
                thinkingLevel = body.reasoning_effort || body.extra_body?.google?.thinking_config?.thinking_level || body.google?.thinking_config?.thinking_level;
                if (body.messages && Array.isArray(body.messages)) {
                    const toolCallMsgs = body.messages.filter((m: any) => m && m.tool_calls).length;

                } else {

                }
            } catch (e) { }
        }

        if (requestedModel === "unknown" && pathSuffix) {
            const pathModel = extractPathModel(pathSuffix);
            if (pathModel) {
                requestedModel = pathModel;
            }
        }

        const isRetryDryRun = req.headers.get("x-retry-dry-run") === "true";
        const isDryRun = req.headers.get("x-dry-run") === "true";
        const requestedModelVariants = buildRequestedModelVariants({ requestedModel, explicitProviderType, pathSuffix });
        const allRules = (await Promise.all(
            requestedModelVariants.map(modelVariant => getModelRules(explicitProviderType || undefined, modelVariant))
        )).flat();
        const uniqueRules = allRules.filter((rule, index, rules) => rules.findIndex(candidate => candidate.id === rule.id) === index);
        const eligibleRules = uniqueRules.filter(r => {
            if (!r.isEnabled) return false;
            if (gatewayKey.allowed_models?.length && !requestedModelVariants.some(modelVariant => gatewayKey.allowed_models.includes(modelVariant))) return false;
            return true;
        });

        const allProviders = await getProviders();
        const providerMap = new Map(allProviders.map(p => [p.id, p]));
        const routableRules = eligibleRules.filter(r => {
            if (!r.providerId) return false;
            const provider = providerMap.get(r.providerId);
            if (!provider || !provider.isEnabled) return false;
            const enabledKeys = provider.keys.filter(k => k.isEnabled);
            return enabledKeys.length > 0;
        });

        // --- 诊断模式下的“无可路由规则”快速返回 ---
        if (routableRules.length === 0) {
            const hasAnyRule = eligibleRules.length > 0;
            const error = hasAnyRule
                ? "命中规则但关联供应商不可用或无可用密钥"
                : `没有可用于模型 '${requestedModel}' 的匹配规则`;

            if (!isDryRun) {
                return await sendError(503, hasAnyRule ? "命中模型规则但关联供应商不可用或无可用密钥" : `没有可用于模型 '${requestedModel}' 的模型供应商`);
            }
            return NextResponse.json({
                dry_run: true,
                error,
                selected_provider: "none",
                selected_provider_type: "none",
                target_model: "none",
                thinking_level: thinkingLevel
            });
        }

        // 挑选规则（仅在可路由规则集合中）
        const aliasRules = routableRules.filter(r => r.isAlias);
        let candidates = aliasRules.length > 0 ? aliasRules : routableRules;
        const routeHintType = inferProviderTypeFromPath(pathSuffix);

        // 第二层：当同一模型存在多种 Provider Type 时，按请求路由语义做类型约束
        if (!explicitProviderType) {
            const candidateTypes = Array.from(new Set(
                candidates
                    .map(r => r.providerId ? providerMap.get(r.providerId)?.type : undefined)
                    .filter(Boolean)
            )) as ProviderType[];

            if (candidateTypes.length > 1 && routeHintType) {
                const typedCandidates = candidates.filter(r => {
                    if (!r.providerId) return false;
                    const provider = providerMap.get(r.providerId);
                    return provider?.type === routeHintType;
                });
                if (typedCandidates.length > 0) {
                    candidates = typedCandidates;
                }
            }
        }

        let selectedRule = candidates[0];
        if (candidates.length > 1) {
            const totalWeight = candidates.reduce((sum, r) => sum + r.weight, 0);
            let random = Math.random() * totalWeight;
            for (const r of candidates) {
                random -= r.weight;
                if (random <= 0) { selectedRule = r; break; }
            }
        }

        // --- 获取供应商决策 ---
        const selectedProvider = selectedRule.providerId ? providerMap.get(selectedRule.providerId) : undefined;
        
        if (!selectedProvider || !selectedProvider.isEnabled) {
            if (isDryRun) {
                return NextResponse.json({
                    dry_run: true,
                    error: "命中规则但关联供应商不可用或未找到",
                    selected_provider: "none",
                    selected_provider_type: "none",
                    target_model: selectedRule.targetModel || "none"
                });
            }
            return await sendError(503, "供应商不可用");
        }

        const enabledKeys = selectedProvider.keys.filter(k => k.isEnabled);
        if (enabledKeys.length === 0) {
            if (isDryRun) {
                return NextResponse.json({
                    dry_run: true,
                    error: "供应商无可用密钥",
                    selected_provider: selectedProvider.name,
                    selected_provider_type: selectedProvider.type,
                    target_model: selectedRule?.targetModel || "none"
                });
            }
            return await sendError(503, "供应商没有可用密钥");
        }

        // --- 核心重试与负载均衡逻辑 ---
        const maxRetries = Math.min(enabledKeys.length, 3);
        const attemptedKeys: string[] = [];
        const usedKeyIndexes = new Set<number>();
        let lastRes: Response | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            // 选择尚未尝试过的 Key
            const remainingKeys = enabledKeys.filter((_, idx) => !usedKeyIndexes.has(idx));
            if (remainingKeys.length === 0) break;

            let selectedIdx = 0;
            if (remainingKeys.length > 1) {
                const totalWeight = remainingKeys.reduce((sum, k) => sum + k.weight, 0);
                let random = Math.random() * totalWeight;
                for (let i = 0; i < remainingKeys.length; i++) {
                    random -= remainingKeys[i].weight;
                    if (random <= 0) { selectedIdx = i; break; }
                }
            }

            const selectedKeyConfig = remainingKeys[selectedIdx];
            usedKeyIndexes.add(enabledKeys.indexOf(selectedKeyConfig));
            attemptedKeys.push(selectedKeyConfig.key.substring(0, 8) + "...");

            // 1. 处理重试预检逻辑
            if (isRetryDryRun) {
                if (attempt < maxRetries - 1) continue; 
                return NextResponse.json({
                    retry_dry_run: true,
                    attempted_keys: attemptedKeys,
                    alias_name: selectedRule?.isAlias ? selectedRule.identifier : null,
                    target_model: selectedRule?.targetModel || requestedModel
                }, { status: 429 });
            }

            // 2. 构建与协议修复
            let payload: BodyInit | null = bodyText;
            let requestBodyForLog = bodyText;
            const transformedBody = body ? cloneJsonValue(body) : null;
            let transformedFormData: FormData | null = null;

            if (transformedBody) {
                transformedBody.model = selectedRule?.targetModel || requestedModel;
                const isGeminiOpenAICompatible = isGeminiOpenAICompatibleBaseUrl(selectedProvider.baseUrl);

                if (isGeminiOpenAICompatible && Object.prototype.hasOwnProperty.call(transformedBody, 'store')) {
                    delete transformedBody.store;

                }
                
                if (isGeminiOpenAICompatible && transformedBody.messages) {
                    transformedBody.messages.forEach((msg: any) => {
                        if ((msg.role === 'assistant' || msg.role === 'model') && msg.tool_calls) {
                            const messageExtraContent = extractGeminiThoughtCarrier(msg);
                            if (msg.content === "") {
                                delete msg.content;
                            }

                            const cleanToolCalls = msg.tool_calls.map((tc: any) => {
                                const cleaned: any = {};
                                if (tc.id) {
                                    if (tc.id.includes('::')) {
                                        const lastIdx = tc.id.lastIndexOf('::');
                                        const origId = tc.id.substring(0, lastIdx);
                                        const encoded = tc.id.substring(lastIdx + 2);
                                        cleaned.id = origId;
                                        try {
                                            cleaned.extra_content = JSON.parse(atob(encoded));

                                        } catch (e: any) {
                                            console.error(`[GATEWAY ERROR] Failed to decode extra_content from ID "${tc.id}": ${e?.message}`);
                                            cleaned.id = origId;
                                        }
                                    } else {
                                        cleaned.id = tc.id;
                                    }
                                }
                                if (tc.type) cleaned.type = tc.type;
                                if (tc.function) {
                                    cleaned.function = {
                                        name: tc.function.name,
                                        arguments: tc.function.arguments
                                    };
                                }
                                if (tc.extra_content && !cleaned.extra_content) {
                                    cleaned.extra_content = tc.extra_content;
                                }
                                if (!cleaned.extra_content && messageExtraContent) {
                                    cleaned.extra_content = cloneJsonValue(messageExtraContent);
                                }
                                return cleaned;
                            });
                            msg.tool_calls = cleanToolCalls;
                            delete msg.extra_content;
                            delete msg.thought_signature;
                            if (msg.google && typeof msg.google === "object") {
                                delete msg.google.thought_signature;
                                if (Object.keys(msg.google).length === 0) {
                                    delete msg.google;
                                }
                            }
                        }

                        if (msg.role === 'tool') {
                            if (msg.tool_call_id && msg.tool_call_id.includes('::')) {
                                const lastIdx = msg.tool_call_id.lastIndexOf('::');
                                msg.tool_call_id = msg.tool_call_id.substring(0, lastIdx);
                            }

                            if (typeof msg.content === 'string') {
                                try {
                                    JSON.parse(msg.content);
                                } catch (e) {
                                    msg.content = JSON.stringify({ result: msg.content });
                                }
                            }
                        }
                    });
                }
                
                // 特殊字段透传 (如 reasoning_effort)
                if (body.reasoning_effort) transformedBody.reasoning_effort = body.reasoning_effort;

                if (transformedBody.stream === true && !transformedBody.stream_options?.include_usage) {
                    transformedBody.stream_options = { ...transformedBody.stream_options, include_usage: true };
                }
                payload = JSON.stringify(transformedBody);
                requestBodyForLog = payload as string;
                if (isGeminiOpenAICompatible && transformedBody.messages && Array.isArray(transformedBody.messages)) {
                    try {
                        const msgSummary = transformedBody.messages.map((m: any) => ({
                            role: m.role,
                            hasToolCalls: !!m.tool_calls,
                            hasThoughtSignature: !!m.thought_signature
                        }));

                    } catch { }
                }
            } else if (multipartFormData) {
                transformedFormData = cloneFormData(multipartFormData);
                transformedFormData.set("model", selectedRule?.targetModel || requestedModel);
                payload = transformedFormData;
                requestBodyForLog = summarizeFormData(transformedFormData);
            }

            if (isDryRun) {
                return NextResponse.json({
                    dry_run: true,
                    selected_provider: selectedProvider.name,
                    selected_provider_type: selectedProvider.type,
                    target_model: selectedRule?.targetModel || requestedModel,
                    selected_key: attemptedKeys.length > 0 ? attemptedKeys[0] : "none",
                    thinking_level: thinkingLevel,
                    route_hint_type: routeHintType,
                    explicit_provider_type: explicitProviderType,
                    debug_payload: transformedBody,
                    debug_form_data: transformedFormData ? JSON.parse(requestBodyForLog) : undefined
                });
            }

            // 3. 构建请求地址与 Header
            let targetUrl = selectedProvider.baseUrl.endsWith('/') ? selectedProvider.baseUrl.slice(0, -1) : selectedProvider.baseUrl;
            if (pathSuffix) {
                const suffixSegments = pathSuffix.split('/');
                const baseSegments = targetUrl.split('/');
                if (baseSegments.length > 0 && suffixSegments.length > 0 && baseSegments[baseSegments.length - 1] === suffixSegments[0]) {
                    targetUrl = baseSegments.slice(0, -1).join('/');
                }
                targetUrl += '/' + pathSuffix;
            }
            const pathModel = extractPathModel(pathSuffix);
            const modelTokenToReplace = pathModel && targetUrl.includes(pathModel) ? pathModel : requestedModel;
            if (selectedRule.targetModel && targetUrl.includes(modelTokenToReplace)) {
                targetUrl = targetUrl.replace(modelTokenToReplace, selectedRule.targetModel);
            }

            const upstreamHeaders = new Headers(req.headers);
            ["Host", "Content-Length", "x-goog-api-key", "x-api-key"].forEach(h => upstreamHeaders.delete(h));
            if (transformedFormData) {
                upstreamHeaders.delete("Content-Type");
            } else {
                upstreamHeaders.set("Content-Type", "application/json");
            }

            if (selectedProvider.type === 'google' && !selectedProvider.baseUrl.includes("/openai/")) {
                upstreamHeaders.delete("Authorization");
                upstreamHeaders.set("x-goog-api-key", selectedKeyConfig.key);
            } else if (selectedProvider.type === 'anthropic') {
                upstreamHeaders.delete("Authorization");
                upstreamHeaders.set("x-api-key", selectedKeyConfig.key);
                if (!upstreamHeaders.has("anthropic-version")) upstreamHeaders.set("anthropic-version", "2023-06-01");
            } else {
                upstreamHeaders.set("Authorization", `Bearer ${selectedKeyConfig.key}`);
            }

            // 4. 执行上游请求

            // 5. 执行请求
            lastRes = await executeUpstreamRequest({
                env, ctx, provider: selectedProvider, start: Date.now(), url: targetUrl, headers: upstreamHeaders, body: payload,
                model: requestedModel, resolvedModel: selectedRule.targetModel, isAlias: selectedRule.isAlias, gatewayKeyName,
                thinkingLevel, requestMethod: "POST", requestPath: new URL(req.url).pathname, requestBody: requestBodyForLog,
                requestedStream: transformedBody?.stream === true, upstreamUrl: targetUrl
            });

            // 如果成功，立即返回
            if (lastRes.status < 429 && lastRes.status !== 401) {
                const responseHeaders = new Headers(lastRes.headers);
                ["Content-Length", "Content-Encoding", "Transfer-Encoding"].forEach(h => responseHeaders.delete(h));
                responseHeaders.set("Access-Control-Allow-Origin", "*");
                responseHeaders.set("x-gateway-attempts", (attempt + 1).toString());
                return new Response(lastRes.body, { status: lastRes.status, headers: responseHeaders });
            }
            

        }

        // --- 最终失败处理 ---
        if (lastRes) {
            const responseHeaders = new Headers(lastRes.headers);
            ["Content-Length", "Content-Encoding", "Transfer-Encoding"].forEach(h => responseHeaders.delete(h));
            responseHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(lastRes.body, { status: lastRes.status, headers: responseHeaders });
        }
        return await sendError(502, "所有可用密钥重试均已失败", { attempted_keys: attemptedKeys });

    } catch (error: any) {
        console.error("[GATEWAY_ERROR]", error);
        return await sendError(500, "内部网关错误", error.message);
    }
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key, x-api-key"
        }
    });
}
