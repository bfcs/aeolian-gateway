import { useState, useMemo } from 'react';
import { X, Search, Activity, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { callAdminModelTest, parseWeightedKeysInput } from '@/lib/client/admin-model-test';

export default function ModelSelectorDialog({
    availableModels,
    selectedModels,
    providerName,
    baseUrl,
    type,
    keysInput,
    onSelectionChange,
    onClose
}: {
    availableModels: string[],
    selectedModels: string[],
    providerName: string,
    baseUrl: string,
    type: 'openai' | 'google' | 'anthropic',
    keysInput: string,
    onSelectionChange: (models: string[]) => void,
    onClose: () => void
}) {
    const [filter, setFilter] = useState('');
    const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedModels));
    const [testResults, setTestResults] = useState<Record<string, { loading: boolean, success?: boolean, error?: string, duration?: number }>>({});
    const toast = useToast();

    const filteredModels = useMemo(() => {
        return availableModels.filter(m => m.toLowerCase().includes(filter.toLowerCase()));
    }, [availableModels, filter]);

    const toggleModel = (model: string) => {
        const next = new Set(localSelected);
        if (next.has(model)) {
            next.delete(model);
        } else {
            next.add(model);
        }
        setLocalSelected(next);
    };

    const handleTest = async (e: React.MouseEvent, model: string) => {
        e.preventDefault();
        e.stopPropagation();
        
        const keys = parseWeightedKeysInput(keysInput);
        if (keys.length === 0) {
            return toast.error("未找到有效的 API 密钥（仅测试 weight > 0），无法进行测试");
        }
        
        setTestResults(prev => ({ ...prev, [model]: { loading: true } }));
        try {
            const res = await callAdminModelTest({
                providerName,
                baseUrl,
                type,
                modelId: model,
                keys
            });
            const finalError = res.error || '全部 key 失效';

            (res.attempts || []).forEach((attempt) => {
                if (attempt.nextKeyPreview) {
                    toast.warning(`key: ${attempt.keyPreview} 错误，正在测 key: ${attempt.nextKeyPreview}`);
                }
            });

            setTestResults(prev => ({ 
                ...prev, 
                [model]: { 
                    loading: false, 
                    success: res.success, 
                    error: res.success ? undefined : finalError, 
                    duration: res.duration 
                } 
            }));
            
            if (res.success) {
                toast.success(`模型 ${model} 测试通过！响应耗时: ${res.duration}ms`);
            } else {
                toast.error(`模型 ${model} 测试失败: ${finalError}`);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '未知错误';
            setTestResults(prev => ({ ...prev, [model]: { loading: false, success: false, error: message } }));
            toast.error(`测试过程中发生错误: ${message}`);
        }
    };

    const handleSave = () => {
        onSelectionChange(Array.from(localSelected));
        onClose();
    };

    const handleSelectAllFiltered = () => {
        const next = new Set(localSelected);
        filteredModels.forEach(m => next.add(m));
        setLocalSelected(next);
    };

    const handleDeselectAllFiltered = () => {
        const next = new Set(localSelected);
        filteredModels.forEach(m => next.delete(m));
        setLocalSelected(next);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-4/5 animate-in slide-in-from-bottom-4 duration-300 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-medium text-lg text-gray-800">选择模型</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-4 border-b border-gray-100 space-y-3 bg-white shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="1. 请只添加用得到的模型 2. 点击后面的测试按钮，测试成功再添加"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            className="w-full h-10 pl-9 pr-4 text-sm border border-gray-200 rounded-xl focus:border-black focus:ring-1 focus:ring-black/5 bg-white shadow-sm transition-all outline-none"
                        />
                    </div>
                    
                    <div className="flex gap-2">
                        <button type="button" onClick={handleSelectAllFiltered} className="text-xs bg-black hover:bg-gray-800 px-3 py-1.5 rounded-lg font-medium text-white transition-colors">全选</button>
                        <button type="button" onClick={handleDeselectAllFiltered} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium text-gray-700 transition-colors">取消全选</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-gray-50/50">
                    {filteredModels.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-8">没有匹配该筛选词的模型</div>
                    ) : (
                        filteredModels.map(model => {
                            const result = testResults[model];
                            return (
                                <div key={model} className="flex items-center gap-2">
                                    <label className="flex-1 flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-black hover:shadow-sm cursor-pointer transition-all select-none group">
                                        <input
                                            type="checkbox"
                                            checked={localSelected.has(model)}
                                            onChange={() => toggleModel(model)}
                                            className="mt-0.5 rounded border-gray-300 text-black focus:ring-black w-4 h-4 cursor-pointer accent-black shrink-0"
                                        />
                                        <div className="flex-1 flex flex-col min-w-0">
                                            <span className="font-mono text-xs text-gray-700 break-all leading-tight">{model}</span>
                                            {result && !result.loading && (
                                                <div className={cn(
                                                    "mt-1 text-xs font-medium flex items-center gap-1.5",
                                                    result.success ? "text-green-600" : "text-red-500"
                                                )}>
                                                    {result.success ? (
                                                        <>
                                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                                            响应正常 ({result.duration}ms)
                                                        </>
                                                    ) : (
                                                        <>
                                                            <AlertCircle className="w-2.5 h-2.5" />
                                                            测试失败: {result.error}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={(e) => handleTest(e, model)}
                                        disabled={result?.loading}
                                        className={cn(
                                            "shrink-0 w-8 h-8 flex items-center justify-center rounded-xl border transition-all",
                                            result?.loading ? "bg-gray-50 text-gray-400 border-gray-100" : 
                                            result?.success ? "bg-green-50 text-green-600 border-green-100 hover:border-green-500" :
                                            result?.error ? "bg-red-50 text-red-500 border-red-100 hover:border-red-500" :
                                            "bg-white text-gray-400 border-gray-100 hover:text-black hover:border-black"
                                        )}
                                        title="测试响应"
                                    >
                                        {result?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-between items-center shadow-sm">
                    <span className="text-sm font-medium text-gray-500">已选择 <span className="font-medium text-black">{localSelected.size}</span> 个模型</span>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200">取消</button>
                        <button onClick={handleSave} className="bg-black hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl text-xs font-medium transition-all shadow-sm active:scale-95 uppercase tracking-widest">
                            确认选择
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
