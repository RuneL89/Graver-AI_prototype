import type { WorkbenchSessionConfig } from './types';
import { loadApiConfig, loadBraveApiKey, loadBraveProxyUrl } from './lib/apiConfig';

/**
 * Build the default workbench session configuration.
 * Merges saved localStorage values with environment variable fallbacks.
 */
export async function getWorkbenchConfig(): Promise<WorkbenchSessionConfig> {
  const appConfig = await loadApiConfig();
  const savedApiConfig = appConfig.lightweight;

  return {
    id: 'default',
    name: 'Default Session',
    createdAt: new Date().toISOString(),
    apiConfig: {
      provider: savedApiConfig.provider || 'openai',
      apiKey: savedApiConfig.apiKey || import.meta.env.VITE_OPENAI_API_KEY || '',
      baseUrl: savedApiConfig.baseUrl || '',
      model: savedApiConfig.model || import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o',
    },
    braveApiKey: (await loadBraveApiKey()) || '',
    braveProxyUrl: (await loadBraveProxyUrl()) || 'https://wandering-salad-4125.atavist89.workers.dev',
  };
}

/**
 * @deprecated Use getWorkbenchConfig() to load user-saved settings.
 * Kept for backward compatibility in non-async contexts.
 */
export const defaultWorkbenchConfig: WorkbenchSessionConfig = {
  id: 'default',
  name: 'Default Session',
  createdAt: new Date().toISOString(),
  apiConfig: {
    provider: 'openai',
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
    baseUrl: '',
    model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o',
  },
  braveApiKey: '',
  braveProxyUrl: 'https://wandering-salad-4125.atavist89.workers.dev',
};
