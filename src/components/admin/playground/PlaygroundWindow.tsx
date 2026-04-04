import { useState } from 'react';
import { Braces, Check, Copy, GripVertical, MessageSquare, MessageSquarePlus, Play, Route, Sparkles, Trash2, Trophy } from 'lucide-react';
import { marked } from 'marked';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ProviderConfig } from '@/lib/server/providers';
import { SchemaDialog } from './SchemaDialog';
import { formatError } from './utils';
import { Message, PlaygroundWindow, Role } from './types';

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

export function PlaygroundWindowCard({
    window: w,
    onUpdate,
    onRemove,
    onDuplicate,
    onRun,
    onAssess,
    canRemove,
    draggedMsgId,
    onDragStart,
    onDragOver,
    onDragEnd,
    providers
}: {
    window: PlaygroundWindow;
    onUpdate: (u: Partial<PlaygroundWindow>) => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onRun: () => void;
    onAssess: () => void;
    canRemove: boolean;
    draggedMsgId: string | null;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragOver: (e: React.DragEvent, id: string, wid: string) => void;
    onDragEnd: () => void;
    providers: ProviderConfig[];
}) {
    const [msgRoleToAdd, setMsgRoleToAdd] = useState<Role>('user');
    const [isSchemaOpen, setIsSchemaOpen] = useState(false);

    const assessDisabled = !w.response?.trim() || w.isAssessing;

    const addMessage = () => {
        const newMsg: Message = { id: 'm-' + Date.now(), role: msgRoleToAdd, content: '' };
        onUpdate({ messages: [...w.messages, newMsg] });
    };

    const updateMessageContent = (msgId: string, content: string) => {
        const newMsgs = w.messages.map(m => m.id === msgId ? { ...m, content } : m);
        onUpdate({ messages: newMsgs });
    };

    const deleteMessage = (msgId: string) => {
        onUpdate({ messages: w.messages.filter(m => m.id !== msgId) });
    };

    return (
        <div className="w-120 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ring-1 ring-gray-950/5">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center justify-end mb-3">
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={() => setIsSchemaOpen(true)}
                            className={cn(
                                "group relative p-1.5 rounded-lg transition-all shadow-sm",
                                w.jsonSchema?.trim()
                                    ? "bg-zinc-100 text-zinc-900"
                                    : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                            )}
                            title="结构化输出 Schema"
                        >
                            <Braces className="w-3.5 h-3.5" />
                            {w.jsonSchema?.trim() && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full border-2 border-white" />
                            )}
                        </button>
                        <button
                            onClick={onRun}
                            className="p-1.5 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg transition-all shadow-sm"
                            title="运行分屏"
                        >
                            <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={onAssess}
                            className={cn(
                                "p-1.5 rounded-lg transition-all shadow-sm",
                                assessDisabled && "opacity-50 cursor-not-allowed",
                                w.assessResult
                                    ? "bg-zinc-100 text-zinc-900"
                                    : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                            )}
                            title="评估输出"
                            disabled={assessDisabled}
                        >
                            {w.isAssessing ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                            onClick={onDuplicate}
                            className="p-1.5 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg transition-all shadow-sm"
                            title="克隆分屏"
                        >
                            <Copy className="w-3.5 h-3.5" />
                        </button>
                        {canRemove && (
                            <button
                                onClick={onRemove}
                                className="p-1.5 bg-zinc-100 text-zinc-900 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all shadow-sm"
                                title="移除分屏"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="w-32 shrink-0">
                        <Select
                            value={w.providerId}
                            onValueChange={value => {
                                const updates: Partial<PlaygroundWindow> = { providerId: value || 'google' };
                                const foundP = providers.find(p => p.id === value || p.type === value);
                                if (value === 'alias') {
                                    updates.model = Object.keys(providers.reduce((acc, p) => ({ ...acc, ...p.modelAliases || {} }), {}))[0] || '';
                                } else if (foundP) {
                                    updates.model = foundP.models?.[0] || '';
                                }
                                onUpdate(updates);
                            }}
                        >
                            <SelectTrigger className="w-full bg-white border border-gray-200 text-xs h-9 px-2 rounded-xl shadow-sm focus:border-black outline-none flex items-center gap-1.5 transition-all outline-none">
                                <div className="flex items-center gap-1.5 min-w-0 pr-1 flex-1">
                                    {w.providerId === 'alias' ? (
                                        <Route className="w-3.5 h-3.5 text-black shrink-0" />
                                    ) : (providers.find(p => p.id === w.providerId) || providers.find(p => p.type === w.providerId)) ? (
                                        <div className="w-4.5 h-4.5 bg-white rounded-md p-0.5 border border-gray-100 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                            {(() => {
                                                const p = providers.find(p => p.id === w.providerId) || providers.find(p => p.type === w.providerId);
                                                return <ProviderIcon src={p?.icon} type={p?.type} size={18} className="w-full h-full" />;
                                            })()}
                                        </div>
                                    ) : null}
                                    <span className="truncate">{w.providerId === 'alias' ? '模型别名' : ((providers.find(p => p.id === w.providerId) || providers.find(p => p.type === w.providerId))?.name || '供应商')}</span>
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
                            disabled={!w.providerId}
                            value={w.model}
                            onValueChange={value => onUpdate({ model: value || '' })}
                        >
                            <SelectTrigger className="w-full bg-white border border-gray-200 text-xs font-mono h-8 px-3 rounded-xl shadow-sm focus:border-black outline-none transition-all flex items-center overflow-hidden">
                                <div className="flex-1 truncate text-left">
                                    <SelectValue placeholder="选择模型..." />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="bg-white border-gray-100 rounded-xl shadow-xl min-w-52 max-h-64 overflow-y-auto">
                                {w.providerId === 'alias' ? (
                                    Object.keys(providers.reduce((acc, p) => ({ ...acc, ...p.modelAliases || {} }), {})).map(m => (
                                        <SelectItem key={m} value={m}><span className="font-mono">{m}</span></SelectItem>
                                    ))
                                ) : (
                                    (providers.find(p => p.id === w.providerId || p.type === w.providerId)?.models || []).map(m => (
                                        <SelectItem key={m} value={m}><span className="font-mono">{m}</span></SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <SchemaDialog
                isOpen={isSchemaOpen}
                onClose={() => setIsSchemaOpen(false)}
                schema={w.jsonSchema || ''}
                onSave={(s) => onUpdate({ jsonSchema: s })}
            />

            <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-4 flex flex-col gap-4">
                    {w.messages.map((msg) => (
                        <div
                            key={msg.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, msg.id)}
                            onDragOver={(e) => onDragOver(e, msg.id, w.id)}
                            onDragEnd={onDragEnd}
                            className={cn(
                                "group relative flex flex-col gap-1.5 p-3 rounded-xl border transition-all",
                                msg.role === 'system' ? "bg-purple-50/50 border-purple-100" :
                                    msg.role === 'assistant' ? "bg-blue-50/50 border-blue-100" :
                                        "bg-white border-gray-200",
                                draggedMsgId === msg.id && "opacity-50 border-dashed border-indigo-400"
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <GripVertical className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 cursor-grab active:cursor-grabbing" />
                                    <select
                                        value={msg.role}
                                        onChange={(e) => {
                                            const newRole = e.target.value as Role;
                                            const newMsgs = w.messages.map(m => m.id === msg.id ? { ...m, role: newRole } : m);
                                            onUpdate({ messages: newMsgs });
                                        }}
                                        className="text-xs font-medium uppercase bg-white border border-gray-200 rounded-md px-2 py-1 focus:border-black outline-none cursor-pointer"
                                    >
                                        <option value="system">系统 (SYSTEM)</option>
                                        <option value="user">用户 (USER)</option>
                                        <option value="assistant">助手 (ASSISTANT)</option>
                                    </select>
                                </div>
                                <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                            <textarea
                                value={msg.content}
                                onChange={e => updateMessageContent(msg.id, e.target.value)}
                                className="text-sm bg-white/50 border border-gray-200 rounded-lg px-3 py-2 focus:border-black focus:bg-white focus:ring-0 outline-none resize-none font-sans leading-relaxed text-gray-900 placeholder:text-gray-300 transition-all shadow-sm"
                                placeholder={`请输入 ${msg.role === 'user' ? '用户' : msg.role === 'system' ? '系统' : '助手'} 的内容...`}
                                rows={Math.max(2, msg.content.split('\n').length)}
                            />
                        </div>
                    ))}
                </div>

                <div className="border-t border-gray-100 bg-gray-50/80">
                    <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                        <select
                            value={msgRoleToAdd}
                            onChange={(e) => setMsgRoleToAdd(e.target.value as Role)}
                            className="text-xs bg-white border border-gray-200 rounded-md py-1 pl-2 pr-6 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="user">用户</option>
                            <option value="system">系统</option>
                            <option value="assistant">助手</option>
                        </select>
                        <button
                            onClick={addMessage}
                            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1.5 rounded-lg transition-all active:scale-95"
                        >
                            <MessageSquarePlus className="w-3.5 h-3.5" /> 添加消息
                        </button>
                    </div>

                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <MessageSquare className="w-3 h-3" />
                                模型响应
                            </label>
                            {w.isLoading && <span className="text-xs text-indigo-600 animate-pulse font-medium uppercase">生成中...</span>}
                        </div>
                        <div className={cn(
                            "w-full rounded-xl p-4 min-h-35 overflow-y-auto text-xs font-mono border shadow-inner focus-within:border-black transition-all",
                            w.response?.trim()
                                ? "bg-white border-gray-200 text-gray-800"
                                : w.resultError?.trim()
                                    ? "bg-white border-gray-200 text-red-600"
                                    : "bg-white border-gray-200 text-gray-300"
                        )}>
                            {w.isLoading ? (
                                <div className="flex items-center gap-2 pt-1 opacity-50">
                                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            ) : w.resultError?.trim() ? (
                                <pre className="whitespace-pre-wrap !text-red-600 font-mono leading-relaxed">{formatError(w.resultError)}</pre>
                            ) : (
                                <div
                                    className="markdown-content whitespace-normal leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: marked.parse(w.response || "暂无响应。") as string }}
                                />
                            )}
                        </div>
                    </div>

                    {(w.assessResult || w.assessError || w.isAssessing) && (
                        <div className="px-3 pb-3">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <label className="text-xs font-medium text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                    <Trophy className="w-3 h-3" />
                                    评估结果
                                </label>
                                {w.isAssessing && <span className="text-xs text-indigo-500 animate-pulse font-medium uppercase">评估中...</span>}
                            </div>
                            {w.assessError?.trim() ? (
                                <div className="w-full bg-white rounded-xl p-4 min-h-35 overflow-y-auto text-xs font-mono border border-gray-200 shadow-inner text-red-600">
                                    <pre className="whitespace-pre-wrap !text-red-600 font-mono leading-relaxed">{formatError(w.assessError)}</pre>
                                </div>
                            ) : (
                                <div className="w-full bg-indigo-50/50 rounded-xl p-4 text-xs border border-indigo-100/50 shadow-inner text-indigo-900 leading-relaxed font-sans markdown-content">
                                    <div
                                        className={cn("transition-colors", w.assessResult ? "text-indigo-900" : "text-gray-300")}
                                        dangerouslySetInnerHTML={{ __html: marked.parse(w.assessResult || "等待评估...") as string }}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
