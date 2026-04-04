import { Trophy } from 'lucide-react';
import { marked } from 'marked';
import { formatError } from './utils';

export function ComparePanel({
    compareResult,
    compareError,
    isComparing,
    isOpen,
    onToggle
}: {
    compareResult?: string;
    compareError?: string;
    isComparing: boolean;
    isOpen: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="mx-4 mt-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-gray-500">
                        <Trophy className="w-3.5 h-3.5" />
                        对比结果
                    </div>
                    <button
                        onClick={onToggle}
                        className="text-xs text-gray-400 hover:text-gray-700"
                    >
                        {isOpen ? '收起' : '展开'}
                    </button>
                </div>
                {isOpen && (
                    <div className="p-4 max-h-[420px] overflow-y-auto">
                        {compareError?.trim() ? (
                            <div className="w-full bg-white rounded-xl p-4 min-h-35 overflow-y-auto text-xs font-mono border border-gray-200 shadow-inner text-red-600">
                                <pre className="whitespace-pre-wrap !text-red-600 font-mono leading-relaxed">
                                    {formatError(compareError)}
                                </pre>
                            </div>
                        ) : (
                            <div className="w-full text-xs text-gray-900 leading-relaxed font-sans markdown-content">
                                <div
                                    dangerouslySetInnerHTML={{
                                        __html: marked.parse(compareResult || (isComparing ? "评估中..." : "等待评估...")) as string
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
