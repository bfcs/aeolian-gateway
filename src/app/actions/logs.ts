'use server'

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface LogEntry {
    timestamp: string;
    gateway_key_name: string;
    provider_name: string;
    model: string;
    status: number;
    duration_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    error_message: string;
    is_stream: boolean;
    thinking_level: string;
    request_method: string;
    request_path: string;
    request_body: string;
    response_body: string;
    upstream_url?: string;
}

export async function fetchLogs(range?: { start?: string, end?: string }): Promise<LogEntry[]> {
    try {
        const { env } = getCloudflareContext();

        if (!env?.DB) {
            console.error("Cloudflare Context or D1 Binding missing in fetchLogs");
            return [];
        }

        try {
            let query = `SELECT * FROM request_logs`;
            const params: any[] = [];
            const conditions: string[] = [];

            if (range?.start) {
                conditions.push(`timestamp >= ?`);
                params.push(range.start);
            }
            if (range?.end) {
                conditions.push(`timestamp <= ?`);
                params.push(range.end);
            }

            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            query += ` ORDER BY timestamp DESC`;

            if (conditions.length === 0) {
                query += ` LIMIT 100`;
            } else {
                query += ` LIMIT 1000`;
            }

            const result = await env.DB.prepare(query).bind(...params).all();

            if (result.results) {
                return result.results.map((r: any) => ({
                    timestamp: r.timestamp,
                    gateway_key_name: r.key_name,
                    provider_name: r.provider,
                    model: r.model,
                    status: r.status,
                    duration_ms: r.duration,
                    prompt_tokens: r.prompt_tokens || 0,
                    completion_tokens: r.completion_tokens || 0,
                    total_tokens: r.total_tokens || 0,
                    error_message: r.error_message || "",
                    is_stream: !!r.is_stream,
                    thinking_level: r.thinking_level || "",
                    request_method: r.request_method || "",
                    request_path: r.request_path || "",
                    request_body: r.request_body || "",
                    response_body: r.response_body || "",
                    upstream_url: r.upstream_url || ""
                }));
            }
        } catch (d1Err) {
            console.warn("D1 Logs table not found or query failed", d1Err);
        }

        return [];
    } catch (e) {
        console.error("fetchLogs Error:", e);
        return [];
    }
}

export async function clearLogs(): Promise<{ success: boolean; error?: string }> {
    try {
        const { env } = getCloudflareContext();

        if (!env?.DB) {
            return { success: false, error: "Cloudflare Context or D1 Binding missing" };
        }

        await env.DB.prepare(`DELETE FROM request_logs`).run();
        return { success: true };
    } catch (e: any) {
        console.error("clearLogs Error:", e);
        return { success: false, error: e.message || "Failed to clear logs" };
    }
}