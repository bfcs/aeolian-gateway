import { NextRequest, NextResponse } from "next/server";
import { assertAdminAuth } from "@/lib/server/auth";
import { executePlaygroundUpstreamRequest, type PlaygroundRequest } from "@/lib/server/playground";

export async function POST(req: NextRequest) {
    const isAuth = await assertAdminAuth();
    if (!isAuth) {
        return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    let body: PlaygroundRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "无效请求体" }, { status: 400 });
    }

    if (!body?.providerId || !body?.model || !Array.isArray(body?.messages)) {
        return NextResponse.json({ error: "缺少必要字段：providerId/model/messages" }, { status: 400 });
    }

    try {
        const { response } = await executePlaygroundUpstreamRequest(body);
        const headers = new Headers(response.headers);
        ["Content-Length", "Content-Encoding", "Transfer-Encoding"].forEach(h => headers.delete(h));
        headers.set("Cache-Control", "no-cache, no-transform");
        return new Response(response.body, { status: response.status, headers });
    } catch (e: any) {
        console.error("[PLAYGROUND_STREAM_API] 失败：", e);
        return NextResponse.json({ error: e?.message || "请求失败" }, { status: 500 });
    }
}
