export type ContinentCode = 'EU' | 'AS' | 'ME' | 'NA' | 'SA' | 'AF' | 'OC';

export interface ContinentNewsSource {
  name: string;
  language: string;
  domain?: string;
}

export interface Continent {
  code: ContinentCode;
  name: string;
  bounds: [[number, number], [number, number]];
  color: string;
  newsSources: ContinentNewsSource[];
}

export interface Country {
  code: string;
  name: string;
  continent: string;
  continentCode: ContinentCode;
  center: [number, number];
  zoom: number;
  newsSources: { name: string; domain?: string }[];
  language: string;
}

export type Timeframe = 'daily' | 'weekly' | 'monthly';

export interface TimeframeConfig {
  value: Timeframe;
  label: string;
  days: number;
}

export interface Voice {
  id: string;
  voiceId: string;
  label: string;
  description: string;
  gender: 'male' | 'female';
  accent: string;
}

export interface MusicStyle {
  id: string;
  name: string;
  description: string;
  duration: string;
  mood: string;
}

export interface MusicSuite {
  name?: string;
  intro: MusicStyle;
  outro: MusicStyle;
  storySting: MusicStyle;
  blockSting: MusicStyle;
}

export type Topic = 'General News' | 'Politics' | 'Economy' | 'Entertainment' | 'Sport' | 'Society' | 'Technology' | 'Crime';

export type BiasPosition = 'extreme-left' | 'moderate-left' | 'moderate' | 'moderate-right' | 'extreme-right';

export interface BiasConfig {
  id: BiasPosition;
  label: string;
  shortLabel: string;
}

export interface GeneratedPrompt {
  content: string;
  metadata: {
    country: Country;
    continent: Continent;
    timeframe: Timeframe;
    voice: Voice;
    musicSuite: MusicSuite;
    topics: Topic[];
    wordCount: number;
  };
}

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
