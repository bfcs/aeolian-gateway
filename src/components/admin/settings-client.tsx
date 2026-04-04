'use client';

import { useState, useRef } from 'react';
import { setSubscriptionUrlAction, setLogSettingsAction } from '@/app/actions/configs';
import { exportConfigAction, importConfigAction } from '@/app/actions/backup';
import { Database, Download, Upload, RefreshCw, Settings2, Link, Info } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

export default function SettingsClient({ initialSubscriptionUrl, initialLogSettings }: { initialSubscriptionUrl: string, initialLogSettings: { max_body_chars: number, log_entry_count: number } }) {
    const [subUrl, setSubUrl] = useState(initialSubscriptionUrl);
    const [logSettings, setLogSettings] = useState(initialLogSettings);
    const [isSavingSub, setIsSavingSub] = useState(false);
    const [isSavingLogs, setIsSavingLogs] = useState(false);
    const [isExporting, setIsSavingExport] = useState(false);
    const [isImporting, setIsSavingImport] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const toast = useToast();

    const handleSaveSub = async () => {
        setIsSavingSub(true);
        try {
            await setSubscriptionUrlAction(subUrl);
            toast.success("订阅 URL 已更新");
        } catch (e) {
            toast.error("更新失败: " + (e as Error).message);
        } finally {
            setIsSavingSub(false);
        }
    };

    const handleSaveLogs = async () => {
        setIsSavingLogs(true);
        try {
            await setLogSettingsAction(logSettings);
            toast.success("日志设置已更新");
        } catch (e) {
            toast.error("更新失败: " + (e as Error).message);
        } finally {
            setIsSavingLogs(false);
        }
    };

    const handleExport = async () => {
        setIsSavingExport(true);
        try {
            const data = await exportConfigAction();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-gateway-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("配置已导出");
        } catch (e) {
            toast.error("导出失败: " + (e as Error).message);
        } finally {
            setIsSavingExport(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsSavingImport(true);
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const result = await importConfigAction(data);
            toast.success(`成功导入 ${result.count} 条记录。`);
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            toast.error("导入失败: " + (err as Error).message);
        } finally {
            setIsSavingImport(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="p-8 pb-12 max-w-4xl mx-auto space-y-10">
            <div>
                <h1 className="text-3xl font-medium tracking-tight text-gray-900">系统设置</h1>
                <p className="text-gray-500 text-sm mt-1 font-medium">配置全局网关行为、订阅和数据备份。</p>
            </div>

            {/* 1. Subscription Settings */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-black border border-gray-200 shadow-inner">
                        <RefreshCw className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-medium text-gray-900">配置订阅</h2>
                        <p className="text-xs text-gray-500 font-medium">从远程 JSON 源自动同步供应商和模型。</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-black uppercase tracking-widest ml-1">订阅源 URL</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input 
                                    type="url" 
                                    value={subUrl} 
                                    onChange={e => setSubUrl(e.target.value)}
                                    placeholder="https://example.com/providers.json"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-black focus:ring-0 outline-none text-sm transition-all bg-gray-50/30"
                                />
                            </div>
                            <button 
                                onClick={handleSaveSub}
                                disabled={isSavingSub}
                                className="px-6 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50 shadow-md whitespace-nowrap"
                            >
                                {isSavingSub ? "保存中..." : "保存订阅设置"}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 font-medium ml-1 flex items-center gap-1.5">
                            <Info className="w-3 h-3" />
                            同步后，现有的同名供应商将被更新，新供应商将被添加。
                        </p>
                    </div>
                </div>
            </div>

            {/* 2. Logging Settings */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-black border border-gray-200 shadow-inner">
                        <Settings2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-medium text-gray-900">日志与审计</h2>
                        <p className="text-xs text-gray-500 font-medium">控制请求日志的存储和展示细节。</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-x-4 gap-y-2 items-end">
                        <div className="space-y-2 w-full">
                            <label className="text-xs font-medium text-black uppercase tracking-widest ml-1">请求体/响应体截断 (字符)</label>
                            <input 
                                type="number" 
                                value={logSettings.max_body_chars} 
                                onChange={e => setLogSettings({...logSettings, max_body_chars: parseInt(e.target.value) || 0})}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-black outline-none text-sm bg-gray-50/30 shadow-sm transition-all"
                            />
                        </div>
                        <div className="space-y-2 w-full">
                            <label className="text-xs font-medium text-black uppercase tracking-widest ml-1">保留日志行数</label>
                            <input 
                                type="number" 
                                value={logSettings.log_entry_count} 
                                onChange={e => setLogSettings({...logSettings, log_entry_count: parseInt(e.target.value) || 0})}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-black outline-none text-sm bg-gray-50/30 shadow-sm transition-all"
                            />
                        </div>
                        <button 
                            onClick={handleSaveLogs}
                            disabled={isSavingLogs}
                            className="px-8 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50 shadow-md whitespace-nowrap"
                        >
                            {isSavingLogs ? "保存中..." : "保存日志配置"}
                        </button>

                        <p className="text-[11px] text-gray-400 font-medium ml-1">超过此长度的请求/响应体将在入库前被截断。</p>
                        <p className="text-[11px] text-gray-400 font-medium ml-1">系统将定期清理，仅保留最近的 N 条记录。</p>
                    </div>
                </div>
            </div>

            {/* 3. Data Management */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-black border border-gray-200 shadow-inner">
                        <Database className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-medium text-gray-900">备份与恢复</h2>
                        <p className="text-xs text-gray-500 font-medium">导出所有配置或从备份文件恢复系统。</p>
                    </div>
                </div>
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
                    <div className="p-6 rounded-2xl border-2 border-dashed border-gray-100 hover:border-gray-200 transition-colors flex flex-col items-center text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <Download className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-gray-900">导出数据</h3>
                            <p className="text-xs text-gray-400 mt-1">下载包含所有供应商、密钥和别名的 JSON 文件。</p>
                        </div>
                        <button 
                            onClick={handleExport}
                            disabled={isExporting}
                            className="w-full py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-medium uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md"
                        >
                            {isExporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            立即导出
                        </button>
                    </div>

                    <div className="p-6 rounded-2xl border-2 border-dashed border-gray-100 hover:border-gray-200 transition-colors flex flex-col items-center text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <Upload className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-gray-900">导入数据</h3>
                            <p className="text-xs text-gray-400 mt-1">从以前导出的 JSON 备份文件中恢复配置。</p>
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleImport}
                            accept=".json"
                            className="hidden"
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                            className="w-full py-2.5 bg-black text-white rounded-xl text-xs font-medium uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isImporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            选择文件
                        </button>
                    </div>

                    <div className="md:col-span-2 bg-red-50/50 p-4 rounded-xl border border-red-100 flex gap-3">
                        <ul className="text-xs text-red-700 space-y-1 list-disc ml-4 font-medium">
                            <li className="font-medium">导出数据含有明文密钥，请谨慎保存不要泄露！</li>
                            <li>具有相同 ID 的现有记录将被备份文件中的内容完全覆盖。</li>
                            <li>建议在执行大批量导入前先导出一份当前配置作为备份。</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
