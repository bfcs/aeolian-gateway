import { ProviderConfig, ProviderKey } from "./providers";

/**
 * Finds providers that support a given model.
 */
export function findEligibleProviders(providers: ProviderConfig[], model: string): ProviderConfig[] {
    return providers.filter(p => {
        if (!p.isEnabled) return false;
        const models = p.models || [];
        if (models.includes(model)) return true;
        const stripped = model.replace('models/', '');
        if (models.includes(stripped)) return true;
        if (p.modelAliases && Object.keys(p.modelAliases).includes(model)) return true;
        return false;
    });
}

export function selectProvider(providers: ProviderConfig[]): ProviderConfig | null {
    if (providers.length === 0) return null;
    return providers[Math.floor(Math.random() * providers.length)];
}

export function selectKey(provider: ProviderConfig): ProviderKey | null {
    if (!provider.keys || provider.keys.length === 0) return null;
    if (provider.keys.length === 1) return provider.keys[0];
    const totalWeight = provider.keys.reduce((sum, k) => sum + k.weight, 0);
    let random = Math.random() * totalWeight;
    for (const k of provider.keys) {
        random -= k.weight;
        if (random <= 0) {
            return k;
        }
    }
    return provider.keys[0];
}

export function resolveModelName(provider: ProviderConfig, requestedModel: string): string {
    if (provider.modelAliases && provider.modelAliases[requestedModel]) {
        return provider.modelAliases[requestedModel];
    }
    return requestedModel;
}

/**
 * Log Helper: Writes to D1
 */
function truncateText(text: string | null | undefined, maxLength: number = 3000): string {
    if (!text) return "";
    const str = String(text);
    if (str.length <= maxLength) return str;
    return `[已被截断：前 ${str.length - maxLength} 个字符已被移除]...\n\n` + str.substring(str.length - maxLength);
}

async function fetchConfigValue(db: any, key: string, defaultValue: string): Promise<string> {
    try {
        const res: any = await db.prepare(`SELECT value FROM configs WHERE key = ?`).bind(key).first();
        return res?.value || defaultValue;
    } catch {
        return defaultValue;
    }
}

function parseUsageFromText(text: string): {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
} {
    const result: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};

    try {
        const data = JSON.parse(text);
        if (data?.usage) {
            if (typeof data.usage.prompt_tokens === "number") result.promptTokens = data.usage.prompt_tokens;
            if (typeof data.usage.completion_tokens === "number") result.completionTokens = data.usage.completion_tokens;
            if (typeof data.usage.total_tokens === "number") result.totalTokens = data.usage.total_tokens;
        }
        if (data?.usageMetadata) {
            if (typeof data.usageMetadata.promptTokenCount === "number") result.promptTokens = data.usageMetadata.promptTokenCount;
            if (typeof data.usageMetadata.candidatesTokenCount === "number") result.completionTokens = data.usageMetadata.candidatesTokenCount;
            if (typeof data.usageMetadata.totalTokenCount === "number") result.totalTokens = data.usageMetadata.totalTokenCount;
        }
    } catch {
        const pMatch = text.match(/"prompt_tokens":\s*(\d+)/) || text.match(/"promptTokenCount":\s*(\d+)/);
        const cMatch = text.match(/"completion_tokens":\s*(\d+)/) || text.match(/"candidatesTokenCount":\s*(\d+)/);
        const tMatch = text.match(/"total_tokens":\s*(\d+)/) || text.match(/"totalTokenCount":\s*(\d+)/);
        if (pMatch) result.promptTokens = parseInt(pMatch[1], 10);
        if (cMatch) result.completionTokens = parseInt(cMatch[1], 10);
        if (tMatch) result.totalTokens = parseInt(tMatch[1], 10);
    }

    return result;
}

function cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export async function writeLogToD1(env: any, data: any) {
    if (!env?.DB) return;
    try {
        // Fetch values for limit and truncation
        const maxBodyChars = parseInt(await fetchConfigValue(env.DB, "max_body_chars", "3000"));

        await env.DB.prepare(
            `INSERT INTO request_logs (timestamp, key_name, provider, provider_type, model, status, duration, prompt_tokens, completion_tokens, total_tokens, error_message, is_stream, thinking_level, request_method, request_path, request_body, response_body, upstream_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            new Date().toISOString(),
            data.gatewayKeyName || 'unknown',
            data.providerName || 'unknown',
            data.providerType || 'unknown',
            data.model || 'unknown',
            data.status || 0,
            data.duration || 0,
            data.promptTokens || 0,
            data.completionTokens || 0,
            data.totalTokens || 0,
            truncateText(data.errorMessage || '', 1000), // Error message is usually shorter
            data.isStream ? 1 : 0,
            data.thinkingLevel || null,
            data.requestMethod || '',
            data.requestPath || '',
            truncateText(data.requestBody || '', maxBodyChars),
            truncateText(data.responseBody || '', maxBodyChars),
            data.upstreamUrl || null
        ).run();
    } catch (e) {
        console.error("写入 D1 数据库基本字段失败", e);
    }

    try {
        // Auto cleanup with dynamic limit - enforced on every log to satisfy user expectations
        // Since this runs in waitUntil, it doesn't block the response.
        const entryCountLimit = parseInt(await fetchConfigValue(env.DB, "log_entry_count", "50"));
        await env.DB.prepare(`
            DELETE FROM request_logs 
            WHERE id NOT IN (
                SELECT id FROM request_logs 
                ORDER BY timestamp DESC, id DESC 
                LIMIT ?
            )
        `).bind(entryCountLimit).run().catch(() => { });
    } catch (e) {
        console.error("写入 D1 日志清理失败", e);
    }
}

/**
 * Cleanup logs to a specific limit. Can be called from server actions.
 */
export async function cleanupLogs(db: any, limit: number) {
    if (!db) return;
    try {
        await db.prepare(`
            DELETE FROM request_logs 
            WHERE id NOT IN (
                SELECT id FROM request_logs 
                ORDER BY timestamp DESC, id DESC 
                LIMIT ?
            )
        `).bind(limit).run();
    } catch (e) {
        console.error("Manual log cleanup failed", e);
    }
}

/**
 * Executes an upstream request.
 * Implementation using TransformStream for efficient token counting without blocking.
 */
export async function executeUpstreamRequest({
    env,
    ctx,
    provider,
    start,
    url,
    headers,
    body,
    model,
    resolvedModel,
    isAlias,
    gatewayKeyName,
    thinkingLevel,
    requestMethod,
    requestPath,
    requestBody,
    requestedStream = false,
    upstreamUrl
}: {
    env: any,
    ctx?: any,
    provider: ProviderConfig,
    start: number,
    url: string,
    headers: any,
    body: BodyInit | null,
    model: string,
    resolvedModel?: string, // alias 解析后的真实模型名，用于日志记录
    isAlias?: boolean,      // 是否命中别名
    gatewayKeyName: string,
    thinkingLevel?: string,
    requestMethod: string,
    requestPath: string,
    requestBody: string,
    requestedStream?: boolean,
    upstreamUrl?: string
}): Promise<Response> {
    // 日志中记录模型名：如果是别名，显示为 alias --> target
    const logModel = isAlias && resolvedModel ? `${model} --> ${resolvedModel}` : (resolvedModel || model);
    const logProviderName = isAlias ? "模型别名组" : provider.name;

    let effectiveRequestedStream = requestedStream;
    let bodyToSend = body;
    let requestBodyForLog = requestBody;

    // Playground 场景兜底：chat/completions 强制走流式，避免上层遗漏 stream 标记。
    if (gatewayKeyName === "playground" && url.includes("/chat/completions")) {
        try {
            const enforcedBody = typeof body === "string" && body ? JSON.parse(body) : {};
            enforcedBody.stream = true;
            if (!enforcedBody.stream_options?.include_usage) {
                enforcedBody.stream_options = { ...enforcedBody.stream_options, include_usage: true };
            }
            bodyToSend = JSON.stringify(enforcedBody);
            requestBodyForLog = bodyToSend;
            effectiveRequestedStream = true;
        } catch {
            // 保持原始 body，后续按原逻辑处理
        }
    }

    let res: any;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: bodyToSend,
            // @ts-ignore
            cache: 'no-store'
        });
    } catch (e: any) {
        console.error(`[GATEWAY] Upstream fetch failed: ${url}`, e);
        const duration = Date.now() - start;
        const isTimeout = e.name === 'TimeoutError' || e.code === 'UND_ERR_CONNECT_TIMEOUT' || e.message?.includes('timeout');
        const status = isTimeout ? 504 : 502;
        const msg = isTimeout ? "上游请求超时 (Gateway Timeout)" : "连接上游失败 (Bad Gateway)";

        // 记录错误日志到 D1
        const logTask = async () => {
            await writeLogToD1(env, {
                gatewayKeyName,
                providerName: logProviderName,
                providerType: provider.type,
                model: logModel,
                status: status,
                duration,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                errorMessage: `[Fetch Error] ${e.message}`,
                isStream: effectiveRequestedStream,
                thinkingLevel,
                requestMethod,
                requestPath,
                requestBody: requestBodyForLog,
                responseBody: JSON.stringify({ error: msg, details: e.message }),
                upstreamUrl: upstreamUrl || url
            });
        };

        if (ctx?.waitUntil) {
            ctx.waitUntil(logTask());
        } else {
            await logTask();
        }

        return new Response(JSON.stringify({
            error: {
                message: msg,
                type: "gateway_error",
                code: status,
                details: e.message
            }
        }), {
            status: status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 以实际响应的 Content-Type 为首要依据，url 和 requestBody 中的 stream 标志作为补充
    // 避免因 URL 不含 'stream' 字符（如 Gemini OpenAI 兼容端点）被误判为非流式
    // 注意：只有在响应成功 (res.ok) 时才按流处理，否则应作为普通错误 JSON 处理
    const isStream = res.ok && (res.headers.get("Content-Type")?.includes("text/event-stream")
        || effectiveRequestedStream
        || url.includes("stream"));

    if (!isStream) {
        // --- 非流式响应处理 ---
        const duration = Date.now() - start;
        const resText = await res.text();

        let responseBody = resText;
        let promptTokens = 0;
        let completionTokens = 0;
        let totalTokens = 0;
        let errorMessage = "";

        try {
            if (resText) {
                let data = JSON.parse(resText);
                promptTokens = data.usage?.prompt_tokens
                    || data.usageMetadata?.promptTokenCount
                    || 0;
                completionTokens = data.usage?.completion_tokens
                    || data.usageMetadata?.candidatesTokenCount
                    || 0;
                totalTokens = data.usage?.total_tokens
                    || data.usageMetadata?.totalTokenCount
                    || 0;

                if (!res.ok) {
                    // Normalize Gemini error format (Array of objects) to standard object
                    if (Array.isArray(data) && data.length > 0 && data[0]?.error) {
                        data = data[0];
                        responseBody = JSON.stringify(data);
                    }
                    
                    if (data?.error?.message) {
                        errorMessage = String(data.error.message).substring(0, 500);
                    } else {
                        errorMessage = resText.substring(0, 500);
                    }
                }

                // 对非流式 tool_calls 响应，将 extra_content 编码到 ID 中
                if (res.ok && data.choices) {
                    let modified = false;
                    for (const choice of data.choices) {
                        const toolCalls = choice.message?.tool_calls;
                        if (toolCalls && Array.isArray(toolCalls)) {
                            for (const tc of toolCalls) {
                                if (tc.extra_content && tc.id && !tc.id.includes('::')) {
                                    try {
                                        const encoded = btoa(JSON.stringify(tc.extra_content));
                                        tc.id = `${tc.id}::${encoded}`;
                                        modified = true;

                                    } catch { }
                                }
                            }
                        }
                    }
                    if (modified) {
                        responseBody = JSON.stringify(data);
                    }
                }
            }
        } catch { }

        // 异步写日志，不阻塞响应
        const logTask = async () => {
            await writeLogToD1(env, {
                gatewayKeyName,
                providerName: logProviderName,
                providerType: provider.type,
                model: logModel,
                status: res.status,
                duration,
                promptTokens,
                completionTokens,
                totalTokens,
                errorMessage,
                isStream: false,
                thinkingLevel,
                requestMethod,
                requestPath,
                requestBody: requestBodyForLog,
                responseBody: errorMessage || resText,
                upstreamUrl: upstreamUrl || url
            });
        };

        if (ctx?.waitUntil) {
            ctx.waitUntil(logTask());
        } else {
            await logTask();
        }

        return new Response(responseBody, {
            status: res.status,
            headers: res.headers
        });
    }

    // --- 流式响应处理 (TransformStream) ---
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let buffer = "";
    let fullResponseText = "";

    // 状态保持：追踪多个 tool call 的 streaming 索引
    let currentToolIndex = -1;
    let lastToolCallId = "";
    let hasToolCalls = false;
    const streamedToolCallIds = new Map<number, string>();

    const transformStream = new TransformStream({
        transform(chunk, controller) {
            const decoded = decoder.decode(chunk, { stream: true });
            buffer += decoded;
            fullResponseText += decoded;
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                const trimmedLine = line.trim();
                if (!trimmedLine) {
                    controller.enqueue(encoder.encode(line + '\n'));
                    continue;
                }

                const isDataLine = trimmedLine.startsWith("data:");
                const dataPrefix = trimmedLine.startsWith("data: ") ? "data: " : "data:";

                // 实时扫描 Token 信息
                // 同时支持 OpenAI SSE 的 data: 行，以及 Gemini 原生 streamGenerateContent 的 JSON chunk
                const maybeContainsUsage = trimmedLine !== "data: [DONE]" && (
                    trimmedLine.includes('"usage"')
                    || trimmedLine.includes('"usageMetadata"')
                    || trimmedLine.includes('"prompt_tokens"')
                    || trimmedLine.includes('"completion_tokens"')
                    || trimmedLine.includes('"total_tokens"')
                    || trimmedLine.includes('"promptTokenCount"')
                    || trimmedLine.includes('"candidatesTokenCount"')
                    || trimmedLine.includes('"totalTokenCount"')
                );
                if (maybeContainsUsage) {
                    const usageText = isDataLine ? trimmedLine.slice(dataPrefix.length) : trimmedLine;
                    const usage = parseUsageFromText(usageText);
                    if (usage.promptTokens !== undefined) promptTokens = usage.promptTokens;
                    if (usage.completionTokens !== undefined) completionTokens = usage.completionTokens;
                    if (usage.totalTokens !== undefined) totalTokens = usage.totalTokens;
                }

                // 修复部分兼容接口（如 Gemini）返回流时多个 tool_calls 缺少 index 的问题
                if (isDataLine && trimmedLine !== "data: [DONE]" && (trimmedLine.includes('"tool_calls"') || trimmedLine.includes('"finish_reason"') || trimmedLine.includes('"extra_content"'))) {
                    try {
                        const dataStr = trimmedLine.slice(dataPrefix.length);
                        const data = JSON.parse(dataStr);
                        let modified = false;
                        if (data.choices && Array.isArray(data.choices)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            data.choices.forEach((choice: any) => {
                                // 1. 处理 tool_calls
                                if (choice.delta && choice.delta.tool_calls && Array.isArray(choice.delta.tool_calls)) {
                                    hasToolCalls = true;
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    choice.delta.tool_calls.forEach((tc: any) => {
                                        Object.keys(tc).forEach(k => {
                                            if (!['id', 'type', 'function', 'index', 'extra_content'].includes(k)) {
                                                delete tc[k];
                                                modified = true;
                                            }
                                        });

                                        if (tc.index === undefined) {
                                            if (tc.id && tc.id !== lastToolCallId) {
                                                currentToolIndex++;
                                                lastToolCallId = tc.id;
                                            } else if (currentToolIndex === -1) {
                                                currentToolIndex = 0;
                                            }
                                            tc.index = currentToolIndex;
                                            modified = true;
                                        }

                                        if (typeof tc.index === "number" && tc.id) {
                                            streamedToolCallIds.set(tc.index, tc.id);
                                            lastToolCallId = tc.id;
                                        }

                                        // 将 extra_content (thought_signature) 编码到 ID 中
                                        // 标准 OpenAI 客户端不保留 extra_content 字段，
                                        // 但会保留 id，利用此特性在回传时恢复 signature
                                        if (tc.extra_content && tc.id && !tc.id.includes('::')) {
                                            try {
                                                const encoded = btoa(JSON.stringify(tc.extra_content));
                                                tc.id = `${tc.id}::${encoded}`;
                                                if (typeof tc.index === "number") {
                                                    streamedToolCallIds.set(tc.index, tc.id);
                                                }
                                                lastToolCallId = tc.id;
                                                modified = true;

                                            } catch (e) { }
                                        }
                                    });
                                }

                                // Gemini OpenAI 兼容流有时会把 thought_signature 放在最终的 delta.extra_content，
                                // 而不是放进 delta.tool_calls[*].extra_content。这里补一个按 index 回写 ID 的合并步骤。
                                if (choice.delta?.extra_content) {
                                    try {
                                        const extraContent = cloneJsonValue(choice.delta.extra_content);
                                        const encoded = btoa(JSON.stringify(extraContent));
                                        const toolCallEntries: Array<[number, string]> = streamedToolCallIds.size > 0
                                            ? Array.from(streamedToolCallIds.entries())
                                            : (lastToolCallId && currentToolIndex >= 0 ? [[currentToolIndex, lastToolCallId]] : []);

                                        if (toolCallEntries.length === 0) {
                                            return;
                                        }

                                        choice.delta.tool_calls = toolCallEntries.map(([index, id]) => {
                                            const encodedId = id.includes('::') ? id : `${id}::${encoded}`;
                                            streamedToolCallIds.set(index, encodedId);
                                            lastToolCallId = encodedId;
                                            return { index, id: encodedId };
                                        });
                                        delete choice.delta.extra_content;
                                        modified = true;

                                    } catch { }
                                }

                                // 2. 处理 finish_reason
                                if (choice.finish_reason === "stop" && hasToolCalls) {
                                    choice.finish_reason = "tool_calls";
                                    modified = true;
                                }
                            });
                        }
                        if (modified) {
                            line = `${dataPrefix}${dataPrefix.endsWith(' ') ? '' : ' '}${JSON.stringify(data)}`;
                        }
                    } catch (e) {
                        console.error("[STREAM ERROR] Failed to parse SSE JSON:", e);
                    }
                }

                controller.enqueue(encoder.encode(line + '\n'));
            }
        },
        async flush(controller) {
            if (buffer) {
                controller.enqueue(encoder.encode(buffer));
            }
            const duration = Date.now() - start;
            await writeLogToD1(env, {
                gatewayKeyName,
                providerName: logProviderName,
                providerType: provider.type,
                model: logModel,
                status: res.status,
                duration,
                promptTokens,
                completionTokens,
                totalTokens,
                errorMessage: res.ok ? "" : "[流式错误]",
                isStream: true,
                thinkingLevel,
                requestMethod,
                requestPath,
                requestBody: requestBodyForLog,
                responseBody: fullResponseText,
                upstreamUrl: upstreamUrl || url
            });
        }
    });

    const outputStream = res.body?.pipeThrough(transformStream);

    return new Response(outputStream, {
        status: res.status,
        headers: res.headers
    });
}
