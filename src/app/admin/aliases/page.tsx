import { fetchRules, fetchProviders } from "@/app/actions/providers";
import AliasesClient from "@/components/admin/aliases-client";

export const dynamic = 'force-dynamic';

export default async function AliasesPage() {
    const rules = await fetchRules();
    const providers = await fetchProviders();
    
    // 过滤出用户自定义的别名 (is_alias = 1)
    const aliases = rules.filter(r => r.isAlias);

    return (
        <main className="min-h-screen bg-gray-50/50">
            <AliasesClient 
                initialAliases={aliases} 
                allRules={rules}
                providers={providers} 
            />
        </main>
    );
}
