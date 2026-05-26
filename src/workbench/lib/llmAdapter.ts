/**
 * Model-independent LLM API adapter.
 *
 * Problem: every provider/model has slightly different parameter names and
 * restrictions. Hard-coding per-model quirks is a maintenance nightmare.
 *
 * Solution: send a reasonable default body, and if the API rejects a
 * parameter, parse the error message, fix the body automatically, and retry.
 * This is completely provider-agnostic and self-healing.
 */

export interface LlmRequestBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  [key: string]: unknown;
}

interface ParameterFix {
  pattern: RegExp;
  fix: (body: Record<string, unknown>, match?: RegExpExecArray | null) => Record<string, unknown> | null;
}

/**
 * Build a regex that matches "unsupported parameter" error messages across
 * multiple provider formats (OpenAI, Anthropic, Gemini, DeepSeek, Mistral,
 * Bedrock, Ollama, etc.).
 */
function makeUnsupportedParamPattern(
  paramNames: string[],
  extraSuffix?: string
): RegExp {
  const q = paramNames.map((n) => `['"]?${n}['"]?`).join('|');
  const parts = [
    // OpenAI / Azure OpenAI style
    `(?:Unsupported|Unknown|Unrecognized)\\s+(?:parameter|request argument(?:\\s+supplied)?):?\\s*(?:${q})`,
    // DeepSeek / Anthropic style: "does not support the parameter 'X'"
    `does not support(?: the)?(?: parameter)? (?:${q})`,
    // Anthropic style: "does not support the X parameter"
    `does not support(?: the)? (?:${q})(?:\\s+parameter)?`,
    // Ollama / LiteLLM style: "does not support parameters: {'X': ...}"
    `does not support(?: the)?\\s+parameters?:?[\\s\\S]*?(?:${q})`,
    // Gemini native style: "X is not supported by/in/for this model"
    `(?:${q})(?:\\s+parameter)?\\s+is not supported`,
    // Gemini OpenAI-compatible style: "Unknown name 'X': Cannot find field"
    `Unknown name (?:${q}): Cannot find field`,
    // Mistral / Bedrock style: "X: Extra inputs are not permitted"
    `(?:${q})(?:\\.\\w+)?: Extra inputs are not permitted`,
    // Bedrock alternative: "extraneous key [X] is not permitted"
    `extraneous key \\[(?:${q})\\] is not permitted`,
  ];
  const suffix = extraSuffix ? `(?:${extraSuffix})?` : '';
  return new RegExp(`(?:${parts.join('|')})${suffix}`, 'i');
}

const KNOWN_FIXES: ParameterFix[] = [
  // OpenAI newer models (o1, o3, gpt-5.x) reject max_tokens
  {
    pattern: makeUnsupportedParamPattern(
      ['max_tokens'],
      `[\\s\\S]*?Use ['"]?max_completion_tokens['"]? instead`
    ),
    fix: (body) => {
      if (!('max_tokens' in body)) return null;
      const { max_tokens, ...rest } = body;
      return { ...rest, max_completion_tokens: max_tokens };
    },
  },
  // Some older models or non-OpenAI providers reject max_completion_tokens
  {
    pattern: makeUnsupportedParamPattern(
      ['max_completion_tokens'],
      `[\\s\\S]*?Use ['"]?max_tokens['"]? instead`
    ),
    fix: (body) => {
      if (!('max_completion_tokens' in body)) return null;
      const { max_completion_tokens, ...rest } = body;
      return { ...rest, max_tokens: max_completion_tokens };
    },
  },
  // Reasoning models often reject temperature
  {
    pattern: makeUnsupportedParamPattern(['temperature']),
    fix: (body) => {
      if (!('temperature' in body)) return null;
      const { temperature, ...rest } = body;
      return rest;
    },
  },
  // Reasoning models often reject top_p
  {
    pattern: makeUnsupportedParamPattern(['top_p']),
    fix: (body) => {
      if (!('top_p' in body)) return null;
      const { top_p, ...rest } = body;
      return rest;
    },
  },
  // Some providers reject thinking/thinking_type
  {
    pattern: makeUnsupportedParamPattern(['thinking']),
    fix: (body) => {
      if (!('thinking' in body)) return null;
      const { thinking, ...rest } = body;
      return rest;
    },
  },
  // Frequency penalty / presence penalty
  {
    pattern: makeUnsupportedParamPattern(['frequency_penalty', 'presence_penalty']),
    fix: (body) => {
      const { frequency_penalty, presence_penalty, ...rest } = body;
      return rest;
    },
  },
  // Some providers (e.g. Ollama) don't support reasoning_effort
  {
    pattern: makeUnsupportedParamPattern(['reasoning_effort']),
    fix: (body) => {
      if (!('reasoning_effort' in body)) return null;
      const { reasoning_effort, ...rest } = body;
      return rest;
    },
  },
  // Some models cap max_tokens / max_completion_tokens lower than requested.
  // Example: "max_tokens is too large: 24000. This model supports at most 16384 ..."
  {
    pattern: /(?:max_tokens|max_completion_tokens)\s+is\s+too\s+large.*?at\s+most\s+(\d+)/i,
    fix: (body, match) => {
      if (!match) return null;
      const limit = parseInt(match[1], 10);
      if (!limit || isNaN(limit)) return null;
      const param = 'max_completion_tokens' in body ? 'max_completion_tokens' : 'max_tokens' in body ? 'max_tokens' : null;
      if (!param) return null;
      const current = body[param];
      if (typeof current !== 'number' || current <= limit) return null;
      return { ...body, [param]: limit };
    },
  },
];

/**
 * Try to fix a parameter error by applying known fixes.
 * Returns the fixed body, or null if no fix applied.
 */
function tryFixParameterError(
  errorMessage: string,
  body: Record<string, unknown>
): Record<string, unknown> | null {
  for (const { pattern, fix } of KNOWN_FIXES) {
    const match = pattern.exec(errorMessage);
    if (match) {
      const fixed = fix(body, match);
      if (fixed) {
        console.log(`[llmAdapter] Applied fix for: ${errorMessage.slice(0, 120)}`);
        return fixed;
      }
    }
  }
  return null;
}

/**
 * Fetch with adaptive retry. If the API rejects a parameter, automatically
 * fixes the request body and retries (up to maxRetries times).
 */
export async function fetchWithAdaptiveRetry(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  maxRetries = 2
): Promise<{ response: Response; finalBody: Record<string, unknown> }> {
  let currentBody = { ...body };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(currentBody),
    });

    if (response.ok) {
      return { response, finalBody: currentBody };
    }

    // Only attempt fixes for 4xx errors (bad request / unsupported parameter)
    if (response.status < 400 || response.status >= 500) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage: string = errorData.error?.message || `HTTP ${response.status}`;

    const fixedBody = tryFixParameterError(errorMessage, currentBody);
    if (fixedBody) {
      currentBody = fixedBody;
      continue; // Retry with fixed body
    }

    // Not a fixable parameter error
    throw new Error(errorMessage);
  }

  throw new Error('Max adaptive retries exceeded');
}

/**
 * Build a model-agnostic request body.
 * Uses the most modern / widely-supported parameter names by default.
 * The adaptive retry will fix them if the model doesn't support them.
 */
export function buildLlmBody(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    stream?: boolean;
    maxTokens?: number;
    enableThinking?: boolean;
  } = {}
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };

  if (options.stream) {
    body.stream = true;
  }

  // Default to max_completion_tokens (newer OpenAI standard).
  // If the model doesn't support it, the adaptive retry will rename to max_tokens.
  if (options.maxTokens && options.maxTokens > 0) {
    body.max_completion_tokens = options.maxTokens;
  }

  // Thinking / reasoning extensions.
  // Send the correct parameter based on the model family.
  if (options.enableThinking) {
    const lowerModel = model.toLowerCase();
    if (lowerModel.includes('claude')) {
      // Anthropic uses `thinking`
      body.thinking = { type: 'enabled' };
    } else if (
      lowerModel.includes('gpt-5') ||
      lowerModel.startsWith('o') ||
      lowerModel.includes('reasoning')
    ) {
      // OpenAI reasoning models use `reasoning_effort`
      body.reasoning_effort = 'high';
    } else {
      // Unknown model family — default to `thinking` and let adaptive retry handle it.
      body.thinking = { type: 'enabled' };
    }
  }

  return body;
}
