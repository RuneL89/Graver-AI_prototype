import { PipelineRunner } from '../workbench/lib/pipeline';
import type { AgentMap } from '../workbench/lib/pipelineTypes';
import { dbSet, dbGet } from '../workbench/lib/fileManager';
import type { SessionConfig } from '../workbench/lib/sessionConfig';

export interface HelloWorldResult {
  success: boolean;
  message: string;
}

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
    // Write a file to IndexedDB via the generic wrapper
    await dbSet('newsroom/intro.txt', 'hello-world-pipeline-test');
    return {
      draft: 'Final content with IndexedDB write.',
      reasoning: 'Wrote intro key to IndexedDB.',
      metadata: { done: true },
    };
  },
};

export async function runHelloWorldTest(): Promise<HelloWorldResult> {
  try {
    const sessionConfig: SessionConfig = {
      apiConfig: {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: '',
        model: 'gpt-4o',
      },
    };

    const runner = new PipelineRunner(dummyAgents, {
      onStateChange: () => {},
      onComplete: () => {},
      onError: () => {},
    });

    await runner.run(sessionConfig, true); // testMode = true

    // Verify the file was written by reading it back
    const content = await dbGet('newsroom/intro.txt');

    if (content === 'hello-world-pipeline-test') {
      return {
        success: true,
        message: 'Pipeline executed and wrote "hello-world-pipeline-test" to IndexedDB intro key.',
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
