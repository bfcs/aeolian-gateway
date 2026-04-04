import { useState } from 'react';
import { Cloud, Plus, LayoutGrid, List as ListIcon, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Project } from './types';

export function ProjectList({
    projects,
    onSelect,
    onCreate,
    onDelete,
    isLoading
}: {
    projects: Project[];
    onSelect: (p: Project) => void;
    onCreate: () => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    isLoading: boolean;
}) {
    const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-gray-400">
                    <Cloud className="w-12 h-12 animate-pulse" />
                    <p>正在加载项目...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-medium tracking-tight">竞技场项目</h1>
                    <p className="text-gray-500 text-sm mt-1 font-medium">测试不同模型，提示词和schema的效果</p>
                    <p className="text-gray-400 text-sm mt-1">
                        Tips：模型排名可以参考
                        {' '}
                        <a
                            href="https://arena.ai/leaderboard"
                            target="_blank"
                            rel="noreferrer"
                            className="text-black underline underline-offset-4"
                        >
                            Arena
                        </a>
                    </p>
                </div>
                <button
                    onClick={onCreate}
                    className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md active:scale-95"
                >
                    <Plus className="w-5 h-5" /> 新建项目
                </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white/50 p-4 rounded-2xl border border-gray-100 shadow-sm backdrop-blur-sm">
                <div className="relative flex-1 max-w-sm flex items-center bg-white border border-gray-200 px-3 rounded-lg shadow-sm group focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all h-10">
                    <Search className="w-4 h-4 text-gray-400 group-focus-within:text-black transition-colors shrink-0" />
                    <input
                        type="text"
                        placeholder="搜索项目..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-transparent border-none text-sm outline-none px-2 flex-1"
                    />
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200/50 h-10 items-center">
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            "p-1.5 rounded-lg transition-all h-full flex items-center justify-center px-3",
                            viewMode === 'list' ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"
                        )}
                    >
                        <ListIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('card')}
                        className={cn(
                            "p-1.5 rounded-lg transition-all h-full flex items-center justify-center px-3",
                            viewMode === 'card' ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map(project => (
                        <div
                            key={project.id}
                            onClick={() => onSelect(project)}
                            className="bg-white rounded-xl border border-gray-200 p-6 hover:border-black hover:shadow-md transition-all cursor-pointer flex flex-col"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-black shrink-0">
                                        <LayoutGrid className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-medium text-gray-900 text-lg truncate min-w-0" title={project.name}>{project.name}</h3>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(project.id, e);
                                        }}
                                        className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-all text-xs"
                                        title="删除项目"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {project.description && (
                                <p className="text-sm text-gray-500 mb-4 truncate" title={project.description}>{project.description}</p>
                            )}
                            <div className="mt-auto pt-4 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400">
                                <span>{project.windows.length} 个分屏</span>
                                <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}

                    {filteredProjects.length === 0 && (
                        <div className="col-span-full text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                            <p className="text-gray-500">未找到项目。创建一个以开始！</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">项目名称</th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">分屏数量</th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">更新时间</th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredProjects.map(project => (
                                <tr
                                    key={project.id}
                                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                                    onClick={() => onSelect(project)}
                                >
                                    <td className="px-6 py-4 font-medium text-gray-900 truncate max-w-36">{project.name}</td>
                                    <td className="px-6 py-4 text-gray-500 truncate max-w-50" title={project.description}>{project.description || '-'}</td>
                                    <td className="px-6 py-4 text-gray-500">{project.windows.length} 个分屏</td>
                                    <td className="px-6 py-4 text-gray-500">{new Date(project.updatedAt).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-left">
                                        <div className="flex justify-start gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(project.id, e);
                                                }}
                                                className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-all"
                                                title="删除项目"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredProjects.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        未找到项目。创建一个以开始！
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
