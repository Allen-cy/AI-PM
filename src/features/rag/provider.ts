import corpusSnapshot from './corpus.snapshot.json' with { type: 'json' };

import { createLocalRagService } from './local-rag-service.ts';
import type { RagDocument, RagService } from './types.ts';

interface CorpusSnapshot {
  schema_version: '1.0';
  index_version: string;
  generated_at: string;
  documents: RagDocument[];
}

const snapshot = corpusSnapshot as CorpusSnapshot;
let service: RagService | undefined;

export function getRagService(): RagService {
  service ??= createLocalRagService({
    documents: snapshot.documents,
    indexVersion: snapshot.index_version,
    generatedAt: snapshot.generated_at,
  });
  return service;
}
