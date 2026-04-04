import { redirect } from 'next/navigation';
import { assertAdminAuth } from '@/lib/server/auth';

export default async function Home() {
    const isAuth = await assertAdminAuth();
    if (!isAuth) {
        redirect('/login');
    } else {
        redirect('/admin/providers');
    }
}
