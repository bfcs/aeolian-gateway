'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Plus, Save, Settings, Sparkles, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addProject, saveProject, removeProject } from '@/app/actions/projects';
import { ProviderConfig } from '@/lib/server/providers';
import { useToast } from '@/components/ui/toast';
import { AssessPromptDialog } from './AssessPromptDialog';
import { ComparePanel } from './ComparePanel';
import { PlaygroundWindowCard } from './PlaygroundWindow';
import { ProjectList } from './ProjectList';
import { Project, PlaygroundWindow, Role } from './types';
import { submitPlaygroundRequestStreamSafe } from './stream-client';
import { buildAvailableModelSet, buildModelSet } from './utils';
export default function PlaygroundClient({ 
    initialProjects, 
    initialModels, 
    initialProviders 
}: { 
    initialProjects: Project[], 
    initialModels: Record<string, string[]>, 
    initialProviders: ProviderConfig[] 
}) {
    // --- State ---
    const [projects, setProjects] = useState<Project[]>(initialProjects);
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const [isAssessPromptOpen, setIsAssessPromptOpen] = useState(false);
    const [availableModels] = useState<Record<string, string[]>>(initialModels);
    const [providers] = useState<ProviderConfig[]>(initialProviders); 
    const toast = useToast();
    const [isComparing, setIsComparing] = useState(false);
    const [isCompareOpen, setIsCompareOpen] = useState(true);
    const activeProjectRef = useRef<Project | null>(null);
    const modelSet = useMemo(() => {
        const combined = new Set<string>();
        buildAvailableModelSet(availableModels).forEach(m => combined.add(m));
        buildModelSet(providers).forEach(m => combined.add(m));
        return combined;
    }, [availableModels, providers]);

    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // --- Effects ---

    // Load active project from localstorage
    useEffect(() => {
        const lastActiveId = localStorage.getItem('lastActiveProjectId');
        if (lastActiveId) {
            const found = projects.find(p => p.id === lastActiveId);
            if (found) {
                setActiveProject(found);
            }
        }
    }, [projects]);

    // Persist active project
    useEffect(() => {
        if (activeProject) {
            localStorage.setItem('lastActiveProjectId', activeProject.id);
        } else {
            localStorage.removeItem('lastActiveProjectId');
        }
    }, [activeProject]);

    useEffect(() => {
        activeProjectRef.current = activeProject;
    }, [activeProject]);

    // Prevent leaving if dirty
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    // --- Handlers ---

    const getProviderDisplayName = (providerId: string) => {
        if (!providerId) return '未选择';
        if (providerId === 'alias' || providerId === 'virtual-alias-group') return '模型别名';
        const found = providers.find(p => p.id === providerId || p.type === providerId);
        return found?.name || found?.type || providerId;
    };

    const buildComparePrompt = (windows: PlaygroundWindow[]) => {
        const parts: string[] = [];
        parts.push(activeProject?.assessPrompt?.trim() || '');
        parts.push('');
        parts.push('## 分屏');
        parts.push('下面是每个分屏的配置信息、对话历史和响应，请根据对话历史评估哪个分屏最符合你的要求');

        windows.forEach((w, index) => {
            const messages = w.messages
                .filter(m => m.content.trim() !== '')
                .map(m => ({ role: m.role, content: m.content }));
            const payload: Record<string, any> = {
                id: index + 1,
                provider: getProviderDisplayName(w.providerId),
                model: w.model,
                messages,
                response: w.response || ''
            };
            if (w.jsonSchema?.trim()) {
                payload.schema = w.jsonSchema;
            }
            parts.push(JSON.stringify(payload, null, 2));
        });

        return parts.join('\n');
    };



    const submitWithTimeout = async (
        params: any,
        timeoutMs: number = 60000,
        onProgress?: (content: string) => void
    ) => {
        return await submitPlaygroundRequestStreamSafe(params, { timeoutMs, onProgress });
    };

    const waitForWindowResponse = (windowId: string) => {
        return new Promise<string>((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const current = activeProjectRef.current;
                const w = current?.windows.find(win => win.id === windowId);
                if (!w) {
                    clearInterval(timer);
                    reject(new Error("分屏不存在"));
                    return;
                }
                if (!w.isLoading) {
                    clearInterval(timer);
                    if (w.response?.trim()) return resolve(w.response);
                    if (w.resultError?.trim()) return reject(new Error(w.resultError));
                    return resolve('');
                }
                if (Date.now() - start > 60 * 1000) {
                    clearInterval(timer);
                    reject(new Error("等待模型响应超时"));
                }
            }, 200);
        });
    };

    const ensureWindowResponse = async (w: PlaygroundWindow) => {
        if (w.response?.trim()) return w.response;
        if (w.isLoading) return waitForWindowResponse(w.id);

        const reqMessages = w.messages
            .filter(m => m.content.trim() !== '')
            .map(({ role, content }) => ({ role, content }));

        patchActiveProjectWindow(w.id, { isLoading: true, response: '', resultError: '' });
        try {
            const result = await submitWithTimeout({
                model: w.model,
                messages: reqMessages,
                jsonSchema: w.jsonSchema,
                providerId: w.providerId
            }, 60000, (content) => {
                patchActiveProjectWindow(w.id, { response: content, resultError: '' });
            });
            if (result.ok) {
                patchActiveProjectWindow(w.id, { isLoading: false, response: result.content, resultError: '' });
                return result.content;
            }
            patchActiveProjectWindow(w.id, { isLoading: false, response: '', resultError: result.error });
            return '';
        } catch (e) {
            patchActiveProjectWindow(w.id, { isLoading: false, response: '', resultError: (e as Error).message });
            return '';
        }
    };

    const handleSave = async () => {
        if (!activeProject || isSaving) return;
        setIsSaving(true);
        try {
            const sanitizedWindows = activeProject.windows.map(w => ({
                ...w,
                isLoading: false,
                isAssessing: false,
                resultError: undefined,
                assessError: undefined
            }));
            await saveProject(activeProject.id, activeProject.name, {
                windows: sanitizedWindows,
                assessPrompt: activeProject.assessPrompt,
                assessModel: activeProject.assessModel,
                assessProviderId: activeProject.assessProviderId,
                compareResult: activeProject.compareResult,
                description: activeProject.description
            });
            setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, ...activeProject } : p));
            setIsDirty(false);
            toast.success("项目保存成功");
        } catch (e) {
            console.error("保存失败", e);
            toast.error("保存项目失败");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateProject = async () => {
        const windows = [{
            id: 'w-' + Date.now(),
            model: '',
            messages: [
                { id: 'm-1', role: 'system' as Role, content: '你是一个得心应手的助手。' },
                { id: 'm-2', role: 'user' as Role, content: '你好' }
            ],
            response: '',
            resultError: '',
            isLoading: false,
            providerId: ''
        }];

        try {
            const newProject = await addProject(`项目 ${projects.length + 1}`, { windows });
            const p: Project = { 
                ...newProject, 
                assessPrompt: '',
                assessModel: '',
                assessProviderId: '',
                compareResult: '',
                compareError: '',
                windows: (newProject as any).windows as unknown as PlaygroundWindow[]
            };
            setProjects([p, ...projects]);
            setActiveProject(p);
            setIsDirty(false); // New project starts clean on first load
        } catch (e) {
            console.error(e);
            toast.error("创建项目失败");
        }
    };

    const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        toast.confirm({
            message: '您确定要删除此项目吗？',
            type: 'danger',
            confirmText: '删除',
            onConfirm: async () => {
                try {
                    await removeProject(id);
                    setProjects(projects.filter(p => p.id !== id));
                    if (activeProject?.id === id) setActiveProject(null);
                } catch (err) {
                    console.error(err);
                    toast.error("删除项目失败");
                }
            }
        });
    };

    const updateActiveProject = (updated: Project) => {
        const withTime = { ...updated, updatedAt: Date.now() };
        setActiveProject(withTime);
        setIsDirty(true);
    };

    const patchActiveProjectWindow = (wId: string, updates: Partial<PlaygroundWindow>, markDirty: boolean = false) => {
        setActiveProject(prev => {
            if (!prev) return prev;
            const windows = prev.windows.map(w => w.id === wId ? { ...w, ...updates } : w);
            const updated = { ...prev, windows, updatedAt: Date.now() };
            setProjects(prevProjs => prevProjs.map(p => p.id === updated.id ? updated : p));
            if (markDirty) setIsDirty(true);
            return updated;
        });
    };

    const patchActiveProject = (updates: Partial<Project>, markDirty: boolean = false) => {
        setActiveProject(prev => {
            if (!prev) return prev;
            const updated = { ...prev, ...updates, updatedAt: Date.now() };
            setProjects(prevProjs => prevProjs.map(p => p.id === updated.id ? updated : p));
            if (markDirty) setIsDirty(true);
            return updated;
        });
    };

    // --- Window Handlers ---

    const updateWindow = (wId: string, updates: Partial<PlaygroundWindow>) => {
        if (!activeProject) return;
        const newWindows = activeProject.windows.map(w => w.id === wId ? { ...w, ...updates } : w);
        updateActiveProject({ ...activeProject, windows: newWindows });
    };

    const addWindow = () => {
        if (!activeProject) return;
        const newWindow: PlaygroundWindow = {
            id: 'w-' + Date.now(),
            model: '',
            messages: [
                { id: 'm-u-' + Date.now(), role: 'user', content: '' }
            ],
            response: '',
            resultError: '',
            isLoading: false,
            providerId: ''
        };
        updateActiveProject({
            ...activeProject,
            windows: [...activeProject.windows, newWindow]
        });
    };

    const removeWindow = (wId: string) => {
        if (!activeProject || activeProject.windows.length <= 1) return;
        updateActiveProject({
            ...activeProject,
            windows: activeProject.windows.filter(w => w.id !== wId)
        });
    };

    const duplicateWindow = (w: PlaygroundWindow) => {
        if (!activeProject) return;
        const clone: PlaygroundWindow = {
            ...w,
            id: 'w-' + Date.now(),
            messages: w.messages.map(m => ({ ...m, id: 'm-' + Math.random().toString(36).substring(2, 11) })),
            response: '',
            resultError: '',
            isLoading: false
        };
        updateActiveProject({
            ...activeProject,
            windows: [...activeProject.windows, clone]
        });
    };

    const runWindow = async (wId: string) => {
        if (!activeProject) return;

        const w = activeProject.windows.find(win => win.id === wId);
        if (!w || w.isLoading) return;

        if (!w.providerId) {
            return toast.error("请选择此窗口的供应商");
        }
        if (!w.model.trim()) {
            return toast.error("请输入此窗口的模型名称");
        }
        if (modelSet.size > 0 && !modelSet.has(w.model.trim().toLowerCase())) {
            return toast.error(`模型不存在：${w.model.trim()}`);
        }

        const hasUserContent = w.messages.some(m => m.role === 'user' && m.content.trim() !== '');
        if (!hasUserContent) {
            return toast.error("请输入用户信息");
        }

        const conversation = w.messages
            .filter(m => m.content.trim() !== '')
            .map(({ role, content }) => ({ role, content }));

        if (conversation.length === 0) {
            return toast.error("请至少输入一条有内容的消息");
        }

        patchActiveProjectWindow(wId, { isLoading: true, response: '', resultError: '' });

        try {
            const result = await submitWithTimeout({
                model: w.model,
                messages: conversation,
                jsonSchema: w.jsonSchema,
                providerId: w.providerId
            }, 60000, (content) => {
                patchActiveProjectWindow(wId, { response: content, resultError: '' });
            });

            if (result.ok) {
                patchActiveProjectWindow(wId, { isLoading: false, response: result.content, resultError: '' }, true);
            } else {
                patchActiveProjectWindow(wId, { isLoading: false, response: '', resultError: result.error }, true);
            }

        } catch (e) {
            patchActiveProjectWindow(wId, { isLoading: false, response: '', resultError: (e as Error).message }, true);
        }
    };

    const assessWindow = async (wId: string) => {
        if (!activeProject) return;
        const w = activeProject.windows.find(win => win.id === wId);
        if (!w || !w.response?.trim() || w.isAssessing) return;

        if (!activeProject.assessProviderId || !activeProject.assessModel.trim() || !activeProject.assessPrompt.trim()) {
            return toast.error("请在项目配置中设置裁判");
        }

        patchActiveProjectWindow(wId, { isAssessing: true, assessResult: '', assessError: '' });

        try {
            const conversationContext = w.messages
                .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
                .join('\n---\n');

            const result = await submitWithTimeout({
                model: activeProject.assessModel,
                providerId: activeProject.assessProviderId,
                messages: [
                    {
                        role: 'system',
                        content: `你是一个 AI 响应评估器。标准：\n${activeProject.assessPrompt}`
                    },
                    {
                        role: 'user',
                        content: `上下文（对话历史）：\n${conversationContext}`
                    },
                    {
                        role: 'user',
                        content: `待评估的模型输出：\n${w.response}${w.jsonSchema ? `\n\n期望的 JSON SCHEMA：\n${w.jsonSchema}` : ''}`
                    }
                ]
            }, 60000, (content) => {
                patchActiveProjectWindow(wId, { assessResult: content, assessError: '' });
            });

            if (result.ok) {
                patchActiveProjectWindow(wId, { isAssessing: false, assessResult: result.content, assessError: '' }, true);
            } else {
                patchActiveProjectWindow(wId, { isAssessing: false, assessResult: '', assessError: result.error }, true);
            }

        } catch (e) {
            patchActiveProjectWindow(wId, { isAssessing: false, assessResult: '', assessError: (e as Error).message }, true);
        }
    };



    const compareAll = async () => {
        const project = activeProjectRef.current;
        if (!project || isComparing) return;

        if (!project.assessProviderId || !project.assessModel.trim() || !project.assessPrompt.trim()) {
            updateActiveProject({ ...project, compareError: "请先设置裁判模型和裁判提示词" });
            setIsCompareOpen(true);
            return;
        }

        const missingModel: number[] = [];
        const invalidModel: { index: number; model: string }[] = [];
        const missingUser: number[] = [];

        project.windows.forEach((w, i) => {
            if (!w.providerId || !w.model.trim()) {
                missingModel.push(i + 1);
            } else if (modelSet.size > 0 && !modelSet.has(w.model.trim().toLowerCase())) {
                invalidModel.push({ index: i + 1, model: w.model.trim() });
            }

            const hasUserContent = w.messages.some(m => m.role === 'user' && m.content.trim() !== '');
            if (!hasUserContent) {
                missingUser.push(i + 1);
            }
        });

        if (missingModel.length > 0) {
            updateActiveProject({ ...project, compareError: `分屏 ${missingModel.join(', ')} 没有配置model` });
            setIsCompareOpen(true);
            return;
        }
        if (invalidModel.length > 0) {
            const labels = invalidModel.map(i => `${i.index}:${i.model}`).join(', ');
            updateActiveProject({ ...project, compareError: `模型不存在：${labels}` });
            setIsCompareOpen(true);
            return;
        }
        if (missingUser.length > 0) {
            updateActiveProject({ ...project, compareError: `分屏 ${missingUser.join(', ')} 没有输入用户内容` });
            setIsCompareOpen(true);
            return;
        }

        setIsComparing(true);
        updateActiveProject({ ...project, compareResult: '', compareError: '' });

        try {
            for (const w of project.windows) {
                await ensureWindowResponse(w);
                const latest = activeProjectRef.current || project;
                const latestWindow = latest.windows.find(win => win.id === w.id);
                if (latestWindow?.resultError?.trim()) {
                    updateActiveProject({ ...latest, compareError: latestWindow.resultError });
                    setIsCompareOpen(true);
                    return;
                }
            }

            const latestProject = activeProjectRef.current || project;
            const comparePrompt = buildComparePrompt(latestProject.windows);

            const result = await submitWithTimeout({
                model: latestProject.assessModel,
                providerId: latestProject.assessProviderId,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个 AI 响应评估器。请严格按照用户提供的评审标准进行比较。'
                    },
                    {
                        role: 'user',
                        content: comparePrompt
                    }
                ]
            }, 60000, (content) => {
                patchActiveProject({ compareResult: content, compareError: '' });
            });

            if (result.ok) {
                updateActiveProject({ ...latestProject, compareResult: result.content, compareError: '' });
            } else {
                updateActiveProject({ ...latestProject, compareError: result.error });
                setIsCompareOpen(true);
            }
        } catch (e) {
            console.error(e);
            updateActiveProject({ ...(activeProjectRef.current || project), compareError: `一键评估失败：${(e as Error).message}` });
            setIsCompareOpen(true);
        } finally {
            setIsComparing(false);
        }
    };

    const [draggedMsgId, setDraggedMsgId] = useState<string | null>(null);

    const handleDragStart = (_e: React.DragEvent, id: string) => {
        setDraggedMsgId(id);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string, windowId: string) => {
        e.preventDefault();
        if (!draggedMsgId || draggedMsgId === targetId) return;

        const win = activeProject?.windows.find(w => w.id === windowId);
        if (!win) return;

        const msgs = [...win.messages];
        const fromIdx = msgs.findIndex(m => m.id === draggedMsgId);
        const toIdx = msgs.findIndex(m => m.id === targetId);

        if (fromIdx === -1 || toIdx === -1) return;

        const [moved] = msgs.splice(fromIdx, 1);
        msgs.splice(toIdx, 0, moved);

        updateWindow(windowId, { messages: msgs });
    };

    const onDragEnd = () => setDraggedMsgId(null);



    if (!activeProject) {
        return <ProjectList
            projects={projects}
            onSelect={setActiveProject}
            onCreate={handleCreateProject}
            onDelete={handleDeleteProject}
            isLoading={false}
        />;
    }

    return (
        <div className="flex flex-col min-h-full bg-gray-50 p-4">
            {/* Header */}
            <div className="flex items-center justify-between bg-white px-4 py-3 border-b border-gray-200 shadow-sm shrink-0 rounded-t-xl mx-4 mt-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => {
                            if (isDirty) {
                                toast.confirm({
                                    message: '当前有未保存的更改，离开将丢失这些修改。确定要返回吗？',
                                    type: 'danger',
                                    confirmText: '确定离开',
                                    onConfirm: () => {
                                        setActiveProject(null);
                                        setIsDirty(false);
                                    }
                                });
                            } else {
                                setActiveProject(null);
                            }
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <input
                            value={activeProject.name}
                            onChange={(e) => updateActiveProject({ ...activeProject, name: e.target.value })}
                            className="text-base font-bold text-black bg-gray-50 border border-gray-200 focus:border-black focus:ring-0 outline-none w-auto min-w-[240px] px-3 py-1.5 rounded-xl placeholder:text-zinc-300 shadow-sm transition-all"
                            placeholder="项目名称"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-widest rounded-lg shadow-sm transition-all active:scale-95 border border-black",
                            isSaving
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-100"
                                : "bg-black text-white hover:bg-zinc-800"
                        )}
                    >
                        <Save className={cn("w-4 h-4", isSaving && "animate-spin")} />
                        {isSaving ? "保存中" : "保存项目"}
                    </button>

                    <button
                        onClick={() => setIsAssessPromptOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-widest rounded-lg transition-all border border-black shadow-sm bg-black text-white hover:bg-zinc-800"
                    >
                        <Settings className="w-4 h-4" />
                        项目配置
                    </button>

                    <button
                        onClick={compareAll}
                        disabled={isComparing}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-widest rounded-lg shadow-sm border border-black transition-all active:scale-95",
                            isComparing
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "bg-black text-white hover:bg-zinc-800"
                        )}
                    >
                        {isComparing ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Trophy className="w-3.5 h-3.5" />}
                        一键评估
                    </button>
                </div>
            </div>
            <AssessPromptDialog
                isOpen={isAssessPromptOpen}
                onClose={() => setIsAssessPromptOpen(false)}
                prompt={activeProject.assessPrompt}
                model={activeProject.assessModel}
                description={activeProject.description || ''}
                providerId={activeProject.assessProviderId}
                availableModels={availableModels}
                providers={providers}
                modelSet={modelSet}
                onSave={async (prompt, model, pId, desc) => {
                    if (!activeProject) return;
                    const updated = { 
                        ...activeProject, 
                        assessPrompt: prompt, 
                        assessModel: model, 
                        assessProviderId: pId, 
                        description: desc 
                    };
                    updateActiveProject(updated);
                }}
            />

            <ComparePanel
                compareResult={activeProject.compareResult}
                compareError={activeProject.compareError}
                isComparing={isComparing}
                isOpen={isCompareOpen}
                onToggle={() => setIsCompareOpen(v => !v)}
            />

            {/* Canvas */}
            <div className="flex-1 overflow-x-auto px-4 pb-4 mt-4">
                <div className="flex gap-4 min-w-max h-full">
                    {activeProject.windows.map((w) => (
                        <PlaygroundWindowCard
                            key={w.id}
                            window={w}
                            onUpdate={u => updateWindow(w.id, u)}
                            onRemove={() => removeWindow(w.id)}
                            onDuplicate={() => duplicateWindow(w)}
                            onRun={() => runWindow(w.id)}
                            onAssess={() => assessWindow(w.id)}
                            canRemove={activeProject.windows.length > 1}
                            draggedMsgId={draggedMsgId}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDragEnd={onDragEnd}
                            providers={providers}
                        />
                    ))}

                    <button
                        onClick={addWindow}
                        className="w-16 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 text-gray-400 hover:text-indigo-500 transition-all"
                    >
                        <Plus className="w-8 h-8" />
                    </button>
                </div>
            </div>
        </div>
    );
}
