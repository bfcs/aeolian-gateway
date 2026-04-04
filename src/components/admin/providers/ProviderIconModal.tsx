'use client';

import type { Dispatch, SetStateAction } from 'react';
import { X } from 'lucide-react';

export default function ProviderIconModal({
    isOpen,
    tempIconUrl,
    setTempIconUrl,
    providerType,
    onClose,
    onConfirm
}: {
    isOpen: boolean;
    tempIconUrl: string;
    setTempIconUrl: Dispatch<SetStateAction<string>>;
    providerType: string | undefined;
    onClose: () => void;
    onConfirm: () => void;
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 text-gray-900">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h2 className="text-lg font-medium tracking-tight text-black">修改图标</h2>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mt-0.5">Custom Display Icon</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-black transition-all"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-6 flex flex-col items-center">
                    <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center p-4 border border-gray-100 shadow-inner">
                        <img 
                            src={tempIconUrl || `/${providerType}.png`} 
                            alt="" 
                            width={80} 
                            height={80} 
                            className="w-full h-full object-contain" 
                            onError={(e) => { e.currentTarget.src = `/${providerType}.png`; }}
                        />
                    </div>
                    <div className="w-full space-y-1">
                        <label className="text-xs font-medium text-black uppercase tracking-widest ml-1">图标 URL</label>
                        <input type="url" value={tempIconUrl} onChange={(e) => setTempIconUrl(e.target.value)} placeholder="https://..." className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-black outline-none transition-all text-xs font-medium bg-gray-50/30" />
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-2xl transition-all uppercase tracking-widest">取消</button>
                    <button onClick={onConfirm} className="flex-1 px-4 py-2.5 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-2xl transition-all uppercase tracking-widest">确定</button>
                </div>
            </div>
        </div>
    );
}
