'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    success: (msg: string) => void;
    error: (msg: string) => void;
    warning: (msg: string) => void;
    confirm: (options: ConfirmOptions) => void;
}

interface ConfirmOptions {
    message: string;
    onConfirm: () => void | Promise<void>;
    confirmText?: string;
    cancelText?: string;
    type?: 'warning' | 'danger';
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);

    const success = (msg: string) => addToast(msg, 'success');
    const error = (msg: string) => addToast(msg, 'error');
    const warning = (msg: string) => addToast(msg, 'warning');

    const confirm = (options: ConfirmOptions) => {
        setConfirmOptions(options);
    };

    const handleConfirm = async () => {
        if (!confirmOptions) return;
        setConfirmLoading(true);
        try {
            await confirmOptions.onConfirm();
            setConfirmOptions(null);
        } finally {
            setConfirmLoading(false);
        }
    };

    return (
        <ToastContext.Provider value={{ success, error, warning, confirm }}>
            {children}
            
            {/* Toast Container */}
            <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none w-full max-w-sm">
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
                ))}
            </div>

            {/* Confirm Modal */}
            {confirmOptions && (
                <ConfirmModal 
                    options={confirmOptions} 
                    loading={confirmLoading} 
                    onClose={() => setConfirmOptions(null)} 
                    onConfirm={handleConfirm}
                />
            )}
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast, onClose: () => void }) {
    const icons = {
        success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
        error: <XCircle className="w-5 h-5 text-red-500" />,
        warning: <AlertTriangle className="w-5 h-5 text-amber-500" />
    };

    const bgColors = {
        success: 'bg-white border-emerald-100',
        error: 'bg-white border-red-100',
        warning: 'bg-white border-amber-100'
    };

    return (
        <div className={`pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl border shadow-xl animate-toast-in ${bgColors[toast.type]}`}>
            <div className="shrink-0">{icons[toast.type]}</div>
            <p className="text-sm font-bold text-gray-900 flex-1">{toast.message}</p>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

function ConfirmModal({ options, loading, onClose, onConfirm }: { options: ConfirmOptions, loading: boolean, onClose: () => void, onConfirm: () => void }) {
    const btnColors = options.type === 'danger' 
        ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' 
        : 'bg-gray-900 hover:bg-black focus:ring-gray-900';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 text-center">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${options.type === 'danger' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-900'}`}>
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight mb-2">确认操作</h3>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">{options.message}</p>
                </div>
                <div className="p-6 bg-gray-50/80 border-t border-gray-100 flex gap-3">
                    <button 
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-6 py-3 text-sm font-bold text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-2xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
                    >
                        {options.cancelText || '取消'}
                    </button>
                    <button 
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex-1 px-6 py-3 text-sm font-bold text-white rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${btnColors}`}
                    >
                        {loading ? '处理中...' : (options.confirmText || '确认')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
}
