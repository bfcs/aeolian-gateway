import { fetchGatewayKeys } from "@/app/actions/keys";
import KeysClient from "@/components/admin/keys-client";

export const dynamic = 'force-dynamic';

export default async function KeysPage() {
    const keys = await fetchGatewayKeys();
    return <KeysClient initialKeys={keys} />;
}
