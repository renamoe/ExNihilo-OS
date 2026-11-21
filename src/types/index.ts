export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fastModel?: string;
  temperature?: number;
}

export type AppStatus = 'generating' | 'ready' | 'error';

export interface AppRecord {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompt: string;
  html: string;
  status: AppStatus;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CandidateApp {
  name: string;
  icon: string;
  description: string;
  prompt: string;
}

export interface WindowInstance {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  extendOpen: boolean;
  extending: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
