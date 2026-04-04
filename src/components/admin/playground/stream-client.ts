type Role = 'system' | 'user' | 'assistant';

interface ChatMessage {
    role: Role;
    content: string;
}

interface PlaygroundRequest {
    model: string;
    messages: ChatMessage[];
    jsonSchema?: string;
    providerId: string;
}

type StreamResult = { ok: true; content: string } | { ok: false; error: string };

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

function normalizeResponseData(data: any): string {
    if (!data || typeof data !== "object") return String(data || "");

    const openAIText = extractOpenAIContentText(data.choices?.[0]?.message?.content);
    if (openAIText) return openAIText;

    const googleParts = data.candidates?.[0]?.content?.parts;
    if (Array.isArray(googleParts)) {
        const text = googleParts
            .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
            .join("");
        if (text) return text;
    }

    const anthropicBlocks = data.content;
    if (Array.isArray(anthropicBlocks)) {
        const text = anthropicBlocks
            .map((b: any) => (typeof b?.text === "string" ? b.text : ""))
            .join("");
        if (text) return text;
    }

    return JSON.stringify(data, null, 2);
}

export async function submitPlaygroundRequestStreamSafe(
    params: PlaygroundRequest,
    options?: { timeoutMs?: number; onProgress?: (content: string) => void }
): Promise<StreamResult> {
    const timeoutMs = options?.timeoutMs ?? 60000;
    const onProgress = options?.onProgress;
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        const res = await fetch('/api/admin/playground/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
            signal: abortController.signal
        });

        if (!res.ok) {
            const errText = await res.text();
            return { ok: false, error: `模型供应商错误 (${res.status})：${errText}` };
        }

        const contentType = res.headers.get("Content-Type") || "";

        if (!contentType.includes("text/event-stream")) {
            const text = await res.text();
            if (!text.trim()) return { ok: true, content: "" };
            try {
                return { ok: true, content: normalizeResponseData(JSON.parse(text)) };
            } catch {
                return { ok: true, content: text };
            }
        }

        if (!res.body) {
            return { ok: true, content: "" };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let raw = "";
        let fullText = "";
        let googleCumulative = "";

        const append = (delta: string) => {
            if (!delta) return;
            fullText += delta;
            if (onProgress) onProgress(fullText);
        };

        const appendGoogle = (chunk: string) => {
            if (!chunk) return;
            if (chunk.startsWith(googleCumulative)) {
                const delta = chunk.slice(googleCumulative.length);
                googleCumulative = chunk;
                append(delta);
                return;
            }
            if (googleCumulative.startsWith(chunk)) return;
            googleCumulative += chunk;
            append(chunk);
        };

        const consumeData = (data: any) => {
            if (!data || typeof data !== "object") return;

            if (data.type === "content_block_delta" && data.delta?.type === "text_delta" && typeof data.delta.text === "string") {
                append(data.delta.text);
            }

            if (data.type === "content_block_start" && data.content_block?.type === "text" && typeof data.content_block.text === "string") {
                append(data.content_block.text);
            }

            if (Array.isArray(data.choices)) {
                data.choices.forEach((choice: any) => {
                    const deltaText = extractOpenAIContentText(choice?.delta?.content);
                    if (deltaText) append(deltaText);
                });
            }

            const parts = data.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
                const chunk = parts
                    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
                    .join("");
                appendGoogle(chunk);
            }
        };

        const consumeLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) return;
            const payload = trimmed.slice(trimmed.startsWith("data: ") ? 6 : 5).trim();
            if (!payload || payload === "[DONE]") return;
            try {
                consumeData(JSON.parse(payload));
            } catch {
                // ignore invalid JSON sse lines
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

        if (fullText.trim()) {
            return { ok: true, content: fullText };
        }

        // Fallback for non-standard stream payload
        const rawTrimmed = raw.trim();
        if (!rawTrimmed) return { ok: true, content: "" };
        try {
            return { ok: true, content: normalizeResponseData(JSON.parse(rawTrimmed)) };
        } catch {
            return { ok: true, content: rawTrimmed };
        }
    } catch (e: any) {
        if (e?.name === "AbortError") {
            return { ok: false, error: `请求超时 (${Math.floor(timeoutMs / 1000)}s)` };
        }
        return { ok: false, error: e?.message || "发生未知错误" };
    } finally {
        clearTimeout(timer);
    }
}
