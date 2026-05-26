import type { Country, Continent, Timeframe, Topic, Voice, BiasPosition, MusicSuite } from '../types-shared';

type VoiceGender = Voice['gender'];
import { biasOptions } from '../data/bias';
import { timeframes } from '../data/timeframes';

/**
 * Golden source for configuration context.
 * All computed once in TypeScript — no token-wasting Python blocks.
 */
export interface SessionConfig {
  meta: {
    generatedAt: string;
    version: '1.0';
  };
  dates: {
    today: string;
    earliestDate: string;
    days: number;
    timeframeId: Timeframe;
    timeframeLabel: string;
  };
  geography: {
    country: {
      name: string;
      code: string;
      language: string;
      newsSources: { name: string; domain?: string }[];
    };
    continent: {
      name: string;
      code: string;
      newsSources: { name: string; language: string }[];
    };
  };
  content: {
    topics: Topic[];
    voice: {
      id: string;
      voiceId: string;
      label: string;
      description: string;
      gender: VoiceGender;
      accent: string;
    };
    musicSuite?: {
      intro: string;
      outro: string;
      storySting: string;
      blockSting: string;
    };
  };
  editorial: {
    biasId: BiasPosition;
    biasLabel: string;
    includeSegment: boolean;
  };
}

export interface BuildSessionConfigParams {
  country: Country;
  continent: Continent;
  timeframe: Timeframe;
  topics: Topic[];
  voice: Voice;
  bias: BiasPosition;
  includeEditorialSegment: boolean;
  musicSuite?: MusicSuite;
}

export function buildSessionConfig(params: BuildSessionConfigParams): SessionConfig {
  const today = new Date().toISOString().split('T')[0];
  const days = { daily: 1, weekly: 7, monthly: 30 }[params.timeframe];
  const earliestDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const tfConfig = timeframes.find(t => t.value === params.timeframe)!;
  const biasConfig = biasOptions.find(b => b.id === params.bias)!;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      version: '1.0',
    },
    dates: {
      today,
      earliestDate,
      days,
      timeframeId: params.timeframe,
      timeframeLabel: tfConfig.label,
    },
    geography: {
      country: {
        name: params.country.name,
        code: params.country.code,
        language: params.country.language,
        newsSources: params.country.newsSources,
      },
      continent: {
        name: params.continent.name,
        code: params.continent.code,
        newsSources: params.continent.newsSources,
      },
    },
    content: {
      topics: params.topics,
      voice: {
        id: params.voice.id,
        voiceId: params.voice.voiceId,
        label: params.voice.label,
        description: params.voice.description,
        gender: params.voice.gender,
        accent: params.voice.accent,
      },
      musicSuite: params.musicSuite
        ? {
            intro: params.musicSuite.intro.id,
            outro: params.musicSuite.outro.id,
            storySting: params.musicSuite.storySting.id,
            blockSting: params.musicSuite.blockSting.id,
          }
        : undefined,
    },
    editorial: {
      biasId: params.bias,
      biasLabel: biasConfig.label,
      includeSegment: params.includeEditorialSegment,
    },
  };
}

/**
 * Generate a human-readable podcast filename from session config.
 * Format: "{Country} {Timeframe} Report - YYYY-MM-DD.mp3"
 */
export function getPodcastFileName(config: SessionConfig): string {
  const country = config.geography.country.name;
  const timeframe = config.dates.timeframeLabel;
  const date = config.dates.today;
  const safeCountry = country.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  return `${safeCountry} ${timeframe} Report - ${date}.mp3`;
}

/**
 * Formats SessionConfig as a markdown block for LLM prompts.
 * Use this when injecting context into a prompt.
 */
export function formatSessionContextForLLM(config: SessionConfig): string {
  return `## SESSION CONTEXT (Golden Source)

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

All downstream agents must respect the dates, sources, and editorial perspective declared above.
`;
}
