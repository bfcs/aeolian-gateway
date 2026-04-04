import { getSubscriptionUrlAction, getLogSettingsAction } from "@/app/actions/configs";
import SettingsClient from "@/components/admin/settings-client";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
    const url = await getSubscriptionUrlAction();
    const logSettings = await getLogSettingsAction();
    return <SettingsClient initialSubscriptionUrl={url || ''} initialLogSettings={logSettings} />;
}
