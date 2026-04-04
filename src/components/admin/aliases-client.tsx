'use client';

import { useState } from 'react';
import { Plus, Trash2, X, LayoutGrid, List as ListIcon, Search, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { ModelRule, ProviderConfig } from '@/lib/server/providers';
import { createRule, deleteRuleAction, updateRuleAction } from '@/app/actions/providers';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

interface AliasTarget {
    providerId: string;
    targetModel: string;
    weight: number;
}

// 提取 ProviderIcon 组件，使用原生 img 确保外部图片（如 zAI）加载稳定性
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

const AliasVisualizer = () => {
    return (
        <div className="w-full bg-white border border-gray-100 rounded-2xl p-8 mb-8 overflow-hidden relative shadow-sm group font-sans">
            <style>{`
                @keyframes flow {
                    from { stroke-dashoffset: 24; }
                    to { stroke-dashoffset: 0; }
                }
                @keyframes pulse-move {
                    0% { offset-distance: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { offset-distance: 100%; opacity: 0; }
                }
                .animate-flow {
                    animation: flow 1.2s linear infinite;
                }
                .energy-particle {
                    offset-path: var(--path);
                    animation: pulse-move 2.5s ease-in-out infinite;
                }
            `}</style>
            
            <div className="max-w-3xl mx-auto relative h-44 flex items-center">
                {/* SVG Paths Container */}
                <svg 
                    viewBox="0 0 800 200" 
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <defs>
                        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#000000" stopOpacity="0.15" />
                            <stop offset="100%" stopColor="#000000" stopOpacity="0.02" />
                        </linearGradient>
                    </defs>

                    {/* Path Definitions - Re-calculated for precision */}
                    <path id="path-top" d="M 120 100 C 240 100, 320 40, 520 40" />
                    <path id="path-mid" d="M 120 100 L 520 100" />
                    <path id="path-bot" d="M 120 100 C 240 100, 320 160, 520 160" />

                    {/* Base Lines */}
                    <g stroke="#f3f4f6" strokeWidth="1.5">
                        <use href="#path-top" />
                        <use href="#path-mid" />
                        <use href="#path-bot" />
                    </g>

                    {/* Flowing Lines */}
                    <g stroke="url(#lineGrad)" strokeWidth="1.5" strokeDasharray="4,8" className="animate-flow">
                        <use href="#path-top" className="opacity-40" />
                        <use href="#path-mid" className="opacity-60" />
                        <use href="#path-bot" className="opacity-30" />
                    </g>

                    {/* Particles */}
                    <circle r="2" fill="black" className="energy-particle" style={{ '--path': 'path("M 120 100 C 240 100, 320 40, 520 40")', animationDelay: '0s' } as any} />
                    <circle r="2" fill="black" className="energy-particle" style={{ '--path': 'path("M 120 100 L 520 100")', animationDelay: '0.8s' } as any} />
                    <circle r="2" fill="black" className="energy-particle" style={{ '--path': 'path("M 120 100 C 240 100, 320 160, 520 160")', animationDelay: '1.6s' } as any} />
                </svg>

                {/* Left Node: Alias */}
                <div className="z-10 absolute left-[20px]">
                    <div className="bg-black text-white px-5 py-2.5 rounded-xl shadow-xl shadow-black/10 flex flex-col items-center gap-1 group-hover:scale-105 transition-transform duration-500">
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">虚拟别名</span>
                        <span className="text-sm font-semibold tracking-tight">openai-small-text-free</span>
                    </div>
                </div>

                <div className="flex flex-col gap-4 absolute left-[520px] w-[220px]">
                    {[
                        { provider: 'OpenAI 兼容', model: 'model-id-1', weight: '50%' },
                        { provider: 'OpenAI 兼容', model: 'model-id-2', weight: '30%' },
                        { provider: 'OpenAI 兼容', model: 'model-id-3', weight: '20%' }
                    ].map((target, i) => (
                        <div key={i} className="bg-white border border-zinc-100 px-4 py-2 rounded-xl shadow-sm flex items-center justify-between group/card hover:border-black transition-all duration-300">
                            <div className="flex flex-col items-start">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.1em]">{target.provider}</span>
                                <span className="text-[11px] font-mono font-medium text-zinc-600 leading-none mt-1">{target.model}</span>
                            </div>
                            <div className="bg-zinc-50 text-zinc-900 text-[10px] font-bold px-2 py-1 rounded-lg border border-zinc-100 shadow-inner group-hover/card:bg-black group-hover/card:text-white group-hover/card:border-black transition-all">
                                {target.weight}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="absolute bottom-4 left-0 right-0 text-center flex items-center justify-center gap-3">
                <div className="h-px w-6 bg-zinc-100 group-hover:w-10 transition-all duration-700"></div>
                <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-[0.4em]">一个模型别名可以动态路由到多个无状态的模型</p>
                <div className="h-px w-6 bg-zinc-100 group-hover:w-10 transition-all duration-700"></div>
            </div>
        </div>
    );
};

import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';

export default function AliasesClient({
    initialAliases,
    allRules = [],
    providers
}: {
    initialAliases: ModelRule[],
    allRules?: ModelRule[],
    providers: ProviderConfig[]
}) {
    const grouped = initialAliases.reduce((acc, rule) => {
        if (!acc[rule.identifier]) acc[rule.identifier] = [];
        acc[rule.identifier].push(rule);
        return acc;
    }, {} as Record<string, ModelRule[]>);

    // 获取所有非别名的模型 ID (is_alias = 0)
    const nativeModelIds = new Set(allRules.filter(r => !r.isAlias).map(r => r.identifier));

    const [aliases] = useState(grouped);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingIdentifier, setEditingIdentifier] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const toast = useToast();

    const [identifier, setIdentifier] = useState('');
    const [type, setType] = useState<'openai' | 'google' | 'anthropic'>('openai');
    const [description, setDescription] = useState('');
    const [targets, setTargets] = useState<AliasTarget[]>([{ providerId: '', targetModel: '', weight: 10 }]);
    const [isEnabled, setIsEnabled] = useState(true);
    const [showSuggestions, setShowSuggestions] = useState<Record<number, boolean>>({});

    const handleOpenModal = (name?: string) => {
        setShowAdvanced(false);
        if (name && grouped[name]) {
            const rules = grouped[name];
            setEditingIdentifier(name);
            setIdentifier(name);
            setType(rules[0].type);
            setDescription(rules[0].description || '');
            setIsEnabled(rules[0].isEnabled);
            setTargets(rules.map(r => ({
                providerId: r.providerId || '',
                targetModel: r.targetModel,
                weight: r.weight
            })));
        } else {
            setEditingIdentifier(null);
            setIdentifier('');
            setType('openai');
            setDescription('');
            setIsEnabled(true);
            setTargets([{ providerId: '', targetModel: '', weight: 10 }]);
        }
        setIsModalOpen(true);
    };

    const addTarget = () => {
        setTargets([...targets, { providerId: '', targetModel: '', weight: 10 }]);
    };

    const removeTarget = (index: number) => {
        if (targets.length === 1) return;
        setTargets(targets.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanIdentifier = identifier.trim();
        if (!cleanIdentifier) return toast.error("请填写别名名称");

        // 检查别名是否已存在（排除正在编辑的情况）
        if (cleanIdentifier !== editingIdentifier && aliases[cleanIdentifier]) {
            return toast.error(`别名 "${cleanIdentifier}" 已存在`);
        }

        // 关键逻辑：检查是否和现有的原生模型 ID 冲突
        if (nativeModelIds.has(cleanIdentifier)) {
            return toast.error(`冲突：别名 "${cleanIdentifier}" 不能与已存在的原生模型 ID 重复。请使用不同的名称。`);
        }

        // Target validation
        for (const t of targets) {
            if (!t.targetModel.trim()) return toast.error("目标模型 ID 不能为空");
        }

        if (editingIdentifier) {
            const oldRules = grouped[editingIdentifier];
            for (const rule of oldRules) {
                await deleteRuleAction(rule.id);
            }
        }

        for (const target of targets) {
            await createRule({
                identifier: identifier.trim(),
                description: description.trim(),
                isAlias: true,
                providerId: target.providerId || null,
                targetModel: target.targetModel.trim(),
                type: type,
                weight: target.weight,
                isEnabled: isEnabled
            });
        }

        setIsModalOpen(false);
        toast.success(editingIdentifier ? "别名更新成功。" : "别名创建成功。");
        window.location.reload();
    };

    const handleDelete = async (name: string) => {
        toast.confirm({
            message: `确定要删除别名 "${name}" 的所有规则吗？`,
            type: 'danger',
            confirmText: '删除',
            onConfirm: async () => {
                const rules = grouped[name];
                for (const rule of rules) {
                    await deleteRuleAction(rule.id);
                }
                toast.success("别名删除成功。");
                window.location.reload();
            }
        });
    };

    const handleToggleStatus = async (name: string, isEnabled: boolean) => {
        const rules = aliases[name];
        for (const rule of rules) {
            await updateRuleAction({ ...rule, isEnabled: !isEnabled });
        }
        window.location.reload();
    };

    const filteredAliasNames = Object.keys(aliases).filter(name =>
        name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8 pb-12 max-w-7xl mx-auto text-gray-900">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-medium tracking-tight">模型别名</h1>
                    <p className="text-gray-500 text-sm mt-1 font-medium">创建虚拟名称，并按照加权的概率路由到多个真实模型，最大程度利用免费的模型，大幅节省成本。</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    新建别名
                </button>
            </div>

            {/* 动效示意图 */}
            <AliasVisualizer />

            {/* 控制栏 */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="搜索别名..."
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
                    {filteredAliasNames.map((name) => {
                        const rules = aliases[name] || [];
                        const firstRule = rules[0];
                        const totalWeight = rules.reduce((sum, r) => sum + r.weight, 0);

                        return (
                            <div key={name} onClick={() => handleOpenModal(name)} className="group bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-black transition-all duration-300 flex flex-col max-h-96 cursor-pointer relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center p-1 border border-gray-100 shadow-inner shrink-0 leading-none overflow-hidden text-gray-900">
                                            <ProviderIcon type={firstRule.type} size={28} className="w-full h-full" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 leading-tight truncate">{name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(name); }} 
                                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(name, firstRule.isEnabled); }} className={cn("relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none", firstRule.isEnabled ? 'bg-black' : 'bg-gray-200')}><span className={cn("pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", firstRule.isEnabled ? 'translate-x-4' : 'translate-x-0')} /></button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-hidden space-y-4">
                                    {firstRule.description && (
                                        <p className="text-xs text-gray-500 line-clamp-2 font-normal">{firstRule.description}</p>
                                    )}

                                    <div className="space-y-2">
                                        <div className="text-black uppercase font-medium tracking-widest flex justify-between" style={{ fontSize: '10px' }}>
                                            <span>路由目标 ({rules.length})</span>
                                            <span className="text-gray-400 font-medium">负载均衡</span>
                                        </div>
                                        <div className="space-y-1.5 max-h-32 overflow-hidden">
                                            {rules.slice(0, 3).map((r, idx) => {
                                                const p = providers.find(p => p.id === r.providerId);
                                                const percentage = totalWeight > 0 ? Math.round((r.weight / totalWeight) * 100) : 0;
                                                return (
                                                    <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 group-hover:border-gray-200 transition-colors">
                                                        <div className="flex flex-col truncate pr-2 min-w-0">
                                                            <div className="flex items-center gap-1.5 truncate">
                                                                <div className="w-3.5 h-3.5 shrink-0 bg-white rounded-md p-0.5 border border-gray-200 flex items-center justify-center overflow-hidden">
                                                                    <ProviderIcon src={p?.icon} type={p?.type} size={14} className="w-full h-full" />
                                                                </div>
                                                                <span className="font-medium text-gray-700 truncate">{p?.name || '默认'}</span>
                                                            </div>
                                                            <span className="text-gray-400 font-mono truncate pl-5" style={{ fontSize: '10px' }}>{r.targetModel}</span>
                                                        </div>
                                                        <div className="text-gray-900 font-medium bg-white px-2 py-1 rounded-lg border border-gray-100 shadow-sm shrink-0" style={{ fontSize: '10px' }}>
                                                            {percentage}%
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {rules.length > 3 && (
                                                <div className="text-gray-400 text-center pt-1 font-medium uppercase tracking-wider" style={{ fontSize: '10px' }}>
                                                    和另外 {rules.length - 3} 个目标...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase">
                            <tr>
                                <th className="px-6 py-4">别名名称</th>
                                <th className="px-6 py-4">描述</th>
                                <th className="px-6 py-4">类型</th>
                                <th className="px-6 py-4">状态</th>
                                <th className="px-6 py-4 text-left">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredAliasNames.map((name) => {
                                const rules = aliases[name];
                                const firstRule = rules[0];
                                return (
                                    <tr key={name} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => handleOpenModal(name)}>
                                        <td className="px-6 py-4 font-medium text-gray-900">{name}</td>
                                        <td className="px-6 py-4 text-gray-500 text-xs truncate max-w-48">{firstRule.description || '-'}</td>
                                        <td className="px-6 py-4">
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center p-1 bg-white border border-gray-100 shadow-sm overflow-hidden">
                                                <ProviderIcon type={firstRule.type} size={28} className="w-full h-full" />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(name, firstRule.isEnabled); }} className={cn("relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none", firstRule.isEnabled ? 'bg-black' : 'bg-gray-200')}><span className={cn("pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", firstRule.isEnabled ? 'translate-x-4' : 'translate-x-0')} /></button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-left">
                                            <div className="flex justify-start gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(name); }} className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 py-8 text-gray-900">
                    <div className="bg-white rounded-2xl shadow-xl w-full overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-200" style={{ maxWidth: '485px' }}>
                        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30 shrink-0">
                                <h2 className="text-lg font-medium">{editingIdentifier ? '编辑别名' : '新建别名'}</h2>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="px-6 pt-2 pb-6 space-y-4 flex-1 overflow-y-auto overflow-x-hidden">
                                <label className="block space-y-1">
                                    <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">别名名称 (不要和已存在的模型id重复)</span>
                                    <input required type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} className="block w-full h-9 rounded-xl border border-gray-200 focus:border-black outline-none px-3 text-xs bg-white shadow-sm" placeholder="例如 simple" />
                                </label>

                                {/* 协议类型 + 启用状态 同一行 */}
                                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-medium text-black uppercase tracking-widest">协议类型</span>
                                        <div className="flex-1">
                                            <Select
                                                value={type}
                                                onValueChange={value => {
                                                    const newType = value as 'openai' | 'google' | 'anthropic';
                                                    setType(newType);
                                                    const firstP = providers.find(p => p.isEnabled && p.type === newType && p.keys && p.keys.length > 0);
                                                    setTargets(targets.map(t => ({ 
                                                        ...t, 
                                                        providerId: firstP?.id || '',
                                                        targetModel: firstP?.models?.[0] || ''
                                                    })));
                                                }}
                                            >
                                                <SelectTrigger className="w-full h-8 rounded-lg border border-gray-200 focus:border-black outline-none px-2.5 text-xs bg-white shadow-sm flex items-center gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <ProviderIcon type={type} size={14} />
                                                        <SelectValue placeholder="选择类型" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border-gray-100 rounded-xl shadow-xl min-w-40">
                                                    {[
                                                        { value: 'openai', label: 'OpenAI' },
                                                        { value: 'google', label: 'Google' },
                                                        { value: 'anthropic', label: 'Anthropic' }
                                                    ].map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            <div className="flex items-center gap-2">
                                                                <ProviderIcon type={opt.value} size={14} />
                                                                <span>{opt.label}</span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                {/* 路由目标配置 */}
                                <div>
                                    <div className="flex justify-between items-center mb-2 px-1">
                                        <span className="text-xs font-medium text-black uppercase tracking-widest">配置路由目标</span>
                                        <button type="button" onClick={addTarget} className="text-xs font-medium uppercase bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-3 py-1 rounded-lg transition-all">+ 添加</button>
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                                        {targets.map((target, idx) => {
                                            const availableProviders = providers.filter(p => 
                                                p.isEnabled && 
                                                p.type === type && 
                                                p.keys && p.keys.length > 0
                                            );

                                            // 当前选中的 Provider 详细配置
                                            const selectedP = providers.find(p => p.id === target.providerId);
                                            const availableModelsForProvider = selectedP?.models || [];

                                            return (
                                                <div key={idx} className="flex flex-col gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 relative group/row">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex gap-2 flex-1 min-w-0">
                                                            {/* 1. 选择供应商 - 带图标的 shadcn/ui Select */}
                                                            <div className="relative w-32 shrink-0">
                                                                <Select
                                                                    value={target.providerId}
                                                                    onValueChange={value => {
                                                                        const newTargets = [...targets];
                                                                        newTargets[idx].providerId = value || '';
                                                                        const nextP = providers.find(p => p.id === value);
                                                                        if (nextP && !nextP.models.includes(target.targetModel)) {
                                                                            newTargets[idx].targetModel = nextP.models[0] || '';
                                                                        }
                                                                        setTargets(newTargets);
                                                                    }}
                                                                >
                                                                    <SelectTrigger className="w-full bg-white border border-gray-200 text-xs h-8 px-2 rounded-lg shadow-sm focus:border-black outline-none flex items-center transition-all overflow-hidden">
                                                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                                            {selectedP ? (
                                                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                                                    <div className="w-4.5 h-4.5 bg-white rounded-md p-0.5 border border-gray-100 flex items-center justify-center shadow-sm shrink-0 overflow-hidden text-gray-900">
                                                                                        <ProviderIcon src={selectedP.icon} type={selectedP.type} size={18} className="w-full h-full" />
                                                                                    </div>
                                                                                    <span className="truncate">{selectedP.name}</span>
                                                                                 </div>
                                                                            ) : (
                                                                                <div className="flex-1 truncate text-left text-gray-400">
                                                                                    供应商...
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-white border-gray-100 rounded-xl shadow-xl min-w-52 max-h-60 overflow-y-auto">
                                                                        {availableProviders.map(p => (
                                                                            <SelectItem key={p.id} value={p.id}>
                                                                                <div className="flex items-center gap-2 text-gray-900">
                                                                                    <div className="w-4.5 h-4.5 bg-white rounded-md p-0.5 border border-gray-100 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                                                                        <ProviderIcon src={p.icon} type={p.type} size={18} className="w-full h-full" />
                                                                                    </div>
                                                                                    <span className="truncate">{p.name}</span>
                                                                                </div>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            {/* 2. 选择模型 - shadcn/ui Select */}
                                                            <div className="relative flex-1 min-w-0">
                                                                <Select
                                                                    disabled={!target.providerId}
                                                                    value={target.targetModel}
                                                                    onValueChange={value => {
                                                                        const newTargets = [...targets];
                                                                        newTargets[idx].targetModel = value || '';
                                                                        setTargets(newTargets);
                                                                    }}
                                                                >
                                                                    <SelectTrigger className="w-full bg-white border border-gray-200 text-xs font-mono h-8 px-2 rounded-lg shadow-sm focus:border-black outline-none transition-all flex items-center overflow-hidden disabled:bg-gray-100 disabled:cursor-not-allowed">
                                                                        <div className="flex-1 truncate text-left">
                                                                            <SelectValue placeholder={target.providerId ? '选择模型...' : '请先选供应商'} />
                                                                        </div>
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-white border-gray-100 rounded-xl shadow-xl min-w-52 max-h-60 overflow-y-auto">
                                                                        {availableModelsForProvider.map(m => (
                                                                            <SelectItem key={m} value={m}>
                                                                                <span className="font-mono">{m}</span>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>

                                                        {/* 3. 权重设置 */}
                                                        <div className="w-[72px] bg-white flex items-center gap-1 p-1 rounded-lg border border-gray-200 shadow-sm shrink-0">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase ml-0.5 shrink-0">权重</span>
                                                            <input
                                                                required
                                                                type="number"
                                                                value={target.weight}
                                                                onChange={e => {
                                                                    const newTargets = [...targets];
                                                                    newTargets[idx].weight = parseInt(e.target.value) || 0;
                                                                    setTargets(newTargets);
                                                                }}
                                                                className="w-full bg-transparent text-xs font-medium px-0.5 outline-none text-right no-spinner"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeTarget(idx)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover/row:opacity-100"
                                                            disabled={targets.length === 1}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Advanced Panel - 仅保留描述 */}
                                <div className="border-t border-gray-100 pt-3 mt-4">
                                    <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:text-black transition-colors w-full py-1 px-1">
                                        <Settings2 className="w-3 h-3" />
                                        {showAdvanced ? '隐藏可选设置' : '展开可选设置'}
                                        {showAdvanced ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                                    </button>

                                    {showAdvanced && (
                                        <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200 px-1">
                                            <label className="block space-y-1">
                                                <span className="text-xs font-medium text-black uppercase tracking-widest ml-1">用途描述 (可选)</span>
                                                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="block w-full rounded-xl border border-gray-200 focus:border-black outline-none p-2 text-xs bg-white shadow-sm resize-y" placeholder="别名用途备注..." />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 shrink-0">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200">取消</button>
                                <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-lg shadow-lg transition-all active:scale-95 uppercase tracking-widest">保存别名</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
