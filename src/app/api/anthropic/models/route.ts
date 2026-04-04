import { NextRequest } from "next/server";
import { handleAnthropicModels } from "@/lib/server/models";

export async function GET(req: NextRequest) {
    return handleAnthropicModels(req);
}
