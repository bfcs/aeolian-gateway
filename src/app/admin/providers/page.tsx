import { fetchProviders } from "@/app/actions/providers";
import { getSubscriptionUrlAction } from "@/app/actions/configs";
import ProvidersClient from "@/components/admin/providers-client";

export const dynamic = 'force-dynamic'; // KV reads might need this depending on config, better safe for Admin UI

export default async function ProvidersPage() {
    const providers = await fetchProviders();
    const subUrl = await getSubscriptionUrlAction();
    return <ProvidersClient initialProviders={providers} subscriptionUrl={subUrl || ''} />;
}
