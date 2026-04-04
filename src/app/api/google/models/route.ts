import { NextRequest } from "next/server";
import { handleGeminiModels } from "@/lib/server/models";

export async function GET(req: NextRequest) {
    return handleGeminiModels(req);
}
