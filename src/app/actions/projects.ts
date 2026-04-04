'use server';

import { createPlaygroundProject, deletePlaygroundProject, getPlaygroundProjects, updatePlaygroundProject } from "@/lib/server/d1";

export async function fetchProjects() {
    const projects = await getPlaygroundProjects();
    // Transform formatting to match frontend expectation if needed, 
    // or update frontend to match DB schema.
    // Frontend expects: { id: string, name: string, updatedAt: number, windows: ... }
    return projects.map(p => ({
        id: p.id,
        name: p.name,
        updatedAt: new Date(p.updated_at).getTime(),
        windows: p.state?.windows || [],
        compareResult: p.state?.compareResult,
        assessPrompt: p.state?.assessPrompt || '',
        assessModel: p.state?.assessModel || '',
        assessProviderId: p.state?.assessProviderId || p.state?.assessProviderType || '',
        description: p.state?.description
    }));
}

export async function addProject(name: string, state: any) {
    try {
        const project = await createPlaygroundProject({ name, state });
        return {
            id: project.id,
            name: project.name,
            updatedAt: new Date(project.updated_at).getTime(),
            windows: project.state?.windows || [],
            compareResult: project.state?.compareResult,
            assessPrompt: project.state?.assessPrompt || '',
            assessModel: project.state?.assessModel || '',
            assessProviderId: project.state?.assessProviderId || project.state?.assessProviderType || '',
            description: project.state?.description
        };
    } catch (e: any) {
        console.error("[ACTION] createPlaygroundProject failed:", e);
        throw e;
    }
}

export async function saveProject(id: string, name: string, state: any) {
    // Ensure we send back the new key if it exists in locally modified state
    await updatePlaygroundProject(id, { name, state });
}

export async function removeProject(id: string) {
    await deletePlaygroundProject(id);
}
