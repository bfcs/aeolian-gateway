import LoginForm from './login-form';
import { Shield, AlertTriangle } from 'lucide-react';
import { getAdminPassword } from '@/lib/server/config';

export default async function LoginPage() {
    const password = await getAdminPassword();
    const isConfigured = !!password;
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-3xl shadow-xl shadow-indigo-100/50 border border-gray-100/50">
                <div className="text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                        <Shield className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 leading-tight">
                        Aeolian
                    </h2>
                    <p className="mt-3 text-sm text-gray-500 font-medium">
                        {isConfigured 
                            ? "请输入主密码以访问控制面板"
                            : "需要配置服务器信息"}
                    </p>
                </div>

                {isConfigured ? (
                    <LoginForm />
                ) : (
                    <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-2xl">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-sm font-bold text-red-800">未设置管理员密码</h3>
                                <p className="mt-1 text-xs text-red-700 leading-relaxed">
                                    系统检测到未配置管理员密码，访问已被拒绝。<br/>
                                    请联系系统管理员进行配置。
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
