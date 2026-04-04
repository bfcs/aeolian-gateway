import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function SchemaDialog({
    isOpen,
    onClose,
    schema,
    onSave
}: {
    isOpen: boolean;
    onClose: () => void;
    schema: string;
    onSave: (s: string) => void;
}) {
    const [localSchema, setLocalSchema] = useState(schema);

    useEffect(() => {
        setLocalSchema(schema);
    }, [schema, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-gray-900">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h3 className="text-lg font-medium text-gray-900">结构化输出</h3>
                        <p className="text-xs text-gray-500">提供 JSON Schema 以强制执行输出结构。</p>
                    </div>
                    <button onClick={onClose} className="p-1 px-2 hover:bg-gray-200 rounded-lg text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-5">
                    <textarea
                        value={localSchema}
                        onChange={(e) => setLocalSchema(e.target.value)}
                        placeholder='{ "type": "object", "properties": { ... } }'
                        className="w-full h-28 bg-white text-gray-900 font-mono text-xs p-4 rounded-xl border border-gray-200 focus:border-black outline-none resize-y transition-all shadow-sm"
                    />
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => {
                            onSave(localSchema);
                            onClose();
                        }}
                        className="flex items-center gap-2 px-6 py-2 text-xs font-medium uppercase tracking-widest text-white bg-black rounded-lg hover:bg-gray-800 shadow-lg shadow-gray-200 transition-all active:scale-95"
                    >
                        保存 Schema
                    </button>
                </div>
            </div>
        </div>
    );
}
