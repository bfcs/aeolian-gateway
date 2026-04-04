'use client';

import type { Dispatch, SetStateAction } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { SubscriptionProvider } from '@/app/actions/providers';

export default function SubscriptionListModal({
    isOpen,
    subscriptionUrl,
    subscriptionProviders,
    selectedSubKeys,
    setSelectedSubKeys,
    isUpdatingAll,
    onUpdateAll,
    updatingKeys,
    onUpdateOne,
    isSyncSelected,
    onSyncSelected,
    onClose,
    getSubscriptionKey,
    hasExistingProvider
}: {
    isOpen: boolean;
    subscriptionUrl?: string;
    subscriptionProviders: SubscriptionProvider[];
    selectedSubKeys: string[];
    setSelectedSubKeys: Dispatch<SetStateAction<string[]>>;
    isUpdatingAll: boolean;
    onUpdateAll: () => void;
    updatingKeys: string[];
    onUpdateOne: (p: SubscriptionProvider) => void;
    isSyncSelected: boolean;
    onSyncSelected: () => void;
    onClose: () => void;
    getSubscriptionKey: (p: SubscriptionProvider) => string;
    hasExistingProvider: (p: SubscriptionProvider) => boolean;
}) {
    if (!isOpen) return null;

    const existingCount = subscriptionProviders.filter(p => hasExistingProvider(p)).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-gray-900">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h2 className="text-lg font-medium">在线订阅供应商</h2>
                        <p className="text-xs text-gray-400 font-medium truncate">来源: {subscriptionUrl}</p>
                        <p className="text-[11px] font-medium text-amber-700 mt-0.5">厂商政策可能变动导致数据过时，请自行测试</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={onUpdateAll}
                            disabled={isUpdatingAll || existingCount === 0}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-xl transition-all disabled:opacity-50"
                        >
                            {isUpdatingAll ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            更新全部
                        </button>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                    {subscriptionProviders.length === 0 ? (
                        <div className="text-center text-sm text-gray-400 py-12">未发现可用供应商</div>
                    ) : (
                        subscriptionProviders.map((p) => {
                            const key = getSubscriptionKey(p);
                            const checked = selectedSubKeys.includes(key);
                            const isExisting = hasExistingProvider(p);
                            const isUpdating = updatingKeys.includes(key);
                            return (
                                <div key={key} className="flex items-start gap-3 p-3 border border-gray-100 rounded-2xl bg-white hover:border-gray-200 transition-colors">
                                    <input
                                        type="checkbox"
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black accent-black disabled:cursor-not-allowed"
                                        checked={checked}
                                        disabled={isExisting}
                                        title={isExisting ? "如果要删除，请检查各项信息后在主页删除" : undefined}
                                        onChange={(e) => {
                                            const next = e.target.checked
                                                ? Array.from(new Set([...selectedSubKeys, key]))
                                                : selectedSubKeys.filter(k => k !== key);
                                            setSelectedSubKeys(next);
                                        }}
                                    />
                                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center p-2 border border-gray-100 shadow-inner shrink-0">
                                        <img
                                            src={p.icon || `/${p.type}.png`}
                                            alt=""
                                            width={32}
                                            height={32}
                                            className="w-full h-full object-contain"
                                            onError={(e) => { e.currentTarget.src = `/${p.type}.png`; }}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium text-gray-900">{p.name || '未命名供应商'}</span>
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex items-center">
                                                {p.type === 'openai' || p.type === 'google' || p.type === 'anthropic' ? (
                                                    <img src={`/${p.type}.png`} alt={p.type} className="w-3 h-3 object-contain" />
                                                ) : (
                                                    <span>{p.type}</span>
                                                )}
                                            </span>
                                            {isExisting ? (
                                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">已存在</span>
                                            ) : (
                                                <span className="text-[10px] font-semibold text-black bg-gray-100 px-2 py-0.5 rounded-full">新</span>
                                            )}
                                        </div>
                                        {p.description && (
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>
                                        )}
                                        {Array.isArray(p.free_models) ? (
                                            <p className="text-[11px] text-gray-500 mt-1">
                                                免费模型:{" "}
                                                {p.free_models.length > 0 ? (
                                                    p.free_models.join(', ')
                                                ) : (
                                                    p.homepage_url || p.referral_link ? (
                                                        <a
                                                            href={p.homepage_url || p.referral_link || '#'}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-500 hover:underline"
                                                        >
                                                            查看官网
                                                        </a>
                                                    ) : (
                                                        <span>查看官网</span>
                                                    )
                                                )}
                                            </p>
                                        ) : null}
                                        {p.tips && (
                                            <p className="text-[11px] text-gray-500 mt-1">提示: {p.tips}</p>
                                        )}
                                        {p.referral_link && (
                                            <p className="text-[11px] text-gray-500 mt-1">
                                                <a href={p.referral_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                                    {p.referral_text || '获取密钥'}
                                                </a>
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onUpdateOne(p)}
                                        disabled={isUpdating || !isExisting}
                                        title="更新厂商图标，base url，主页，介绍等等"
                                        className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-xl hover:border-black hover:text-black transition-all disabled:opacity-50"
                                    >
                                        {isUpdating ? '更新中...' : '更新'}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div className="text-xs text-gray-500 font-medium">已选 {selectedSubKeys.length} / {subscriptionProviders.length}</div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-xl transition-all hover:border-gray-300"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={onSyncSelected}
                            disabled={isSyncSelected}
                            className="flex items-center gap-2 px-6 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-xl transition-all uppercase tracking-widest disabled:opacity-50"
                        >
                            {isSyncSelected && <RefreshCw className="w-3 h-3 animate-spin" />}
                            保存所选
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
