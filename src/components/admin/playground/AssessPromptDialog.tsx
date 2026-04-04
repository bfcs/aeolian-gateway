import { useEffect, useState } from 'react';
import { Settings, X, Route } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { ProviderConfig } from '@/lib/server/providers';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

// 提取 ProviderIcon 组件，使用原生 img 确保外部图片加载稳定性
const ProviderIcon = ({ src, type, className, size = 16 }: { src?: string | null, type?: string, className?: string, size?: number }) => {
    const fallbackSrc = `/${type || 'openai'}.png`;
    return (
        <img 
            src={src || fallbackSrc} 
            alt="" 
            width={size} 
            height={size} 
            className={cn("object-contain", className)}
            onError={(e) => {
                if (e.currentTarget.src !== window.location.origin + fallbackSrc) {
                    e.currentTarget.src = fallbackSrc;
                }
            }}
        />
    );
};

export function AssessPromptDialog({
    isOpen,
    onClose,
    prompt,
    model,
    providerId,
    description,
    availableModels,
    providers,
    modelSet,
    onSave
}: {
    isOpen: boolean;
    onClose: () => void;
    prompt: string;
    model: string;
    description: string;
    providerId: string;
    availableModels: Record<string, string[]>;
    providers: ProviderConfig[];
    modelSet: Set<string>;
    onSave: (prompt: string, model: string, providerId: string, description: string) => void;
}) {
    const [localPrompt, setLocalPrompt] = useState(prompt);
    const [localModel, setLocalModel] = useState(model);
    const [localDescription, setLocalDescription] = useState(description);
    const [localProviderId, setLocalProviderId] = useState<string>(providerId);
    const toast = useToast();

    const validateModelInput = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return true;
        if (modelSet.size > 0 && !modelSet.has(trimmed.toLowerCase())) {
            toast.error(`模型不存在：${trimmed}`);
            return false;
        }
        return true;
    };

    useEffect(() => {
        setLocalPrompt(prompt);
        setLocalModel(model || '');
        setLocalDescription(description || '');
        setLocalProviderId(providerId || '');
    }, [prompt, model, description, providerId, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-gray-900">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/30 shrink-0">
                    <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-black" />
                        <h2 className="text-lg font-medium">全局配置</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto max-h-4/5">
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">项目介绍</span>
                        <textarea
                            value={localDescription}
                            onChange={(e) => setLocalDescription(e.target.value)}
                            placeholder="简单介绍一下这个项目的目的..."
                            className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-3 text-xs bg-white shadow-sm resize-none h-20 leading-relaxed"
                        />
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">裁判模型</span>
                        <div className="flex gap-2">
                            <div className="w-32 shrink-0">
                                <Select
                                    value={localProviderId}
                                    onValueChange={value => {
                                        setLocalProviderId(value || '');
                                        const foundP = providers.find(p => p.id === value || p.type === value);
                                        if (value === 'alias') {
                                            setLocalModel(Object.keys(providers.reduce((acc, p) => ({ ...acc, ...p.modelAliases }), {}))[0] || '');
                                        } else if (foundP) {
                                            setLocalModel(foundP.models?.[0] || '');
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-full bg-white border border-gray-200 text-xs h-9 px-3 rounded-xl shadow-sm focus:border-black outline-none flex items-center gap-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            {localProviderId === 'alias' ? (
                                                <Route className="w-3.5 h-3.5 text-black shrink-0" />
                                            ) : (providers.find(p => p.id === localProviderId) || providers.find(p => p.type === localProviderId)) ? (
                                                <div className="w-4.5 h-4.5 bg-white rounded-md p-0.5 border border-gray-100 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                                    {(() => {
                                                        const p = providers.find(p => p.id === localProviderId) || providers.find(p => p.type === localProviderId);
                                                        return <ProviderIcon src={p?.icon} type={p?.type} size={18} className="w-full h-full" />;
                                                    })()}
                                                </div>
                                            ) : null}
                                            <span className="truncate">{localProviderId === 'alias' ? '模型别名' : ((providers.find(p => p.id === localProviderId) || providers.find(p => p.type === localProviderId))?.name || '供应商')}</span>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-gray-100 rounded-xl shadow-xl min-w-52">
                                        <SelectItem value="alias">
                                            <div className="flex items-center gap-2">
                                                <Route className="w-3.5 h-3.5" />
                                                <span>模型别名</span>
                                            </div>
                                        </SelectItem>
                                        {providers.filter(p => p.isEnabled && p.keys?.some(k => k.isEnabled)).map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4.5 h-4.5 bg-white rounded-md p-0.5 border border-gray-100 flex items-center justify-center shadow-sm shrink-0 overflow-hidden text-gray-900">
                                                        <ProviderIcon src={p.icon} type={p.type} size={18} className="w-full h-full" />
                                                    </div>
                                                    <span>{p.name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex-1 min-w-0">
                                <Select
                                    value={localModel}
                                    onValueChange={value => setLocalModel(value || '')}
                                    disabled={!localProviderId}
                                >
                                    <SelectTrigger className="w-full bg-white border border-gray-200 text-xs font-mono h-9 px-3 rounded-xl shadow-sm focus:border-black outline-none transition-all flex items-center overflow-hidden">
                                        <div className="flex-1 truncate text-left">
                                            <SelectValue placeholder="选择一个处理当前任务最强模型" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-gray-100 rounded-xl shadow-xl min-w-52 max-h-64 overflow-y-auto">
                                        {localProviderId === 'alias' ? (
                                            Object.keys(providers.reduce((acc, p) => ({ ...acc, ...p.modelAliases || {} }), {})).map(m => (
                                                <SelectItem key={m} value={m}><span className="font-mono">{m}</span></SelectItem>
                                            ))
                                        ) : (
                                            (providers.find(p => p.id === localProviderId || p.type === localProviderId)?.models || []).map(m => (
                                                <SelectItem key={m} value={m}><span className="font-mono">{m}</span></SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">裁判提示词</span>
                        <textarea
                            value={localPrompt}
                            onChange={(e) => setLocalPrompt(e.target.value)}
                            placeholder="你是xxx，你的评判标准是xxx"
                            className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-3 text-xs bg-white shadow-sm resize-y h-28 leading-relaxed font-mono"
                        />
                    </label>
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => {
                            if (!localProviderId) return toast.error("请选择裁判模型的供应商");
                            if (!localModel.trim()) return toast.error("请输入裁判模型名称");
                            if (!localPrompt.trim()) return toast.error("请输入裁判提示词");
                            if (!validateModelInput(localModel)) return;
                            onSave(localPrompt, localModel, localProviderId, localDescription);
                            onClose();
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-widest text-white bg-black rounded-lg hover:bg-gray-800 shadow-lg shadow-gray-200 transition-all active:scale-95"
                    >
                        保存项目
                    </button>
                </div>
            </div>
        </div>
    );
}
