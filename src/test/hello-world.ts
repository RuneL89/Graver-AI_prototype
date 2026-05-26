import { PipelineRunner } from '../workbench/lib/pipeline';
import type { AgentMap } from '../workbench/lib/pipelineTypes';
import { buildSessionConfig } from '../workbench/lib/sessionConfig';
import { writeSegment } from '../workbench/lib/fileManager';
import type { Country, Continent, Voice, Topic, BiasPosition } from '../workbench/types-shared';

export interface HelloWorldResult {
  success: boolean;
  message: string;
}

const dummyCountry: Country = {
  code: 'US',
  name: 'United States',
  continent: 'North America',
  continentCode: 'NA',
  center: [37.09, -95.71],
  zoom: 4,
  newsSources: [{ name: 'Example News' }],
  language: 'en',
};

const dummyContinent: Continent = {
  code: 'NA',
  name: 'North America',
  bounds: [[15, -170], [72, -50]],
  color: '#3b82f6',
  newsSources: [{ name: 'Example Continental', language: 'en' }],
};

const dummyVoice: Voice = {
  id: 'default',
  voiceId: 'default',
  label: 'Default',
  description: 'Default voice',
  gender: 'male',
  accent: 'neutral',
};

const dummyTopics: Topic[] = ['General News', 'Politics', 'Economy'];

const dummyAgents: AgentMap = {
  articleResearch: async (_ctx, onReasoningChunk) => {
    onReasoningChunk('Researching articles...');
    return {
      draft: 'Found 3 articles about test topic.',
      reasoning: 'Used dummy research agent.',
      metadata: { done: true },
    };
  },
  scriptWriter: async (_ctx, onReasoningChunk) => {
    onReasoningChunk('Writing script...');
    return {
      draft: 'Hello world script draft.',
      reasoning: 'Used dummy writer agent.',
      metadata: { done: true },
    };
  },
  fullScriptEditor: async (ctx, onReasoningChunk) => {
    onReasoningChunk('Editing script...');
    return {
      draft: ctx.currentDraft,
      reasoning: 'Approved.',
      metadata: { approval_status: 'APPROVED' },
    };
  },
  fullScriptWriter: async (ctx, onReasoningChunk) => {
    onReasoningChunk('Rewriting script...');
    return {
      draft: ctx.currentDraft,
      reasoning: 'Rewritten.',
      metadata: { done: true },
    };
  },
  segmentWriter: async (_ctx, onReasoningChunk) => {
    onReasoningChunk('Writing segment...');
    return {
      draft: 'Segment content.',
      reasoning: 'Segment written.',
      metadata: { done: true },
    };
  },
  segmentEditor: async (_ctx, onReasoningChunk) => {
    onReasoningChunk('Editing segment...');
    return {
      draft: 'Segment content.',
      reasoning: 'Segment approved.',
      metadata: { approval_status: 'APPROVED' },
    };
  },
  assembler: async (_ctx, onReasoningChunk) => {
    onReasoningChunk('Assembling...');
    return {
      draft: 'Assembled content.',
      reasoning: 'Assembled.',
      metadata: { done: true },
    };
  },
  agent6: async (_ctx, onReasoningChunk) => {
    onReasoningChunk('Finalising...');
    // Write a file to IndexedDB via the reused file manager
    await writeSegment('intro', 'hello-world-pipeline-test');
    return {
      draft: 'Final content with IndexedDB write.',
      reasoning: 'Wrote intro segment to IndexedDB.',
      metadata: { done: true },
    };
  },
};

export async function runHelloWorldTest(): Promise<HelloWorldResult> {
  try {
    const sessionConfig = buildSessionConfig({
      country: dummyCountry,
      continent: dummyContinent,
      timeframe: 'daily',
      topics: dummyTopics,
      voice: dummyVoice,
      bias: 'moderate' as BiasPosition,
      includeEditorialSegment: false,
    });

    const runner = new PipelineRunner(dummyAgents, {
      onStateChange: () => {},
      onComplete: () => {},
      onError: () => {},
    });

    await runner.run(sessionConfig, true); // testMode = true

    // Verify the file was written by reading it back
    const { readSegment } = await import('../workbench/lib/fileManager');
    const content = await readSegment('intro');

    if (content === 'hello-world-pipeline-test') {
      return {
        success: true,
        message: 'Pipeline executed and wrote "hello-world-pipeline-test" to IndexedDB intro segment.',
      };
    }

    return {
      success: false,
      message: `Pipeline ran but file content mismatch: expected "hello-world-pipeline-test", got "${content}"`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
