export type ApiProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'custom';

export interface ApiConfig {
  provider: ApiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AppApiConfig {
  lightweight: ApiConfig;
  thinking: ApiConfig;
}
