'use client';

import { useState } from 'react';
import Link from "next/link";
import { ChevronLeft, ChevronRight, Shield, Server, Key, Swords, Logs, Route, LogOut, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { cn } from '@/lib/utils';

export function Sidebar() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    const navItems = [
        { name: "模型供应商", href: "/admin/providers", icon: Server },
        { name: "模型别名", href: "/admin/aliases", icon: Route },
        { name: "网关密钥", href: "/admin/keys", icon: Key },
        { name: "竞技场", href: "/admin/playground", icon: Swords },
        { name: "请求日志", href: "/admin/logs", icon: Logs },
        { name: "系统设置", href: "/admin/settings", icon: Settings },
    ];

    return (
        <aside className={cn(
            "bg-white border-r border-gray-200 hidden md:flex flex-col transition-all duration-300 ease-in-out relative",
            isCollapsed ? "w-20" : "w-64"
        )}>
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-8 bg-white border border-gray-200 rounded-full p-1 shadow-sm text-gray-400 hover:text-black z-10"
            >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            <div className={cn("p-6 border-b border-gray-100 overflow-hidden whitespace-nowrap", isCollapsed && "px-0 flex justify-center")}>
                <div className={cn("flex items-center gap-3 font-medium text-xl text-black", isCollapsed && "gap-0")}>
                    <Shield className="w-8 h-8 shrink-0" />
                    <div className={cn("flex flex-col transition-opacity duration-300", isCollapsed ? "opacity-0 w-0" : "opacity-100")}>
                        <span className="leading-tight">Aeolian AI 网关</span>
                    </div>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-hidden">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
                                isActive ? "bg-zinc-100 text-black border border-zinc-200" : "text-gray-600 hover:bg-gray-50 hover:text-black",
                                isCollapsed && "justify-center px-2"
                            )}
                            title={isCollapsed ? item.name : undefined}
                        >
                            <item.icon className={cn("w-5 h-5 shrink-0", item.href === "/admin/keys" && "rotate-45")} />
                            <span className={cn("transition-opacity duration-300", isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100")}>
                                {item.name}
                            </span>
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 border-t border-gray-100 flex flex-col gap-3">
                <button
                    onClick={async () => {
                        await logoutAction();
                        router.push('/login');
                    }}
                    className={cn(
                        "flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors w-full",
                        isCollapsed && "justify-center px-2"
                    )}
                    title={isCollapsed ? "退出登录" : undefined}
                >
                    <LogOut className="w-5 h-5 shrink-0" />
                    <span className={cn("transition-opacity duration-300", isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100")}>退出登录</span>
                </button>
                <div className={cn("text-xs text-gray-400 text-center font-medium transition-opacity duration-300", isCollapsed ? "opacity-0 hidden" : "opacity-100")}>
                    {process.env.NEXT_PUBLIC_COMMIT_HASH || 'invalid version code'}
                </div>
            </div>
        </aside>
    );
}
