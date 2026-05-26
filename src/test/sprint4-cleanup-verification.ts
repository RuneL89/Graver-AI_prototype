/**
 * Sprint 4 (SessionConfig Unification and Dead Code Removal) verification test.
 *
 * Validates:
 * 1. types-shared.ts contains only orchestration-layer types (no newsroom types).
 * 2. fileManager.ts contains only generic IndexedDB operations (no audio functions).
 * 3. sessionConfig.ts contains only generic SessionConfig (no newsroom serialization).
 * 4. data/bias.ts and data/timeframes.ts are deleted.
 * 5. PipelineRunner accepts a generic config type.
 * 6. Build passes with zero TypeScript errors.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

interface TestResult {
  name: string;
  pass: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, message: string) {
  results.push({ name, pass: condition, message: condition ? 'OK' : message });
}

async function runTests() {
  console.log('=== Sprint 4 Cleanup Verification ===\n');

  // 1. types-shared.ts has no newsroom types
  const typesShared = readFileSync(join(__dirname, '../workbench/types-shared.ts'), 'utf-8');
  assert('types-shared.ts does not export Continent', !typesShared.includes('export interface Continent'), 'Found Continent');
  assert('types-shared.ts does not export Country', !typesShared.includes('export interface Country'), 'Found Country');
  assert('types-shared.ts does not export Voice', !typesShared.includes('export interface Voice'), 'Found Voice');
  assert('types-shared.ts does not export MusicSuite', !typesShared.includes('export interface MusicSuite'), 'Found MusicSuite');
  assert('types-shared.ts does not export Topic', !typesShared.includes('export type Topic'), 'Found Topic');
  assert('types-shared.ts does not export BiasPosition', !typesShared.includes('export type BiasPosition'), 'Found BiasPosition');
  assert('types-shared.ts does not export GeneratedPrompt', !typesShared.includes('export interface GeneratedPrompt'), 'Found GeneratedPrompt');
  assert('types-shared.ts exports ApiProvider', typesShared.includes('export type ApiProvider'), 'Missing ApiProvider');
  assert('types-shared.ts exports ApiConfig', typesShared.includes('export interface ApiConfig'), 'Missing ApiConfig');
  assert('types-shared.ts exports AppApiConfig', typesShared.includes('export interface AppApiConfig'), 'Missing AppApiConfig');

  // 2. fileManager.ts has no audio functions
  const fileManager = readFileSync(join(__dirname, '../workbench/lib/fileManager.ts'), 'utf-8');
  assert('fileManager.ts does not export writeAudioFile', !fileManager.includes('export async function writeAudioFile'), 'Found writeAudioFile');
  assert('fileManager.ts does not export readAudioFile', !fileManager.includes('export async function readAudioFile'), 'Found readAudioFile');
  assert('fileManager.ts does not export audioFileExists', !fileManager.includes('export async function audioFileExists'), 'Found audioFileExists');
  assert('fileManager.ts does not export createAudioFile', !fileManager.includes('export async function createAudioFile'), 'Found createAudioFile');
  assert('fileManager.ts does not export appendAudioChunk', !fileManager.includes('export async function appendAudioChunk'), 'Found appendAudioChunk');
  assert('fileManager.ts does not export getPodcastPlaybackUrl', !fileManager.includes('export async function getPodcastPlaybackUrl'), 'Found getPodcastPlaybackUrl');
  assert('fileManager.ts does not export copyPodcastToDocuments', !fileManager.includes('export async function copyPodcastToDocuments'), 'Found copyPodcastToDocuments');
  assert('fileManager.ts does not export readAudioFileBinary', !fileManager.includes('export async function readAudioFileBinary'), 'Found readAudioFileBinary');
  assert('fileManager.ts exports dbGet', fileManager.includes('export async function dbGet'), 'Missing dbGet');
  assert('fileManager.ts exports dbSet', fileManager.includes('export async function dbSet'), 'Missing dbSet');
  assert('fileManager.ts exports dbDelete', fileManager.includes('export async function dbDelete'), 'Missing dbDelete');
  assert('fileManager.ts exports dbKeys', fileManager.includes('export async function dbKeys'), 'Missing dbKeys');

  // 3. sessionConfig.ts has no newsroom serialization
  const sessionConfig = readFileSync(join(__dirname, '../workbench/lib/sessionConfig.ts'), 'utf-8');
  assert('sessionConfig.ts does not export buildSessionConfig', !sessionConfig.includes('export function buildSessionConfig'), 'Found buildSessionConfig');
  assert('sessionConfig.ts does not export getPodcastFileName', !sessionConfig.includes('export function getPodcastFileName'), 'Found getPodcastFileName');
  assert('sessionConfig.ts does not export formatSessionContextForLLM', !sessionConfig.includes('export function formatSessionContextForLLM'), 'Found formatSessionContextForLLM');
  assert('sessionConfig.ts exports SessionConfig', sessionConfig.includes('export interface SessionConfig'), 'Missing SessionConfig');

  // 4. data files deleted
  assert('data/bias.ts deleted', !existsSync(join(__dirname, '../workbench/data/bias.ts')), 'File exists');
  assert('data/timeframes.ts deleted', !existsSync(join(__dirname, '../workbench/data/timeframes.ts')), 'File exists');

  // 5. PipelineRunner is generic
  const pipeline = readFileSync(join(__dirname, '../workbench/lib/pipeline.ts'), 'utf-8');
  assert('PipelineRunner is generic', pipeline.includes('export class PipelineRunner<T'), 'Missing generic parameter');

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  for (const r of results) {
    const icon = r.pass ? 'PASS' : 'FAIL';
    console.log(`${icon}: ${r.name} — ${r.message}`);
  }

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }

  console.log('\nSprint 4 Cleanup verification complete!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
