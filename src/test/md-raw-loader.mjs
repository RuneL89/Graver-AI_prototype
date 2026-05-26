import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { register } from 'node:module';

export async function load(url, context, nextLoad) {
  const urlStr = String(url);
  if (urlStr.endsWith('.md?raw') || urlStr.endsWith('.md')) {
    const filePath = fileURLToPath(urlStr.replace('?raw', ''));
    const content = readFileSync(filePath, 'utf-8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(content)};`,
    };
  }
  return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.md?raw') || specifier.endsWith('.md')) {
    return {
      shortCircuit: true,
      url: new URL(specifier.replace('?raw', ''), context.parentURL).href,
    };
  }
  return nextResolve(specifier, context);
}

register(import.meta.url);
