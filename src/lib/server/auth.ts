import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getAdminPassword } from "./config";

export async function assertAdminAuth() {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return false;

    const adminPassword = await getAdminPassword();
    if (!adminPassword) return false;


    try {
        const secret = new TextEncoder().encode(adminPassword);
        await jwtVerify(token, secret);
        return true;
    } catch {
        return false;
    }
}
