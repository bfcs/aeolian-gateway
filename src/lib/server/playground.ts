import { getCloudflareContext } from "@opennextjs/cloudflare";
import { executeUpstreamRequest, findEligibleProviders, resolveModelName, selectKey, selectProvider } from "@/lib/server/gateway-logic";
import { getProviders } from "@/lib/server/providers";

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface PlaygroundRequest {
    model: string;
    messages: ChatMessage[];
    jsonSchema?: string;
    providerId: string; // Unified identifier (UUID, Alias ID, or Type-Identifier)
}

export async function executePlaygroundUpstreamRequest({ model, messages, jsonSchema, providerId }: PlaygroundRequest): Promise<{
    response: Response;
    providerType: 'openai' | 'google' | 'anthropic';
    requestedStream: boolean;
}> {
    let env: any;
    let ctx: any;
    try {
        const cf = getCloudflareContext();
        env = cf?.env;
        ctx = cf?.ctx;
    } catch (e) {
        console.error("在 Playground 中获取 Context 失败", e);
    }

    // 1. Find Providers
    const allProviders = await getProviders();
    const isAliasRequest = providerId === "virtual-alias-group" || providerId === "alias";

    // Use shared gateway logic for matching and filter by explicit provider ID or type
    const validProviders = findEligibleProviders(allProviders, model)
        .filter(p => {
            if (!providerId || isAliasRequest) return true;
            // Check if it's a specific provider ID (UUID)
            if (p.id === providerId) return true;
            // Fallback: check if it matches the provider type (for generic requests)
            if (p.type === providerId) return true;
            return false;
        });

    if (validProviders.length === 0) {
        throw new Error(`未找到匹配的模型供应商：${providerId}，模型：${model}`);
    }

    // 2. Select Provider & Key
    const provider = selectProvider(validProviders);
    if (!provider) throw new Error("选择模型供应商失败。");

    const selectedKey = selectKey(provider);
    if (!selectedKey) throw new Error(`模型供应商 ${provider.name} 未配置任何密钥。`);

    // 3. Prepare Request based on Type
    let url = provider.baseUrl;
    if (url.endsWith('/')) url = url.slice(0, -1); // Normalize

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    let body: any = null;
    let requestedStream = true;

    // Resolve Model Name (Alias)
    const finalModelName = resolveModelName(provider, model);

    const isOpenAICompat = provider.type === 'openai' || provider.baseUrl.includes('/openai/');

    if (isOpenAICompat) {
        // --- OpenAI Logic ---
        if (!url.endsWith('/chat/completions')) {
            url += '/chat/completions';
        }

        headers['Authorization'] = `Bearer ${selectedKey.key}`;

        let finalMessages = [...messages];
        let responseFormat: any = undefined;

        if (jsonSchema) {
            try {
                const parsedSchema = JSON.parse(jsonSchema);

                // OpenAI Structured Outputs REQUIRE additionalProperties: false
                const forceStrict = (obj: any) => {
                    if (typeof obj !== 'object' || obj === null) return;
                    if (obj.type === 'object') {
                        obj.additionalProperties = false;
                    }
                    if (obj.properties) {
                        for (const key in obj.properties) {
                            forceStrict(obj.properties[key]);
                        }
                    }
                    if (obj.items) forceStrict(obj.items);
                };
                forceStrict(parsedSchema);

                // Add a system message to the BEGINNING to enforce format (highly recommended for compatible models)
                finalMessages = [
                    {
                        role: 'system',
                        content: `重要提示：你必须以有效的 JSON 格式回答。要求的结构如下：\n${JSON.stringify(parsedSchema, null, 2)}`
                    },
                    ...finalMessages
                ];

                const isOfficialOpenAI = url.includes('api.openai.com');

                if (isOfficialOpenAI) {
                    responseFormat = {
                        type: 'json_schema',
                        json_schema: {
                            name: "structured_output",
                            strict: true,
                            schema: parsedSchema
                        }
                    };
                } else {
                    // Compatible providers usually support json_object but not full json_schema specs
                    responseFormat = { type: 'json_object' };
                }
            } catch (e) {
                console.error("[Playground] Schema 解析失败，回退到 json_object", e);
                responseFormat = { type: 'json_object' };
            }
        }

        body = {
            model: finalModelName,
            messages: finalMessages,
            stream: true,
            response_format: responseFormat
        };

    } else if (provider.type === 'google') {
        // --- Gemini Native Logic ---
        url += `/models/${finalModelName.replace('models/', '')}:streamGenerateContent`;
        url += `?alt=sse&key=${selectedKey.key}`;

        const systemMsg = messages.find(m => m.role === 'system');
        const otherMsgs = messages.filter(m => m.role !== 'system');

        let googleContents = otherMsgs.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        let systemInstruction = systemMsg ? {
            parts: [{ text: systemMsg.content }]
        } : undefined;

        if (googleContents.length === 0 && systemMsg) {
            googleContents = [{
                role: 'user',
                parts: [{ text: systemMsg.content }]
            }];
            systemInstruction = undefined;
        }

        body = {
            contents: googleContents,
            generationConfig: {}
        };

        if (jsonSchema) {
            body.generationConfig.responseMimeType = "application/json";
            try {
                const parsed = JSON.parse(jsonSchema);

                const sanitizeSchema = (obj: any) => {
                    if (typeof obj !== 'object' || obj === null) return;
                    delete obj.additionalProperties;
                    if (obj.properties) {
                        for (const key in obj.properties) {
                            sanitizeSchema(obj.properties[key]);
                        }
                    }
                    if (obj.items) sanitizeSchema(obj.items);
                };

                sanitizeSchema(parsed);
                body.generationConfig.responseSchema = parsed;
            } catch (e) {
                console.error("[Playground] Gemini 的 Schema 解析失败", e);
            }
        }

        if (systemInstruction) {
            body.system_instruction = systemInstruction;
        }
    } else if (provider.type === 'anthropic') {
        // --- Anthropic Logic ---
        if (!url.endsWith('/messages')) {
            url += '/messages';
        }

        headers['x-api-key'] = selectedKey.key;
        headers['anthropic-version'] = '2023-06-01';

        const systemMsg = messages.find(m => m.role === 'system');
        const otherMsgs = messages.filter(m => m.role !== 'system');

        body = {
            model: finalModelName,
            system: systemMsg?.content,
            messages: otherMsgs.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            })),
            max_tokens: 4096,
            stream: true
        };
    } else {
        throw new Error(`不支持的模型供应商类型：${provider.type}`);
    }

    // 4. Log Request and Execute (Unified)
    const start = Date.now();
    const bodyString = JSON.stringify(body);
    const response = await executeUpstreamRequest({
        env,
        ctx,
        provider,
        start,
        url,
        headers,
        body: bodyString,
        model,
        resolvedModel: finalModelName !== model ? finalModelName : undefined,
        isAlias: isAliasRequest,
        gatewayKeyName: 'playground',
        requestMethod: 'POST',
        requestPath: url.replace(provider.baseUrl, ''),
        requestBody: bodyString,
        requestedStream
    });

    return {
        response,
        providerType: provider.type,
        requestedStream
    };
}
