/**
 * Minimal session configuration base type.
 *
 * The workbench uses WorkbenchSessionConfig (defined in ../types.ts).
 * The PipelineRunner accepts any config type via its generic parameter,
 * so this base interface is intentionally permissive.
 */
export interface SessionConfig {
  [key: string]: any;
}
