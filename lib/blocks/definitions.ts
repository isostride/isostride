import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs/folder';
import type { BlockDefinition, BlockDefinitionsFile, Recommendation } from './types';

/** user/block-definitions.json: the runner's definitions and the recommendations they rejected. */
export async function readDefinitions(folder: DataFolder): Promise<BlockDefinition[]> {
  return (await readJson<BlockDefinitionsFile>(folder, PATHS.blockDefinitions))?.definitions ?? [];
}

export async function writeDefinitions(folder: DataFolder, definitions: BlockDefinition[]): Promise<void> {
  await writeJson(folder, PATHS.blockDefinitions, { definitions } satisfies BlockDefinitionsFile);
}

export function newDefinitionId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Accepting keeps the recommendation as an active definition; rejecting keeps it as rejected, so it is not proposed again. */
export function fromRecommendation(rec: Recommendation, status: 'active' | 'rejected', now = new Date()): BlockDefinition {
  return {
    id: newDefinitionId(),
    name: rec.name,
    origin: 'recommendation',
    status,
    createdAt: now.toISOString(),
    params: rec.params,
    tolerances: rec.tolerances,
  };
}

export const RECOMMENDATIONS_PATH = `${PATHS.derived}/recommendations.json`;
