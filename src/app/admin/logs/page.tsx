import LogsClient from "@/components/admin/logs-client";
import { fetchLogs } from "@/app/actions/logs";

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
    const logs = await fetchLogs();

    return <LogsClient initialLogs={logs} />;
}
