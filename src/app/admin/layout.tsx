import { Sidebar } from "@/components/admin/sidebar";
import { assertAdminAuth } from "@/lib/server/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const isAuth = await assertAdminAuth();
    if (!isAuth) {
        redirect("/login");
    }

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 min-w-0 overflow-y-auto w-0">
                <div className="min-h-full">
                    {/* Changed max-w-7xl to full to allow playground to expand, removed global padding */}
                    {children}
                </div>
            </main>
        </div>
    );
}
