'use server';
import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import { getAdminPassword } from '@/lib/server/config';

export async function loginAction(password: string) {
    const adminPassword = await getAdminPassword();

    if (!adminPassword) {
        return { success: false, error: '服务器未配置 ADMIN_PASSWORD' };
    }


    if (password === adminPassword) {
        const secret = new TextEncoder().encode(adminPassword);
        const jwt = await new SignJWT({ admin: true })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('30d')
            .sign(secret);
        
        const cookieStore = await cookies();
        cookieStore.set('admin_token', jwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 // 30 days
        });
        return { success: true };
    }
    return { success: false, error: '密码错误' };
}

export async function logoutAction() {
    const cookieStore = await cookies();
    cookieStore.delete('admin_token');
    return { success: true };
}
