'use client';

import type { MouseEvent } from 'react';
import Image from 'next/image';
import { AlertCircle, ExternalLink, Trash2 } from 'lucide-react';
import { ProviderConfig } from '@/lib/server/providers';
import { cn } from '@/lib/utils';

export default function ProvidersView({
    viewMode,
    providers,
    onOpenModal,
    onOpenHomepage,
    onDelete,
    onToggleProvider,
    onCopyBaseUrl
}: {
    viewMode: 'card' | 'list';
    providers: ProviderConfig[];
    onOpenModal: (provider: ProviderConfig) => void;
    onOpenHomepage: (e: MouseEvent, url: string | undefined | null) => void;
    onDelete: (id: string) => void;
    onToggleProvider: (provider: ProviderConfig) => void;
    onCopyBaseUrl: (text: string) => void;
}) {
    if (viewMode === 'card') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {providers.map((provider, idx) => (
                    <div key={`${provider.id}-${idx}`} onClick={() => onOpenModal(provider)} className="group bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-black transition-all duration-300 flex flex-col max-h-110 cursor-pointer relative">
                        <div className="flex justify-between items-start mb-5">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center p-2 border border-gray-100 shadow-inner shrink-0 text-gray-900 overflow-hidden">
                                    <img 
                                        src={provider.icon || `/${provider.type}.png`} 
                                        alt="" 
                                        width={40} 
                                        height={40} 
                                        className="w-full h-full object-contain" 
                                        onError={(e) => { e.currentTarget.src = `/${provider.type}.png`; }}
                                    />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h3 className="font-medium text-gray-900 leading-tight truncate">{provider.name}</h3>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={(e) => onOpenHomepage(e, provider.homepageUrl || provider.referralLink)} 
                                    className="p-1.5 text-gray-300 hover:text-black hover:bg-gray-50 rounded-lg transition-all"
                                    title="访问官方主页"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDelete(provider.id); }} 
                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); onToggleProvider(provider); }} className={cn("relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none", provider.isEnabled ? 'bg-black' : 'bg-gray-200')}><span className={cn("pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", provider.isEnabled ? 'translate-x-4' : 'translate-x-0')} /></button>
                            </div>
                        </div>
                        <div className="space-y-4 mb-2 flex-1 overflow-hidden">
                            <div>
                                <div className="text-xs text-black uppercase font-medium tracking-widest mb-2 flex justify-between"><span>支持模型</span><span className="text-gray-900/50 font-mono">{provider.models?.length || 0}</span></div>
                                <div className="flex flex-wrap gap-1.5 content-start max-h-25 overflow-hidden pb-1">
                                    {(provider.models || []).slice(0, 6).map((m, i) => (
                                        <span key={`${m}-${i}`} className="bg-white border border-gray-200 px-2 py-1 rounded-lg font-medium text-gray-600 shadow-sm truncate max-w-30 font-mono" style={{ fontSize: '10px' }}>{m.split('/').pop()}</span>
                                    ))}
                                    {(provider.models?.length || 0) > 6 && <span className="text-gray-400 px-2 py-1 font-medium" style={{ fontSize: '10px' }}>+{ (provider.models?.length || 0) - 6 }</span>}
                                    {(provider.models?.length || 0) === 0 && <div className="flex items-center gap-1.5 text-red-500 font-medium text-xs bg-red-50 px-2 py-1 rounded-lg border border-red-100 w-full justify-center"><AlertCircle className="w-3 h-3" />模型未配置</div>}
                                </div>
                            </div>
                            <div onClick={(e) => { e.stopPropagation(); onCopyBaseUrl(provider.baseUrl || ""); }} className="bg-gray-50 rounded-xl p-3 border border-gray-100 hover:bg-gray-100 cursor-pointer transition-colors group/url mt-auto shrink-0">
                                <div className="text-gray-400 uppercase font-medium mb-1.5 tracking-wider flex items-center gap-2" style={{ fontSize: '10px' }}>
                                    API 端点 <span className="ml-auto opacity-0 group-hover/url:opacity-100 transition-opacity">复制</span>
                                </div>
                                <div className="text-gray-600 font-mono truncate" style={{ fontSize: '11px' }}>{provider.baseUrl}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
            <table className="w-full table-fixed text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <tr>
                        <th className="px-4 py-4 w-1/4">供应商</th>
                        <th className="px-4 py-4 w-2/5">描述</th>
                        <th className="px-4 py-4 w-20 text-center">类型</th>
                        <th className="px-4 py-4 w-20 text-center">状态</th>
                        <th className="px-4 py-4 w-24 text-center">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                    {providers.map((provider, idx) => (
                        <tr key={`${provider.id}-${idx}`} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => onOpenModal(provider)}>
                            <td className="px-4 py-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center p-1.5 bg-gray-50 border border-gray-100 shrink-0">
                                        <img 
                                            src={provider.icon || `/${provider.type}.png`} 
                                            alt="" 
                                            width={32} 
                                            height={32} 
                                            className="w-full h-full object-contain" 
                                            onError={(e) => { e.currentTarget.src = `/${provider.type}.png`; }}
                                        />
                                    </div>
                                    <div className="font-medium text-gray-900 truncate">{provider.name}</div>
                                </div>
                            </td>
                            <td className="px-4 py-4 text-gray-500 text-xs truncate">{provider.description || '-'}</td>
                            <td className="px-4 py-4">
                                <div className="flex justify-center">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center p-1.5 bg-gray-50 border border-gray-100">
                                        <Image src={`/${provider.type}.png`} alt={provider.type} width={32} height={32} className="w-full h-full object-contain" />
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-4">
                                <div className="flex justify-center">
                                    <button onClick={(e) => { e.stopPropagation(); onToggleProvider(provider); }} className={cn("relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none", provider.isEnabled ? 'bg-black' : 'bg-gray-200')}><span className={cn("pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", provider.isEnabled ? 'translate-x-4' : 'translate-x-0')} /></button>
                                </div>
                            </td>
                            <td className="px-4 py-4">
                                <div className="flex justify-center gap-1">
                                    <button 
                                        onClick={(e) => onOpenHomepage(e, provider.homepageUrl || provider.referralLink)} 
                                        className="p-2 text-gray-400 hover:text-black hover:bg-gray-50 rounded-lg transition-all"
                                        title="访问官方主页"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onDelete(provider.id); }} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
