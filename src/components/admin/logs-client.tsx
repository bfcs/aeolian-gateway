'use client';

import React, { useState, useEffect } from 'react';
import { Search, RotateCcw, Clock, AlertTriangle, CheckCircle2, HelpCircle, Activity, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchLogs, clearLogs } from '@/app/actions/logs';
import { useToast } from '@/components/ui/toast';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import jsonLang from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';

SyntaxHighlighter.registerLanguage('json', jsonLang);

interface LogEntry {
    timestamp: string;
    gateway_key_name: string;
    provider_name: string;
    model: string;
    status: number;
    duration_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    error_message: string;
    is_stream: boolean;
    thinking_level: string;
    request_method: string;
    request_path: string;
    request_body: string;
    response_body: string;
    upstream_url?: string;
}

export default function LogsClient({ initialLogs }: { initialLogs: LogEntry[] }) {
    const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeFilter, setActiveFilter] = useState<number | 'all' | null>('all');
    const [search, setSearch] = useState('');
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [activeTooltip, setActiveTooltip] = useState<{ log: LogEntry; x: number; y: number } | null>(null);
    const toast = useToast();

    const fetchLogsData = async (start: string, end: string) => {
        setIsRefreshing(true);
        try {
            const startISO = start ? new Date(start).toISOString() : undefined;
            const endISO = end ? new Date(end + 'T23:59:59').toISOString() : undefined;

            const newLogs = await fetchLogs({ start: startISO, end: endISO });
            setLogs(newLogs);
        } catch (e) {
            console.error("无法获取日志", e);
            toast.error("无法获取日志: " + (e as Error).message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const refreshLogs = () => fetchLogsData(startDate, endDate);

    const handleClearLogs = async () => {
        toast.confirm({
            message: "确定要清空所有日志记录吗？清空后将无法恢复。",
            type: "danger",
            onConfirm: async () => {
                setIsClearing(true);
                try {
                    const res = await clearLogs();
                    if (res.success) {
                        toast.success("日志已成功清空");
                        setLogs([]);
                    } else {
                        toast.error("清空失败: " + res.error);
                    }
                } catch (e: any) {
                    toast.error("清空发生异常: " + (e.message || "未知错误"));
                } finally {
                    setIsClearing(false);
                }
            }
        });
    };

    const applyQuickFilter = (days: number, save = true) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        setStartDate(startStr);
        setEndDate(endStr);
        setActiveFilter(days);
        if (save) localStorage.setItem('logsQuickFilter', days.toString());
        fetchLogsData(startStr, endStr);
    };

    useEffect(() => {
        const saved = localStorage.getItem('logsQuickFilter');
        if (saved && saved !== 'all') {
            const days = parseInt(saved, 10);
            if (!isNaN(days)) {
                applyQuickFilter(days, false);
            }
        }
    }, []);

    const filteredLogs = logs.filter(log =>
        log.gateway_key_name.toLowerCase().includes(search.toLowerCase()) ||
        log.model.toLowerCase().includes(search.toLowerCase()) ||
        log.provider_name.toLowerCase().includes(search.toLowerCase())
    );

    const JsonViewer = ({ body }: { body: string }) => {
        if (!body) return <span className="text-gray-400">无数据</span>;
        try {
            const obj = JSON.parse(body);
            const jsonStr = JSON.stringify(obj, null, 2);
            return (
                <SyntaxHighlighter
                    language="json"
                    style={github}
                    customStyle={{
                        margin: 0,
                        padding: '4px',
                        background: 'transparent',
                        fontSize: 'inherit',
                        lineHeight: 'inherit',
                        fontFamily: 'inherit',
                        wordBreak: 'break-all',
                        whiteSpace: 'pre-wrap'
                    }}
                    wrapLongLines={true}
                >
                    {jsonStr}
                </SyntaxHighlighter>
            );
        } catch (_e) {
            return <span className="text-gray-500 break-all whitespace-pre-wrap">{body}</span>;
        }
    };

    const getErrorMessage = (errorStr: string) => {
        if (!errorStr) return '';
        try {
            const parsed = JSON.parse(errorStr);
            // 数组则取第一个
            const target = Array.isArray(parsed) ? parsed[0] : parsed;
            
            if (typeof target === 'string') return target;
            
            // 尝试从常见 API 错误结构中提取 message
            if (target?.error?.message) return target.error.message;
            if (target?.message) return target.message;
            if (target?.error && typeof target.error === 'string') return target.error;
            
            return errorStr;
        } catch {
            return errorStr;
        }
    };

    return (
        <div className="p-8 pb-12 max-w-7xl mx-auto min-w-0 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-medium text-gray-900">请求日志</h1>
                    <p className="text-gray-500 text-sm mt-1">实时分析和审计追踪。</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleClearLogs}
                        className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        disabled={isClearing || isRefreshing || logs.length === 0}
                    >
                        <Trash2 className={cn("w-4 h-4", isClearing && "animate-pulse")} />
                        {isClearing ? '清空中...' : '清空'}
                    </button>
                    <button
                        onClick={refreshLogs}
                        className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        disabled={isRefreshing || isClearing}
                    >
                        <RotateCcw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                        {isRefreshing ? '刷新中...' : '刷新'}
                    </button>
                </div>
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-2 text-xs text-gray-500 uppercase font-medium mb-2">
                        <Activity className="w-3 h-3 text-black" />
                        总请求数
                    </div>
                    <div className="text-3xl font-medium text-gray-900">{logs.length}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-2 text-xs text-gray-500 uppercase font-medium mb-2">
                        <Clock className="w-3 h-3 text-black" />
                        平均时长
                    </div>
                    <div className="text-3xl font-medium text-gray-900">
                        {logs.length > 0 ? Math.round(logs.reduce((a, b) => a + b.duration_ms, 0) / logs.length) : 0}<span className="text-sm font-normal text-gray-400 ml-1">ms</span>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-2 text-xs text-gray-500 uppercase font-medium mb-2">
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                        错误率
                    </div>
                    <div className="text-3xl font-medium text-gray-900">
                        {logs.length > 0 ? ((logs.filter(l => l.status >= 400).length / logs.length) * 100).toFixed(1) : 0}<span className="text-sm font-normal text-gray-400 ml-1">%</span>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-2 text-xs text-gray-500 uppercase font-medium mb-2">
                        <CheckCircle2 className="w-3 h-3 text-black" />
                        总 Token 数
                    </div>
                    <div className="text-3xl font-medium text-gray-900">
                        {logs.reduce((a, b) => a + b.total_tokens, 0).toLocaleString()}
                    </div>
                </div>
            </div>

            {/* 过滤栏和日期选择器 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 bg-gray-50/50 border-b border-gray-200 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 flex items-center gap-2 bg-white border border-gray-200 px-3 rounded-lg shadow-sm group focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all h-[38px]">
                            <Search className="w-4 h-4 text-gray-400 group-focus-within:text-black transition-colors shrink-0" />
                            <input
                                type="text"
                                placeholder="按密钥、模型或供应商搜索日志..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-transparent border-none text-sm outline-none p-0 flex-1"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm h-[38px] items-center">
                                {[
                                    { value: 'all', label: '全部' },
                                    { value: 1, label: '1天' },
                                    { value: 7, label: '1周' },
                                    { value: 30, label: '1月' }
                                ].map(f => (
                                    <button 
                                        key={f.value}
                                        onClick={() => {
                                            if (f.value === 'all') {
                                                setActiveFilter('all');
                                                setStartDate('');
                                                setEndDate('');
                                                localStorage.setItem('logsQuickFilter', 'all');
                                                fetchLogsData('', '');
                                            } else {
                                                applyQuickFilter(f.value as number);
                                            }
                                        }}
                                        className={cn(
                                            "px-3 h-full flex items-center text-xs font-medium rounded-md transition-all", 
                                            activeFilter === f.value ? "bg-black text-white shadow-sm" : "text-gray-500 hover:text-black hover:bg-gray-50"
                                        )}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 rounded-lg shadow-sm h-[38px]">
                                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                                <input
                                    type="date"
                                    value={startDate}
                                    max={endDate || undefined}
                                    onChange={(e) => {
                                        const newStart = e.target.value;
                                        setStartDate(newStart);
                                        setActiveFilter(null);
                                        localStorage.removeItem('logsQuickFilter');
                                        
                                        // 逻辑校验：如果开始日期晚于结束日期，自动调整结束日期
                                        let currentEnd = endDate;
                                        if (endDate && newStart > endDate) {
                                            currentEnd = newStart;
                                            setEndDate(newStart);
                                        }
                                        fetchLogsData(newStart, currentEnd);
                                    }}
                                    className="text-xs border-none p-0 focus:ring-0 cursor-pointer text-gray-600 font-medium bg-transparent"
                                />
                                <span className="text-gray-300 mx-1">—</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    min={startDate || undefined}
                                    onChange={(e) => {
                                        const newEnd = e.target.value;
                                        setEndDate(newEnd);
                                        setActiveFilter(null);
                                        localStorage.removeItem('logsQuickFilter');

                                        // 逻辑校验：如果结束日期早于开始日期，自动调整开始日期
                                        let currentStart = startDate;
                                        if (startDate && newEnd < startDate) {
                                            currentStart = newEnd;
                                            setStartDate(newEnd);
                                        }
                                        fetchLogsData(currentStart, newEnd);
                                    }}
                                    className="text-xs border-none p-0 focus:ring-0 cursor-pointer text-gray-600 font-medium whitespace-nowrap bg-transparent"
                                    placeholder="结束日期"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500 font-medium text-xs uppercase tracking-wider border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">时间戳</th>
                                <th className="px-6 py-4">状态</th>
                                <th className="px-6 py-4">网关密钥</th>
                                <th className="px-6 py-4">供应商 / 模型</th>
                                <th className="px-6 py-4">流式 / 思考</th>
                                <th className="px-6 py-4">TOKEN</th>
                                <th className="px-6 py-4 text-right">时长</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Search className="w-8 h-8 opacity-20" />
                                            <p>未找到符合条件的日志。</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log, i) => (
                                    <React.Fragment key={i}>
                                        <tr 
                                            onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                                            className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                                        >
                                            <td className="px-6 py-4 text-gray-500 font-mono text-xs whitespace-nowrap flex items-center gap-2">
                                                <ChevronRight className={cn("w-4 h-4 transition-transform", expandedIndex === i && "rotate-90")} />
                                                {new Date(log.timestamp).toLocaleString(undefined, {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit'
                                                })}
                                            </td>
                                        <td className="px-6 py-4">
                                            <div className="relative">
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-default",
                                                        log.status >= 400 ? "bg-red-50 text-red-700 border-red-100" :
                                                                "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                    )}
                                                    onMouseEnter={(e) => {
                                                        if (log.error_message) {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setActiveTooltip({ log, x: rect.left, y: rect.top });
                                                        }
                                                    }}
                                                    onMouseLeave={() => setActiveTooltip(null)}
                                                >
                                                    {log.status === 200 ? <CheckCircle2 className="w-3 h-3" /> : (log.status >= 500 ? <AlertTriangle className="w-3 h-3" /> : <HelpCircle className="w-3 h-3" />)}
                                                    {log.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs text-gray-400 font-medium">{log.gateway_key_name}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="bg-zinc-100 text-zinc-900 px-2.5 py-1 rounded-md text-xs border border-zinc-200 font-medium tracking-tight w-fit">
                                                    {log.model}
                                                </span>
                                                <div className="text-xs text-gray-400 flex items-center gap-1 ml-0.5 font-medium">
                                                    <div className="w-1 h-1 rounded-full bg-gray-300" />
                                                    {log.provider_name}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs text-gray-400 font-medium">
                                                    {log.is_stream ? '流' : '非流'}
                                                </span>
                                                {log.thinking_level && (
                                                    <span className="text-xs text-gray-500 font-medium uppercase tracking-tight">
                                                        {log.thinking_level}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400 w-8">输入:</span>
                                                    <span className="font-mono text-xs font-medium text-gray-700">{log.prompt_tokens}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400 w-8">输出:</span>
                                                    <span className="font-mono text-xs font-medium text-gray-700">{log.completion_tokens}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400 w-8">总量:</span>
                                                    <span className="font-mono text-xs font-medium text-gray-700">{log.total_tokens}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-600 font-mono text-xs font-medium">
                                            {log.duration_ms}ms
                                        </td>
                                    </tr>
                                    {expandedIndex === i && (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 shadow-inner">
                                                <div className="flex flex-col gap-4 text-xs text-gray-700 max-w-full overflow-hidden">
                                                    <div>
                                                        <div className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 bg-black rounded-full" />
                                                            请求端点
                                                        </div>
                                                        <div className="font-mono bg-white p-3 border border-gray-200 rounded-xl shadow-sm flex items-start gap-3 min-w-0">
                                                            <span className="bg-zinc-100 text-zinc-900 px-2 py-0.5 rounded font-medium text-xs uppercase border border-zinc-200 shrink-0">{log.request_method || 'POST'}</span>
                                                            <span className="text-gray-800 text-xs font-medium tracking-tight min-w-0 break-all">
                                                                {log.request_path || '无数据'}
                                                                {log.upstream_url && (
                                                                    <span className="ml-2 text-gray-400 break-all">
                                                                        {" --> "}
                                                                        <span className="text-gray-600">{log.upstream_url}</span>
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="flex flex-col h-full min-w-0">
                                                            <div className="font-medium text-gray-900 mb-2 flex items-center gap-2 shrink-0">
                                                                <div className="w-1.5 h-1.5 bg-black rounded-full" />
                                                                请求体
                                                            </div>
                                                            <div className="rounded-xl border border-gray-200 shadow-sm p-3 overflow-hidden relative group flex-1 bg-white min-w-0">
                                                                <div className="font-mono text-xs leading-relaxed overflow-auto max-h-72 h-full min-w-0 scrollbar-thin scrollbar-thumb-gray-200 text-gray-900">
                                                                    <JsonViewer body={log.request_body} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col h-full min-w-0">
                                                            <div className="font-medium text-gray-900 mb-2 flex items-center gap-2 shrink-0">
                                                                <div className="w-1.5 h-1.5 bg-black rounded-full" />
                                                                响应体
                                                            </div>
                                                            <div className="rounded-xl border border-gray-200 shadow-sm p-3 overflow-hidden relative group flex-1 bg-white min-w-0">
                                                                <div className="font-mono text-xs leading-relaxed overflow-auto max-h-72 h-full min-w-0 scrollbar-thin scrollbar-thumb-gray-200 text-gray-900">
                                                                    <JsonViewer body={log.response_body} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center text-xs text-gray-400 font-medium uppercase tracking-widest">
                    <div>显示最后 {filteredLogs.length} 条事件</div>
                    <div className="flex gap-2">
                        <button disabled className="px-3 py-1 rounded-md border bg-white disabled:opacity-30 hover:bg-gray-50 transition-colors">上一页</button>
                        <button disabled className="px-3 py-1 rounded-md border bg-white disabled:opacity-30 hover:bg-gray-50 transition-colors">下一页</button>
                    </div>
                </div>
            </div>

            {/* 全局提示框 */}
            {activeTooltip && (
                <div
                    className="fixed z-50 pointer-events-none"
                    style={{
                        top: activeTooltip.y,
                        left: activeTooltip.x,
                        transform: 'translateY(-100%) translateY(-8px)'
                    }}
                >
                    <div className="bg-white text-gray-900 text-xs p-3 rounded-lg shadow-xl max-w-xl max-h-64 overflow-y-auto break-words leading-relaxed border border-gray-100 pointer-events-auto markdown-content">
                        <div className="font-medium text-red-600 mb-2 flex items-center gap-1.5 uppercase tracking-tighter sticky top-0 bg-white pb-1 border-b border-red-50/50">
                            <AlertTriangle className="w-3.5 h-3.5" /> 错误详情
                        </div>
                        <div className="text-gray-700 font-sans text-sm leading-relaxed whitespace-pre-wrap py-1">
                            {getErrorMessage(activeTooltip.log.error_message)}
                        </div>
                        <div className="absolute top-full left-4 -mt-1 border-8 border-transparent border-t-white" />
                    </div>
                </div>
            )}
        </div>
    );
}
