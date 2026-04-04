'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Copy, Check, Search, X, ChevronDown, Settings2, ChevronUp, LayoutGrid, List as ListIcon } from 'lucide-react';
import { GatewayKey } from '@/lib/server/d1';
import { createKeyAction, deleteKeyAction, toggleKeyAction, updateKeyAction } from '@/app/actions/keys';
import { fetchAvailableModelsWithProviders } from '@/app/actions/providers';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

const ENDPOINT_TYPES = ['openai', 'google', 'anthropic'] as const;
type EndpointType = (typeof ENDPOINT_TYPES)[number];

const MODELS_CACHE_KEY = 'admin-keys-models-cache-v2';
const ACTIVE_ENDPOINT_TYPE_KEY = 'admin-keys-active-endpoint-type-v1';

type ModelsCachePayload = {
    savedAt: number;
    modelsByType: Record<EndpointType, string[]>;
    modelProvidersByType: Record<EndpointType, Record<string, string[]>>;
    allModels: string[];
};

const isEndpointType = (value: string): value is EndpointType => {
    return (ENDPOINT_TYPES as readonly string[]).includes(value);
};

const ENDPOINT_TYPE_META: Record<EndpointType, { label: string; icon: React.ReactNode }> = {
    google: {
        label: 'Google',
        icon: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m31.6814,34.8868c-1.9155,1.29-4.3586,2.0718-7.2514,2.0718-5.59,0-10.3395-3.7723-12.04-8.8541v-.0195c-.43-1.29-.6841-2.6582-.6841-4.085s.2541-2.795.6841-4.085c1.7005-5.0818,6.45-8.8541,12.04-8.8541,3.1664,0,5.9809,1.0945,8.2286,3.2055l6.1568-6.1568c-3.7332-3.4791-8.5805-5.6095-14.3855-5.6095-8.4045,0-15.6559,4.8277-19.1936,11.8641-1.4659,2.8927-2.3064,6.1568-2.3064,9.6359s.8405,6.7432,2.3064,9.6359v.0195c3.5377,7.0168,10.7891,11.8445,19.1936,11.8445,5.805,0,10.6718-1.9155,14.2291-5.1991,4.0655-3.7527,6.4109-9.2645,6.4109-15.8123,0-1.5245-.1368-2.9905-.3909-4.3977h-20.2491v8.3264h11.5709c-.5082,2.6777-2.0327,4.945-4.3195,6.4695h0Z" />
            </svg>
        )
    },
    openai: {
        label: 'OpenAI',
        icon: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" role="img" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
            </svg>
        )
    },
    anthropic: {
        label: 'Anthropic',
        icon: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" role="img" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="m13.788825 3.932 6.43325 16.136075h3.5279L17.316725 3.932H13.788825Z"></path>
                <path fill="currentColor" d="m6.325375 13.682775 2.20125 -5.67065 2.201275 5.67065H6.325375ZM6.68225 3.932 0.25 20.068075h3.596525l1.3155 -3.3886h6.729425l1.315275 3.3886h3.59655L10.371 3.932H6.68225Z"></path>
            </svg>
        )
    }
};

const ENDPOINT_SECTION_LABELS: Record<EndpointType, string> = {
    openai: 'OpenAI 接口地址',
    google: 'Google 接口地址',
    anthropic: 'Anthropic 接口地址'
};

const normalizeModelsPayload = (payload: {
    modelsByType?: Record<string, string[]>;
    modelProvidersByType?: Record<string, Record<string, string[]>>;
}) => {
    const modelsMap = payload.modelsByType || {};
    const rawProvidersMap = payload.modelProvidersByType || {};
    const modelsByType: Record<EndpointType, string[]> = {
        openai: [],
        google: [],
        anthropic: []
    };
    const modelProvidersByType: Record<EndpointType, Record<string, string[]>> = {
        openai: {},
        google: {},
        anthropic: {}
    };

    ENDPOINT_TYPES.forEach((type) => {
        const set = new Set<string>();
        (modelsMap[type] || []).forEach((model) => {
            const normalized = model.trim();
            if (normalized) set.add(normalized);
        });
        modelsByType[type] = Array.from(set).sort((a, b) => a.localeCompare(b));

        const providerEntries = Object.entries(rawProvidersMap[type] || {}).map(([modelId, providerNames]) => {
            const normalizedModelId = modelId.trim();
            const uniqueProviderNames = Array.from(new Set((providerNames || []).map((providerName) => providerName.trim()).filter(Boolean)))
                .sort((a, b) => a.localeCompare(b));
            return [normalizedModelId, uniqueProviderNames] as const;
        }).filter(([modelId, providerNames]) => modelId && providerNames.length > 0);

        modelProvidersByType[type] = Object.fromEntries(providerEntries);
    });

    const uniqueModels = new Set<string>();
    Object.values(modelsByType).forEach((models) => {
        models.forEach((model) => uniqueModels.add(model));
    });

    return {
        modelsByType,
        modelProvidersByType,
        allModels: Array.from(uniqueModels).sort((a, b) => a.localeCompare(b))
    };
};

export default function KeysClient({ initialKeys }: { initialKeys: GatewayKey[] }) {
    const [keys, setKeys] = useState<GatewayKey[]>(initialKeys);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingKey, setEditingKey] = useState<GatewayKey | null>(null);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyDescription, setNewKeyDescription] = useState('');
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [availableModelsByType, setAvailableModelsByType] = useState<Record<EndpointType, string[]>>({
        openai: [],
        google: [],
        anthropic: []
    });
    const [modelProvidersByType, setModelProvidersByType] = useState<Record<EndpointType, Record<string, string[]>>>({
        openai: {},
        google: {},
        anthropic: {}
    });
    const [activeEndpointType, setActiveEndpointType] = useState<EndpointType>(() => {
        if (typeof window === 'undefined') return 'openai';
        try {
            const raw = localStorage.getItem(ACTIVE_ENDPOINT_TYPE_KEY);
            if (raw && isEndpointType(raw)) {
                return raw;
            }
        } catch {
            // Ignore localStorage read errors and fallback to default.
        }
        return 'openai';
    });
    const [endpointBase, setEndpointBase] = useState('https://host');
    const [isModelsLoading, setIsModelsLoading] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const toast = useToast();

    useEffect(() => {
        const loadModels = async () => {
            let hasCache = false;
            try {
                const cacheRaw = localStorage.getItem(MODELS_CACHE_KEY);
                if (cacheRaw) {
                    const cache = JSON.parse(cacheRaw) as ModelsCachePayload;
                    if (cache?.modelsByType && cache?.modelProvidersByType && Array.isArray(cache?.allModels)) {
                        setAvailableModelsByType(cache.modelsByType);
                        setModelProvidersByType(cache.modelProvidersByType);
                        setAvailableModels(cache.allModels);
                        hasCache = true;
                    }
                }
            } catch {
                // Ignore malformed cache and continue fetching from server.
            }

            setIsModelsLoading(!hasCache);
            try {
                const payload = await fetchAvailableModelsWithProviders();
                const normalized = normalizeModelsPayload(payload);

                setAvailableModelsByType(normalized.modelsByType);
                setModelProvidersByType(normalized.modelProvidersByType);
                setAvailableModels(normalized.allModels);
                localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({
                    savedAt: Date.now(),
                    modelsByType: normalized.modelsByType,
                    modelProvidersByType: normalized.modelProvidersByType,
                    allModels: normalized.allModels
                } satisfies ModelsCachePayload));
            } catch (e) {
                console.error("Failed to load models", e);
            } finally {
                setIsModelsLoading(false);
            }
        };
        loadModels();
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(ACTIVE_ENDPOINT_TYPE_KEY, activeEndpointType);
        } catch {
            // Ignore localStorage write errors.
        }
    }, [activeEndpointType]);

    useEffect(() => {
        setEndpointBase(window.location.origin);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredModelsForDropdown = availableModels
        .filter((model) => model.toLowerCase().includes(modelSearch.toLowerCase()))
        .filter((model) => !selectedModels.includes(model));

    const handleModelSelect = (modelName: string) => {
        const normalized = modelName.trim();
        if (!normalized) return;
        if (!availableModels.includes(normalized)) return;
        if (!selectedModels.includes(normalized)) {
            setSelectedModels([...selectedModels, normalized]);
        }
        setModelSearch('');
        setShowModelDropdown(false);
    };

    const removeModel = (modelName: string) => {
        setSelectedModels(selectedModels.filter(m => m !== modelName));
    };

    const [copied, setCopied] = useState<string | null>(null);
    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(text);
        toast.success("已复制到剪贴板！");
        setTimeout(() => setCopied(null), 2000);
    };

    const handleTypeChange = (type: EndpointType) => {
        setActiveEndpointType(type);
        try {
            localStorage.setItem(ACTIVE_ENDPOINT_TYPE_KEY, type);
        } catch {
            // Ignore localStorage write errors.
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim()) return toast.error("请输入密钥名称");
        if (modelSearch.trim()) return toast.error("请先从下拉中选择模型，或清空输入框后再保存");
        try {
            if (editingKey) {
                const result = await updateKeyAction(editingKey.id, newKeyName, newKeyDescription, selectedModels);
                if (!result.success) return toast.error(result.error || "更新失败");
                toast.success("密钥已成功更新。");
                setIsModalOpen(false);
                setEditingKey(null);
                setNewKeyName('');
                setNewKeyDescription('');
                setSelectedModels([]);
                setKeys(prev => prev.map(k => k.id === editingKey.id ? { ...k, name: newKeyName, description: newKeyDescription, allowed_models: selectedModels } : k));
            } else {
                const result = await createKeyAction(newKeyName, newKeyDescription, selectedModels);
                if (!result.success) return toast.error(result.error || "创建失败");
                if (result.key) {
                    setGeneratedKey(result.key);
                }
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "保存失败，请检查模型输入";
            toast.error(message);
        }
    };

    const handleEdit = (key: GatewayKey) => {
        setEditingKey(key);
        setNewKeyName(key.name);
        setNewKeyDescription(key.description || '');
        setSelectedModels(key.allowed_models || []);
        setModelSearch('');
        setShowModelDropdown(false);
        setShowAdvanced(false);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setGeneratedKey(null);
        setEditingKey(null);
        setNewKeyName('');
        setNewKeyDescription('');
        setSelectedModels([]);
        setModelSearch('');
        setShowModelDropdown(false);
        if (generatedKey) {
            window.location.reload(); 
        }
    }

    const handleDelete = async (id: string) => {
        toast.confirm({
            message: '确认要撤销此密钥吗？使用该密钥的用户将立即被阻止。',
            type: 'danger',
            confirmText: '撤销',
            onConfirm: async () => {
                await deleteKeyAction(id);
                setKeys(prev => prev.filter(k => k.id !== id));
                toast.success("密钥已成功撤销。");
            }
        });
    };

    const handleToggle = async (key: GatewayKey) => {
        await toggleKeyAction(key.id, key.is_enabled);
        setKeys(prev => prev.map(k => k.id === key.id ? { ...k, is_enabled: !k.is_enabled } : k));
    };

    const filteredKeys = keys.filter(k => 
        k.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8 pb-12 max-w-7xl mx-auto text-gray-900">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-medium tracking-tight">网关密钥</h1>
                    <p className="text-gray-500 text-sm mt-1 font-medium">管理客户端访问所使用的 API 密钥。</p>
                </div>
                <button
                    onClick={() => { setIsModalOpen(true); setShowAdvanced(false); setModelSearch(''); setShowModelDropdown(false); }}
                    className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    创建密钥
                </button>
            </div>

            <div className="mb-8 p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
                <p className="text-xs font-bold text-black uppercase tracking-widest mb-4 ml-1">API 代理端点</p>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    {ENDPOINT_TYPES.map((type) => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => handleTypeChange(type)}
                            className={cn(
                                "h-8 px-4 rounded-full text-xs font-medium transition-all border flex items-center gap-2",
                                activeEndpointType === type
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-gray-600 border-gray-100 hover:border-gray-300 hover:bg-gray-50"
                            )}
                        >
                            {ENDPOINT_TYPE_META[type].icon}
                            {ENDPOINT_TYPE_META[type].label}
                        </button>
                    ))}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">
                                {ENDPOINT_SECTION_LABELS[activeEndpointType]}
                            </span>
                            <span className="text-xs text-gray-500 font-mono">1</span>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-white p-2">
                            <button
                                type="button"
                                onClick={() => copyToClipboard(`${endpointBase}/api/${activeEndpointType}`)}
                                className="w-full text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-700 transition-colors break-all"
                                title="点击复制 endpoint"
                            >
                                {`${endpointBase}/api/${activeEndpointType}`}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-gray-400 tracking-tight">模型 ID 集合</span>
                            <span className="text-xs text-gray-500 font-mono">{(availableModelsByType[activeEndpointType] || []).length}</span>
                        </div>
                        <div className="h-32 overflow-y-auto rounded-xl border border-gray-100 bg-white p-2">
                            {(availableModelsByType[activeEndpointType] || []).length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {(availableModelsByType[activeEndpointType] || []).map((modelId) => (
                                        <button
                                            key={`${activeEndpointType}-${modelId}`}
                                            type="button"
                                            onClick={() => copyToClipboard(modelId)}
                                            className="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-700 transition-colors max-w-full truncate"
                                            title={(modelProvidersByType[activeEndpointType]?.[modelId] || []).join(' / ') || '未关联 Provider'}
                                        >
                                            {modelId}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-xs text-gray-400 uppercase tracking-tight">
                                    {isModelsLoading ? '加载中...' : '暂无模型'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 控制栏 */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="搜索密钥..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-1.5 rounded-xl border border-gray-100 focus:border-black outline-none transition-all text-sm w-full bg-gray-50/50"
                    />
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-lg transition-all", viewMode === 'list' ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600")}><ListIcon className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('card')} className={cn("p-1.5 rounded-lg transition-all", viewMode === 'card' ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600")}><LayoutGrid className="w-4 h-4" /></button>
                </div>
            </div>

            {viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredKeys.map((key) => (
                        <div key={key.id} onClick={() => handleEdit(key)} className="group bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-black transition-all duration-300 flex flex-col max-h-105 cursor-pointer relative">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 leading-tight truncate max-w-40">{key.name}</h3>
                                    {key.description && (
                                        <p className="text-xs text-gray-500 line-clamp-1 font-normal mt-0.5">{key.description}</p>
                                    )}
                                    <span className="text-gray-400 font-medium mt-1 block uppercase tracking-widest" style={{ fontSize: '10px' }}>
                                        {new Date(key.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDelete(key.id); }} 
                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleToggle(key); }} className={cn("relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none", key.is_enabled ? 'bg-black' : 'bg-gray-200')}><span className={cn("pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", key.is_enabled ? 'translate-x-4' : 'translate-x-0')} /></button>
                                </div>
                            </div>

                            <div className="space-y-4 mb-2 overflow-hidden flex-1">
                                <div onClick={(e) => { e.stopPropagation(); copyToClipboard(key.key_hash); }} className="flex items-center justify-between text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 group-hover:border-gray-300 transition-colors cursor-pointer group/copy">
                                    <code className="font-mono text-gray-600 truncate mr-2">
                                        {key.key_hash.substring(0, 12)}...
                                    </code>
                                    <div className="text-gray-400 group-hover/copy:text-black transition-colors shrink-0">
                                        {copied === key.key_hash ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                    </div>
                                </div>

                                <div className="overflow-hidden">
                                    <div className="text-black uppercase font-medium tracking-widest mb-2" style={{ fontSize: '10px' }}>允许模型</div>
                                    <div className="flex flex-wrap gap-1.5 content-start max-h-20 overflow-hidden pb-1">
                                        {key.allowed_models && key.allowed_models.length > 0 ? (
                                            <>
                                                {key.allowed_models.slice(0, 6).map(m => (
                                                    <span key={m} className="bg-white border border-gray-200 px-2 py-1 rounded-lg font-medium text-gray-600 shadow-sm truncate max-w-30 font-mono" style={{ fontSize: '10px' }}>{m}</span>
                                                ))}
                                                {key.allowed_models.length > 6 && <span className="text-gray-400 px-2 py-1 font-medium" style={{ fontSize: '10px' }}>+{ key.allowed_models.length - 6 }</span>}
                                            </>
                                        ) : (
                                            <span className="text-gray-400 font-medium bg-gray-50 px-3 py-2 rounded-xl border border-dashed border-gray-200 w-full text-center uppercase tracking-widest" style={{ fontSize: '10px' }}>所有模型均可用</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase">
                            <tr>
                                <th className="px-6 py-4">密钥名称</th>
                                <th className="px-6 py-4">描述</th>
                                <th className="px-6 py-4">令牌</th>
                                <th className="px-6 py-4">状态</th>
                                <th className="px-6 py-4">创建时间</th>
                                <th className="px-6 py-4">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredKeys.map((key) => (
                                <tr key={key.id} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => handleEdit(key)}>
                                    <td className="px-6 py-4 font-medium text-gray-900">{key.name}</td>
                                    <td className="px-6 py-4 text-gray-500 text-xs truncate max-w-48">{key.description || '-'}</td>
                                    <td className="px-6 py-4"><div className="flex items-center gap-2 font-mono text-gray-500 text-xs">{key.key_hash.substring(0, 12)}...<button onClick={(e) => { e.stopPropagation(); copyToClipboard(key.key_hash); }} className="text-gray-400 hover:text-black">{copied === key.key_hash ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}</button></div></td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); handleToggle(key); }} className={cn("relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out", key.is_enabled ? 'bg-black' : 'bg-gray-200')}><span className={cn("pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", key.is_enabled ? 'translate-x-4' : 'translate-x-0')} /></button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-xs">{new Date(key.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-left">
                                        <div className="flex justify-start gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(key.id); }} className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 py-8 text-gray-900">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-200">
                        {!generatedKey ? (
                            <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30 shrink-0 rounded-t-2xl">
                                    <h2 className="text-lg font-medium">{editingKey ? '编辑密钥' : '新建密钥'}</h2>
                                    <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                                    <label className="block space-y-1.5 -mt-2">
                                        <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">名称 / 备注</span>
                                        <input autoFocus required type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none py-2 px-3 text-xs bg-white shadow-sm" placeholder="例如 前端应用 V1" />
                                    </label>
                                    
                                    <div className="space-y-3">
                                        <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">限制可用模型 (留空则不限)</span>
                                        <div className="relative" ref={dropdownRef}>
                                            <div className="flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-black transition-all overflow-hidden shadow-sm">
                                                <input type="text" value={modelSearch} onChange={e => { setModelSearch(e.target.value); setShowModelDropdown(true); }} onFocus={() => setShowModelDropdown(true)} className="flex-1 border-none focus:ring-0 py-2.5 px-3 text-xs outline-none" placeholder="搜索或选择模型..." />
                                                <button type="button" onClick={() => setShowModelDropdown(!showModelDropdown)} className="p-2 text-gray-400 hover:text-black"><ChevronDown className={cn("w-4 h-4 transition-transform", showModelDropdown && "rotate-180")} /></button>
                                            </div>
                                            {showModelDropdown && (
                                                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                                                    {isModelsLoading ? <div className="p-4 text-center text-xs text-gray-400">加载中...</div> : filteredModelsForDropdown.length > 0 ? (<div className="p-1">{filteredModelsForDropdown.map((model) => (<button key={model} type="button" onClick={() => handleModelSelect(model)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-all"><span className="text-xs font-medium">{model}</span></button>))}</div>) : (<div className="p-4 text-center text-xs text-gray-400">无匹配模型</div>)}
                                                </div>
                                            )}
                                        </div>
                                        {selectedModels.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2 p-2 bg-gray-50/50 rounded-xl border border-gray-100 max-h-60 overflow-y-auto shadow-inner">
                                                {selectedModels.map(m => (<span key={m} className="bg-white text-black pl-2 pr-1 py-0.5 rounded-lg text-xs font-medium flex items-center gap-1 border border-gray-200 font-mono shadow-sm">{m}<button type="button" onClick={() => removeModel(m)} className="hover:text-red-500 p-0.5"><X className="w-3 h-3" /></button></span>))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Advanced Panel */}
                                    <div className="border-t border-gray-100 pt-3 mt-4">
                                        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:text-black transition-colors w-full py-1">
                                            <Settings2 className="w-3 h-3" />
                                            {showAdvanced ? '隐藏可选设置' : '展开可选设置'}
                                            {showAdvanced ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                                        </button>
                                        {showAdvanced && (
                                            <div className="mt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                                <label className="block space-y-1">
                                                    <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">用途备注 (可选)</span>
                                                    <textarea value={newKeyDescription} onChange={e => setNewKeyDescription(e.target.value)} rows={2} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-2 text-xs bg-white shadow-sm resize-y" placeholder="密钥用途说明..." />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 shrink-0 rounded-b-2xl">
                                    <button type="button" onClick={closeModal} className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200">取消</button>
                                    <button type="submit" className="px-8 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-xl shadow-lg transition-all active:scale-95 uppercase tracking-widest">{editingKey ? '保存修改' : '生成密钥'}</button>
                                </div>
                            </form>
                        ) : (
                            <div className="flex flex-col">
                                <div className="p-4 border-b border-gray-100 bg-emerald-50 rounded-t-2xl"><h2 className="text-lg font-medium text-emerald-700 flex items-center gap-2"><Check className="w-5 h-5" /> 密钥已创建</h2></div>
                                <div className="p-6 text-gray-900"><div className="bg-white rounded-2xl p-4 shadow-inner relative group border border-gray-300"><div className="text-black font-mono text-xs break-all pr-10 leading-relaxed tracking-wider">{generatedKey}</div><button onClick={() => copyToClipboard(generatedKey)} className="absolute right-3 top-4 text-gray-400 hover:text-black transition-colors">{copied === generatedKey ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}</button></div><div className="mt-8 flex justify-end"><button onClick={closeModal} className="px-10 py-2.5 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-xl shadow-lg transition-all active:scale-95 uppercase tracking-widest">完成并关闭</button></div></div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
