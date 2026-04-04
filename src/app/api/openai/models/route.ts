import { NextRequest } from "next/server";
import { handleOpenAIModels } from "@/lib/server/models";

export async function GET(req: NextRequest) {
    return handleOpenAIModels(req);
}
