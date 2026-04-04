'use client';

import { useState, useEffect } from 'react';
import { Plus, RefreshCw, DownloadCloud, LayoutGrid, List as ListIcon, Search, Layers, CheckCircle2 } from 'lucide-react';
import { ProviderConfig, ProviderKey } from '@/lib/server/providers';
import { createProvider, deleteProviderAction, updateProviderAction, fetchRemoteModels, subscribeProvidersAction, fetchSubscriptionProvidersAction, fetchProviders as fetchProvidersAction, type SubscriptionProvider } from '@/app/actions/providers';
import ModelSelectorDialog from './model-selector-dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import ProvidersView from './providers/ProvidersView';
import ProviderEditModal from './providers/ProviderEditModal';
import ProviderIconModal from './providers/ProviderIconModal';
import SubscriptionListModal from './providers/SubscriptionListModal';
import SubscriptionUrlModal from './providers/SubscriptionUrlModal';
import { callAdminModelTest, parseWeightedKeysInput } from '@/lib/client/admin-model-test';

export default function ProvidersClient({ initialProviders, subscriptionUrl }: { initialProviders: ProviderConfig[], subscriptionUrl?: string }) {
    const [providers, setProviders] = useState<ProviderConfig[]>(initialProviders);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
    const [filter, setFilter] = useState<'all' | 'configured' | 'google' | 'openai' | 'anthropic'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const toast = useToast();

    // Form State
    const [formData, setFormData] = useState<Partial<ProviderConfig>>({
        name: '',
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        description: '',
        models: [],
        modelAliases: {},
        keys: [],
        isEnabled: true,
        isOnline: false,
        homepageUrl: '',
        referralText: '',
        referralLink: '',
    });

    const [keysInput, setKeysInput] = useState('');
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [fetchedModels, setFetchedModels] = useState<string[]>([]);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [manualModelInput, setManualModelInput] = useState('');
    const [testingModelId, setTestingModelId] = useState<string | null>(null);
    
    // Icon Edit State
    const [isIconModalOpen, setIsIconModalOpen] = useState(false);
    const [tempIconUrl, setTempIconUrl] = useState('');
    
    // Subscribe State
    const [isSubModalOpen, setIsSubModalOpen] = useState(false);
    const [subscribeUrl, setSubscribeUrl] = useState('');
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [isSubListModalOpen, setIsSubListModalOpen] = useState(false);
    const [subscriptionProviders, setSubscriptionProviders] = useState<SubscriptionProvider[]>([]);
    const [selectedSubKeys, setSelectedSubKeys] = useState<string[]>([]);
    const [isSubListLoading, setIsSubListLoading] = useState(false);
    const [isSyncSelected, setIsSyncSelected] = useState(false);
    const [isUpdatingAll, setIsUpdatingAll] = useState(false);
    const [updatingKeys, setUpdatingKeys] = useState<string[]>([]);

    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success("已复制 URL！");
    };

    const getSubscriptionKey = (p: SubscriptionProvider) => p.id || `${p.name || ''}::${p.type || ''}`;

    const hasExistingProvider = (p: SubscriptionProvider) => {
        if (!p.id) return false;
        return providers.some(ep => ep.id === p.id);
    };

    const openSubscriptionList = async () => {
        if (!subscriptionUrl) return setIsSubModalOpen(true);
        setIsSubListLoading(true);
        try {
            const res = await fetchSubscriptionProvidersAction(subscriptionUrl);
            if (!res.success) {
                toast.error("加载订阅失败: " + res.error);
                return;
            }
            setSubscriptionProviders(res.providers || []);
            const defaults = (res.providers || [])
                .filter((p: SubscriptionProvider) => hasExistingProvider(p))
                .map((p: SubscriptionProvider) => getSubscriptionKey(p));
            setSelectedSubKeys(defaults);
            setIsSubListModalOpen(true);
        } finally {
            setIsSubListLoading(false);
        }
    };

    const refreshProvidersList = async () => {
        try {
            const latest = await fetchProvidersAction();
            setProviders(latest);
        } catch (e) {
            toast.error("刷新供应商列表失败: " + (e as Error).message);
        }
    };

    // Auto-update BaseURL
    useEffect(() => {
        if (!editingProvider && formData.type === 'google') {
            setFormData(prev => ({ ...prev, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/' }));
        } else if (!editingProvider && formData.type === 'openai') {
            setFormData(prev => ({ ...prev, baseUrl: 'https://api.openai.com/v1' }));
        }
    }, [formData.type, editingProvider]);

    const handleSyncSelected = async () => {
        if (selectedSubKeys.length === 0) return toast.error("请先选择至少一个供应商");
        setIsSyncSelected(true);
        try {
            const res = await subscribeProvidersAction({ providerKeys: selectedSubKeys, url: subscriptionUrl });
            if (res?.success) {
                toast.success(`成功同步了 ${res.count} 个供应商。`);
                await refreshProvidersList();
            } else {
                toast.error("同步失败: " + (res?.error || "未知错误"));
            }
        } finally {
            setIsSyncSelected(false);
        }
    };

    const handleUpdateOne = async (p: SubscriptionProvider) => {
        const key = getSubscriptionKey(p);
        setUpdatingKeys(prev => [...prev, key]);
        try {
            const res = await subscribeProvidersAction({ providerKeys: [key], url: subscriptionUrl });
            if (res?.success) {
                toast.success(`已更新 ${p.name || '供应商'}。`);
                await refreshProvidersList();
            } else {
                toast.error("更新失败: " + (res?.error || "未知错误"));
            }
        } finally {
            setUpdatingKeys(prev => prev.filter(k => k !== key));
        }
    };

    const handleUpdateAll = async () => {
        setIsUpdatingAll(true);
        try {
            const existingKeys = subscriptionProviders
                .filter((p: SubscriptionProvider) => hasExistingProvider(p))
                .map((p: SubscriptionProvider) => getSubscriptionKey(p));
            if (existingKeys.length === 0) {
                toast.error("没有可更新的已存在供应商");
                return;
            }
            const res = await subscribeProvidersAction({ url: subscriptionUrl, providerKeys: existingKeys });
            if (res?.success) {
                toast.success(`成功同步了 ${res.count} 个供应商。`);
                await refreshProvidersList();
            } else {
                toast.error("同步失败: " + (res?.error || "未知错误"));
            }
        } finally {
            setIsUpdatingAll(false);
        }
    };

    const handleOpenHomepage = (e: React.MouseEvent, url: string | undefined | null) => {
        e.stopPropagation();
        if (!url || !url.trim()) {
            return toast.error("该供应商未配置官方主页 URL");
        }
        window.open(url, '_blank');
    };

    const handleOpenModal = (provider?: ProviderConfig) => {
        setShowAdvanced(false);
        if (provider) {
            setEditingProvider(provider);
            setFormData({ 
                ...provider, 
                models: provider.models || [], 
                modelAliases: provider.modelAliases || {}, 
                homepageUrl: provider.homepageUrl || '',
                icon: provider.icon || null,
                description: provider.description || '',
                referralText: provider.referralText || '',
                referralLink: provider.referralLink || '',
                isOnline: provider.isOnline ?? false
            });
            setKeysInput(provider.keys.map(k => k.weight !== 10 ? `${k.key} ${k.weight}` : k.key).join('\n'));
        } else {
            setEditingProvider(null);
            setFormData({
                name: '', type: 'openai', baseUrl: 'https://api.openai.com/v1', description: '',
                models: [], modelAliases: {}, keys: [], isEnabled: true, homepageUrl: '',
                referralText: '', referralLink: '', isOnline: false
            });
            setKeysInput('');
        }
        setIsModalOpen(true);
    };

    const handleFetchModels = async () => {
        if (!formData.baseUrl) return toast.error("基础 URL 是必填项");
        const firstLine = keysInput.split('\n')[0]?.trim();
        const firstKey = firstLine?.split(/\s+/)[0];
        if (!firstKey) return toast.error("请至少输入一个 API 密钥以获取模型");
        setIsFetchingModels(true);
        try {
            const models = await fetchRemoteModels(formData.baseUrl, firstKey, formData.type as 'openai' | 'google');
            if (models && models.length > 0) { setFetchedModels(models); setShowModelSelector(true); } else { toast.error("未找到模型或无法识别 ID 格式。"); }
        } catch (e) { toast.error("获取模型失败: " + (e as Error).message); } finally { setIsFetchingModels(false); }
    };

    const handleTestModel = async (modelId: string) => {
        const keys = parseWeightedKeysInput(keysInput);
        if (keys.length === 0) return toast.error("请先填写至少一个权重大于 0 的 API 密钥以测试模型");
        if (!formData.baseUrl) return toast.error("基础 URL 是必填项");
        setTestingModelId(modelId);
        try {
            const type = (formData.type || 'openai') as 'openai' | 'google' | 'anthropic';
            const res = await callAdminModelTest({
                providerName: formData.name || '',
                baseUrl: formData.baseUrl,
                type,
                modelId,
                keys
            });

            (res.attempts || []).forEach((attempt) => {
                if (attempt.nextKeyPreview) {
                    toast.warning(`key: ${attempt.keyPreview} 错误，正在测 key: ${attempt.nextKeyPreview}`);
                }
            });

            if (res?.success) {
                toast.success(`测试成功 (${res.duration}ms)`);
            } else {
                toast.error("测试失败: " + (res?.error || "全部 key 失效"));
            }
        } catch (e) {
            toast.error("测试失败: " + (e as Error).message);
        } finally {
            setTestingModelId(null);
        }
    };

    const addManualModel = () => {
        const modelId = manualModelInput.trim();
        if (!modelId) return;
        
        const currentModels = formData.models || [];
        if (currentModels.includes(modelId)) {
            toast.error(`模型 "${modelId}" 已在列表中`);
            return;
        }

        const current = new Set(currentModels);
        current.add(modelId);
        setFormData(prev => ({ ...prev, models: Array.from(current) }));
        setManualModelInput('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return toast.error("请输入供应商名称");
        if (!formData.type) return toast.error("请选择供应商类型");
        if (!formData.baseUrl?.trim()) return toast.error("请输入基础 URL (Endpoint)");
        
        const keys: ProviderKey[] = keysInput.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
            const parts = line.split(/\s+/);
            const weight = parts.length > 1 ? parseInt(parts[1], 10) : 10;
            return { key: parts[0], weight: isNaN(weight) ? 10 : weight, isEnabled: true };
        });

        if (keys.length === 0) return toast.error("请至少配置一个 API 密钥");
        if (!formData.models || formData.models.length === 0) return toast.error("请至少配置一个可路由模型");

        const config: ProviderConfig = {
            ...(formData as ProviderConfig),
            id: formData.id || editingProvider?.id || '',
            type: formData.type as ProviderConfig['type'],
            isOnline: !!formData.isOnline,
            keys
        };
        if (editingProvider) {
            await updateProviderAction(config);
            setProviders(prev => prev.map(p => p.id === config.id ? config : p));
        } else {
            const newP = await createProvider(config);
            setProviders([newP, ...providers]);
        }
        setIsModalOpen(false);
    };

    const handleDelete = async (id: string) => {
        toast.confirm({
            message: '您确定吗？此模型供应商的所有路由规则也将被删除。',
            type: 'danger', confirmText: '删除',
            onConfirm: async () => { await deleteProviderAction(id); setProviders(prev => prev.filter(p => p.id !== id)); }
        });
    };

    const handleToggleProvider = async (provider: ProviderConfig) => {
        const updated = { ...provider, isEnabled: !provider.isEnabled };
        await updateProviderAction(updated);
        setProviders(prev => prev.map(p => p.id === provider.id ? updated : p));
    };

    const filteredProvidersTotal = providers.filter(p => {
        if (filter === 'configured' && p.keys.length === 0) return false;
        if (filter !== 'all' && filter !== 'configured' && p.type !== filter) return false;
        if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const isOnlineLocked = !!formData.isOnline && !!editingProvider;

    return (
        <div className="p-8 pb-12 max-w-7xl mx-auto text-gray-900">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-medium tracking-tight">模型供应商</h1>
                    <p className="text-gray-500 text-sm mt-1 font-medium">管理上游 AI 连接端点和 API 密钥。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={openSubscriptionList} disabled={isSubscribing || isSubListLoading} className="flex items-center gap-2 bg-white border border-gray-200 hover:border-black text-gray-700 hover:text-black px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50">{(isSubscribing || isSubListLoading) ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}下载配置</button>
                    <button onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-md active:scale-95"><Plus className="w-4 h-4" />添加供应商</button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    {[
                        { id: 'all', label: '全部', icon: <Layers className="w-3.5 h-3.5" /> },
                        { id: 'configured', label: '已配置', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                        { id: 'google', label: 'Google', icon: (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m31.6814,34.8868c-1.9155,1.29-4.3586,2.0718-7.2514,2.0718-5.59,0-10.3395-3.7723-12.04-8.8541v-.0195c-.43-1.29-.6841-2.6582-.6841-4.085s.2541-2.795.6841-4.085c1.7005-5.0818,6.45-8.8541,12.04-8.8541,3.1664,0,5.9809,1.0945,8.2286,3.2055l6.1568-6.1568c-3.7332-3.4791-8.5805-5.6095-14.3855-5.6095-8.4045,0-15.6559,4.8277-19.1936,11.8641-1.4659,2.8927-2.3064,6.1568-2.3064,9.6359s.8405,6.7432,2.3064,9.6359v.0195c3.5377,7.0168,10.7891,11.8445,19.1936,11.8445,5.805,0,10.6718-1.9155,14.2291-5.1991,4.0655-3.7527,6.4109-9.2645,6.4109-15.8123,0-1.5245-.1368-2.9905-.3909-4.3977h-20.2491v8.3264h11.5709c-.5082,2.6777-2.0327,4.945-4.3195,6.4695h0Z" />
                            </svg>
                        ) },
                        { id: 'openai', label: 'OpenAI', icon: (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" role="img" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                            </svg>
                        ) },
                        { id: 'anthropic', label: 'Anthropic', icon: (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" role="img" xmlns="http://www.w3.org/2000/svg">
                                <path fill="currentColor" d="m13.788825 3.932 6.43325 16.136075h3.5279L17.316725 3.932H13.788825Z"></path>
                                <path fill="currentColor" d="m6.325375 13.682775 2.20125 -5.67065 2.201275 5.67065H6.325375ZM6.68225 3.932 0.25 20.068075h3.596525l1.3155 -3.3886h6.729425l1.315275 3.3886h3.59655L10.371 3.932H6.68225Z"></path>
                            </svg>
                        ) },
                    ].map((btn) => (
                        <button key={btn.id} onClick={() => setFilter(btn.id as typeof filter)} className={cn("h-8 px-4 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-2", filter === btn.id ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-100 hover:border-gray-300 hover:bg-gray-50")}>{btn.icon}{btn.label}</button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="搜索名称..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-1.5 rounded-xl border border-gray-200 focus:border-black outline-none transition-all text-sm w-48 bg-gray-50/50" />
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                        <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-lg transition-all", viewMode === 'list' ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600")}><ListIcon className="w-4 h-4" /></button>
                        <button onClick={() => setViewMode('card')} className={cn("p-1.5 rounded-lg transition-all", viewMode === 'card' ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600")}><LayoutGrid className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            <ProvidersView
                viewMode={viewMode}
                providers={filteredProvidersTotal}
                onOpenModal={handleOpenModal}
                onOpenHomepage={handleOpenHomepage}
                onDelete={handleDelete}
                onToggleProvider={handleToggleProvider}
                onCopyBaseUrl={copyToClipboard}
            />

            <ProviderEditModal
                isOpen={isModalOpen}
                editingProvider={editingProvider}
                formData={formData}
                setFormData={setFormData}
                keysInput={keysInput}
                setKeysInput={setKeysInput}
                manualModelInput={manualModelInput}
                setManualModelInput={setManualModelInput}
                isFetchingModels={isFetchingModels}
                onFetchModels={handleFetchModels}
                onAddManualModel={addManualModel}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                onOpenIconModal={() => { setTempIconUrl(formData.icon || ''); setIsIconModalOpen(true); }}
                isOnlineLocked={isOnlineLocked}
                onTestModel={handleTestModel}
                testingModelId={testingModelId}
                onRemoveModel={(modelId) => setFormData(prev => ({ ...prev, models: prev.models?.filter(mod => mod !== modelId) }))}
            />

            {showModelSelector && (
                <ModelSelectorDialog 
                    availableModels={fetchedModels} 
                    selectedModels={formData.models || []} 
                    providerName={formData.name || ''}
                    baseUrl={formData.baseUrl || ''}
                    type={formData.type as 'openai' | 'google' | 'anthropic'}
                    keysInput={keysInput}
                    onSelectionChange={(models) => setFormData(prev => ({ ...prev, models }))} 
                    onClose={() => setShowModelSelector(false)} 
                />
            )}

            <ProviderIconModal
                isOpen={isIconModalOpen}
                tempIconUrl={tempIconUrl}
                setTempIconUrl={setTempIconUrl}
                providerType={formData.type}
                onClose={() => setIsIconModalOpen(false)}
                onConfirm={() => { setFormData(prev => ({ ...prev, icon: tempIconUrl })); setIsIconModalOpen(false); toast.success("图标预览已更新"); }}
            />

            <SubscriptionListModal
                isOpen={isSubListModalOpen}
                subscriptionUrl={subscriptionUrl}
                subscriptionProviders={subscriptionProviders}
                selectedSubKeys={selectedSubKeys}
                setSelectedSubKeys={setSelectedSubKeys}
                isUpdatingAll={isUpdatingAll}
                onUpdateAll={handleUpdateAll}
                updatingKeys={updatingKeys}
                onUpdateOne={handleUpdateOne}
                isSyncSelected={isSyncSelected}
                onSyncSelected={handleSyncSelected}
                onClose={() => setIsSubListModalOpen(false)}
                getSubscriptionKey={getSubscriptionKey}
                hasExistingProvider={hasExistingProvider}
            />

            <SubscriptionUrlModal
                isOpen={isSubModalOpen}
                subscribeUrl={subscribeUrl}
                setSubscribeUrl={setSubscribeUrl}
                isSubscribing={isSubscribing}
                onClose={() => setIsSubModalOpen(false)}
                onSubmit={async (e) => { e.preventDefault(); if (!subscribeUrl.trim()) return; setIsSubscribing(true); try { const res = await subscribeProvidersAction({ url: subscribeUrl }); if (res.success) { toast.success(`成功同步了 ${res.count} 个供应商！`); setIsSubModalOpen(false); await refreshProvidersList(); } else { toast.error("同步失败: " + res.error); } } finally { setIsSubscribing(false); } }}
            />
        </div>
    );
}
