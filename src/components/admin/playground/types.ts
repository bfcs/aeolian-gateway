export type Role = 'system' | 'user' | 'assistant';

export interface Message {
    id: string;
    role: Role;
    content: string;
}

export interface PlaygroundWindow {
    id: string;
    model: string;
    messages: Message[];
    response: string;
    resultError?: string;
    isLoading: boolean;
    jsonSchema?: string;
    assessResult?: string;
    assessError?: string;
    isAssessing?: boolean;
    providerId: string;
}

export interface Project {
    id: string;
    name: string;
    windows: PlaygroundWindow[];
    updatedAt: number;
    assessPrompt: string;
    assessModel: string;
    assessProviderId: string;
    compareResult?: string;
    compareError?: string;
    description?: string;
}
