'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { RefreshCw, X } from 'lucide-react';

export default function SubscriptionUrlModal({
    isOpen,
    subscribeUrl,
    setSubscribeUrl,
    isSubscribing,
    onClose,
    onSubmit
}: {
    isOpen: boolean;
    subscribeUrl: string;
    setSubscribeUrl: Dispatch<SetStateAction<string>>;
    isSubscribing: boolean;
    onClose: () => void;
    onSubmit: (e: FormEvent) => void;
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-gray-900">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <form onSubmit={onSubmit}>
                    <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                        <h2 className="text-lg font-medium">订阅配置源</h2>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-6 space-y-4">
                        <label className="block space-y-1">
                            <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">配置订阅地址 (JSON URL)</span>
                            <input required type="url" value={subscribeUrl} onChange={e => setSubscribeUrl(e.target.value)} className="w-full rounded-xl border border-gray-200 focus:border-black outline-none py-2 px-3 text-sm" placeholder="https://..." disabled={isSubscribing} />
                        </label>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 shrink-0">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-xl transition-all uppercase tracking-widest" disabled={isSubscribing}>取消</button>
                        <button type="submit" disabled={isSubscribing} className="flex items-center gap-2 px-6 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-xl transition-all uppercase tracking-widest">
                            {isSubscribing && <RefreshCw className="w-4 h-4 animate-spin" />}
                            立即同步
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
