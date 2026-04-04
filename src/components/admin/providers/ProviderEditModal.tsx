'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp, DownloadCloud, Edit2, RefreshCw, Settings2, X } from 'lucide-react';
import { ProviderConfig } from '@/lib/server/providers';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ProviderEditModal({
    isOpen,
    editingProvider,
    formData,
    setFormData,
    keysInput,
    setKeysInput,
    manualModelInput,
    setManualModelInput,
    isFetchingModels,
    onFetchModels,
    onAddManualModel,
    showAdvanced,
    setShowAdvanced,
    onClose,
    onSubmit,
    onOpenIconModal,
    isOnlineLocked,
    onTestModel,
    testingModelId,
    onRemoveModel
}: {
    isOpen: boolean;
    editingProvider: ProviderConfig | null;
    formData: Partial<ProviderConfig>;
    setFormData: Dispatch<SetStateAction<Partial<ProviderConfig>>>;
    keysInput: string;
    setKeysInput: Dispatch<SetStateAction<string>>;
    manualModelInput: string;
    setManualModelInput: Dispatch<SetStateAction<string>>;
    isFetchingModels: boolean;
    onFetchModels: () => void;
    onAddManualModel: () => void;
    showAdvanced: boolean;
    setShowAdvanced: Dispatch<SetStateAction<boolean>>;
    onClose: () => void;
    onSubmit: (e: FormEvent) => void;
    onOpenIconModal: () => void;
    isOnlineLocked: boolean;
    onTestModel: (modelId: string) => void;
    testingModelId: string | null;
    onRemoveModel: (modelId: string) => void;
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 py-8 text-gray-900">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-200">
                <form onSubmit={onSubmit} noValidate className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30 shrink-0">
                        <h2 className="text-lg font-medium">{editingProvider ? '编辑供应商' : '新建供应商'}</h2>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                    {isOnlineLocked && (
                        <div className="px-5 py-2 text-xs font-medium text-amber-700 bg-amber-50 border-b border-amber-100">
                            该供应商来自在线订阅，仅可编辑密钥与模型。
                        </div>
                    )}
                    
                    <div className="p-5 space-y-4 flex-1 overflow-y-auto overflow-x-hidden">
                        <div className="flex items-center gap-3 bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                            <div
                                onClick={() => {
                                    if (isOnlineLocked) return;
                                    onOpenIconModal();
                                }}
                                className={cn("relative group shrink-0", isOnlineLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}
                            >
                                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center p-2 border border-gray-200 group-hover:border-black transition-all shadow-sm">
                                    <img 
                                        src={formData.icon || `/${formData.type}.png`} 
                                        alt="" 
                                        width={48} 
                                        height={48} 
                                        className="w-full h-full object-contain" 
                                        onError={(e) => { e.currentTarget.src = `/${formData.type}.png`; }}
                                    />
                                    {!isOnlineLocked && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                                            <Edit2 className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">名称</span>
                                    <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={isOnlineLocked} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none py-1.5 px-2.5 text-xs bg-white disabled:bg-gray-100 disabled:text-gray-400" />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">类型</span>
                                    <Select 
                                        value={formData.type} 
                                        onValueChange={value => setFormData({ ...formData, type: value as any })}
                                        disabled={isOnlineLocked}
                                    >
                                        <SelectTrigger className="w-full h-[30px] rounded-xl border border-gray-200 focus:border-black outline-none py-1.5 px-2.5 text-xs bg-white shadow-sm flex items-center gap-2">
                                            <div className="flex items-center gap-2">
                                                <Image src={`/${formData.type}.png`} alt="" width={14} height={14} className="object-contain" />
                                                <SelectValue placeholder="选择类型" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-gray-100 rounded-xl shadow-xl">
                                            <SelectItem value="openai">
                                                <div className="flex items-center gap-2">
                                                    <Image src="/openai.png" alt="" width={14} height={14} className="object-contain" />
                                                    <span>OpenAI</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="google">
                                                <div className="flex items-center gap-2">
                                                    <Image src="/google.png" alt="" width={14} height={14} className="object-contain" />
                                                    <span>Google</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="anthropic">
                                                <div className="flex items-center gap-2">
                                                    <Image src="/anthropic.png" alt="" width={14} height={14} className="object-contain" />
                                                    <span>Anthropic</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">基础 URL (Endpoint)</span>
                                <input required type="text" value={formData.baseUrl} onChange={e => setFormData({ ...formData, baseUrl: e.target.value })} disabled={isOnlineLocked} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-2 text-xs bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-400" placeholder="https://..." />
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs font-medium text-black uppercase tracking-widest">API 密钥</span>
                                    <div className="flex items-center gap-3">
                                        {formData.referralText && formData.referralLink && (
                                            <a href={formData.referralLink} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-500 hover:text-blue-600 hover:underline transition-colors">{formData.referralText}</a>
                                        )}
                                    </div>
                                </div>
                                <textarea value={keysInput} onChange={e => setKeysInput(e.target.value)} rows={3} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-2 font-mono text-xs bg-gray-50/30 resize-y" placeholder="一行一个: 密钥 + 空格 + 权重(不填默认10)" />
                            </div>

                            <div className="space-y-2 pt-1">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs font-medium text-black uppercase tracking-widest">可路由模型</span>
                                </div>
                                <div className="group flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-2xl border border-gray-200 hover:border-black/20 focus-within:border-black focus-within:bg-white transition-all shadow-sm">
                                    <div className="flex-1 flex items-center gap-2 px-2">
                                        <input
                                            type="text"
                                            value={manualModelInput}
                                            onChange={e => setManualModelInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onAddManualModel())}
                                            className="flex-1 bg-transparent border-none outline-none py-1 text-xs text-gray-900 placeholder:text-gray-400"
                                            placeholder="手动填写模型 ID..."
                                        />
                                        <button
                                            type="button"
                                            onClick={onAddManualModel}
                                            className="text-xs font-bold text-zinc-400 hover:text-black px-2.5 py-1 hover:bg-zinc-100 rounded-lg transition-all"
                                        >
                                            添加
                                        </button>
                                    </div>
                                    <div className="w-px h-5 bg-gray-200"></div>
                                    <button
                                        type="button"
                                        onClick={onFetchModels}
                                        disabled={isFetchingModels}
                                        className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95 shadow-sm whitespace-nowrap"
                                    >
                                        {isFetchingModels ? <RefreshCw className="w-3 h-3 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                                        获取模型
                                    </button>
                                </div>
                                {formData.models && formData.models.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1 p-2 bg-gray-50/50 rounded-xl border border-gray-100 max-h-24 overflow-y-auto shadow-inner">
                                        {formData.models.map((m, i) => (
                                            <div key={i} className="bg-white px-2 py-0.5 rounded-lg text-xs flex items-center gap-2 border border-gray-200 font-mono shadow-sm">
                                                <button type="button" onClick={() => onTestModel(m)} className="flex items-center gap-1 hover:text-black" title="点击测试模型">
                                                    {testingModelId === m && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                                                    <span>{m}</span>
                                                </button>
                                                <button type="button" onClick={() => onRemoveModel(m)} className="text-gray-400 hover:text-red-500 p-0.5"><X className="w-2.5 h-2.5" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-3 mt-4">
                            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:text-black transition-colors w-full py-1 px-1">
                                <Settings2 className="w-3 h-3" />
                                {showAdvanced ? '隐藏可选设置' : '展开可选设置'}
                                {showAdvanced ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                            </button>
                            
                            {showAdvanced && (
                                <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200 px-1">
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">描述备注 (可选)</span>
                                        <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} disabled={isOnlineLocked} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-2 text-xs bg-white resize-y disabled:bg-gray-100 disabled:text-gray-400" placeholder="来源说明..." />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-black uppercase tracking-widest">官方主页 URL (可选)</span>
                                        <input type="url" value={formData.homepageUrl || ''} onChange={e => setFormData({ ...formData, homepageUrl: e.target.value })} disabled={isOnlineLocked} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-2 text-xs bg-white disabled:bg-gray-100 disabled:text-gray-400" placeholder="https://..." />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 shrink-0">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200">取消</button>
                        <button type="submit" className="px-8 text-xs py-2 font-medium text-white bg-black hover:bg-gray-800 rounded-lg shadow-lg transition-all active:scale-95 tracking-widest">保存项目</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
