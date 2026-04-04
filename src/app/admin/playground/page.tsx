import PlaygroundClient from "@/components/admin/playground-client";
import { fetchProjects } from "@/app/actions/projects";
import { fetchAvailableModels, fetchProviders } from "@/app/actions/providers";

export const dynamic = 'force-dynamic';

export default async function PlaygroundPage() {
    const [projects, models, providers] = await Promise.all([
        fetchProjects(),
        fetchAvailableModels(),
        fetchProviders(),
    ]);

    return <PlaygroundClient 
        initialProjects={projects} 
        initialModels={models} 
        initialProviders={providers} 
    />;
}
