'use server';

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { executePlaygroundUpstreamRequest, type PlaygroundRequest } from "@/lib/server/playground";

/**
 * Retrieves the raw key for the "main" gateway key.
 */
export async function getMainGatewayKey(): Promise<string | null> {
    try {
        const { env } = getCloudflareContext();
        const result: any = await env.DB.prepare(
            `SELECT key_hash FROM gateway_keys WHERE name = 'main' AND is_enabled = 1 LIMIT 1`
        ).first();

        if (result && result.key_hash) {
            return result.key_hash;
        }
        return null;
    } catch (e) {
        console.error("无法获取主密钥", e);
        return null;
    }
}

function extractOpenAIContentText(content: any): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part: any) => {
                if (typeof part === "string") return part;
                if (part?.type === "text" && typeof part?.text === "string") return part.text;
                return "";
            })
            .join("");
    }
    return "";
}

function normalizeResponseByProvider(providerType: 'openai' | 'google' | 'anthropic', data: any): string {
    if (!data || typeof data !== "object") return String(data || "");

    if (providerType === 'openai') {
        const text = extractOpenAIContentText(data.choices?.[0]?.message?.content);
        return text || JSON.stringify(data, null, 2);
    }

    if (providerType === 'google') {
        const parts = data.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts)
            ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("")
            : "";
        return text || JSON.stringify(data, null, 2);
    }

    if (providerType === 'anthropic') {
        const blocks = data.content;
        const text = Array.isArray(blocks)
            ? blocks.map((b: any) => (typeof b?.text === "string" ? b.text : "")).join("")
            : "";
        return text || JSON.stringify(data, null, 2);
    }

    return JSON.stringify(data, null, 2);
}

async function collectStreamText(
    res: Response,
    providerType: 'openai' | 'google' | 'anthropic'
): Promise<string> {
    if (!res.body) return "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let raw = "";
    let text = "";
    let googleCumulative = "";

    const appendText = (next: string) => {
        if (!next) return;
        text += next;
    };

    const appendGoogleText = (next: string) => {
        if (!next) return;
        // Gemini 流式可能返回累计文本，也可能返回增量文本，这里兼容两种模式。
        if (next.startsWith(googleCumulative)) {
            const delta = next.slice(googleCumulative.length);
            googleCumulative = next;
            if (delta) appendText(delta);
            return;
        }
        if (googleCumulative.startsWith(next)) return;
        googleCumulative += next;
        appendText(next);
    };

    const consumeJson = (data: any) => {
        if (!data || typeof data !== "object") return;

        if (providerType === "anthropic") {
            if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
                appendText(typeof data.delta.text === "string" ? data.delta.text : "");
            }
            if (data.type === "content_block_start" && data.content_block?.type === "text") {
                appendText(typeof data.content_block.text === "string" ? data.content_block.text : "");
            }
        }

        if (Array.isArray(data.choices)) {
            data.choices.forEach((choice: any) => {
                const deltaText = extractOpenAIContentText(choice?.delta?.content);
                if (deltaText) appendText(deltaText);
            });
        }

        if (providerType === "google") {
            const parts = data.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
                const chunk = parts
                    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
                    .join("");
                appendGoogleText(chunk);
            }
        }
    };

    const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (!trimmed.startsWith("data:")) return;

        const payload = trimmed.slice(trimmed.startsWith("data: ") ? 6 : 5).trim();
        if (!payload || payload === "[DONE]") return;
        try {
            consumeJson(JSON.parse(payload));
        } catch {
            // 非 JSON data 片段直接忽略，保留 raw 回退处理。
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        raw += chunk;
        buffer += chunk;

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.forEach(consumeLine);
    }

    if (buffer) consumeLine(buffer);
    if (text.trim()) return text;

    const rawTrimmed = raw.trim();
    if (!rawTrimmed) return "";

    try {
        const parsed = JSON.parse(rawTrimmed);
        return normalizeResponseByProvider(providerType, parsed);
    } catch {
        return rawTrimmed;
    }
}

export async function submitPlaygroundRequest(params: PlaygroundRequest) {
    try {
        const { response, providerType, requestedStream } = await executePlaygroundUpstreamRequest(params);
        if (!response.ok) {
            const text = await response.text();
            console.error("<<< [AI-GATEWAY] 错误响应：", text);
            throw new Error(`模型供应商错误 (${response.status})：${text}`);
        }

        const contentType = response.headers.get("Content-Type") || "";
        if (contentType.includes("text/event-stream") || requestedStream) {
            return await collectStreamText(response, providerType);
        }

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return text;
        }
        return normalizeResponseByProvider(providerType, data);
    } catch (e: any) {
        console.error("!!! [AI-GATEWAY] 严重 Action 错误：", e);
        throw new Error(e.message || "发生未知错误");
    }
}

export async function submitPlaygroundRequestSafe(params: PlaygroundRequest): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
    try {
        const content = await submitPlaygroundRequest(params);
        return { ok: true, content };
    } catch (e: any) {
        return { ok: false, error: e?.message || "发生未知错误" };
    }
}
