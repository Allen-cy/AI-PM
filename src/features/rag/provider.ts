import corpusSnapshot from './corpus.snapshot.json' with { type: 'json' };

import { createLocalRagService } from './local-rag-service.ts';
import type { RagDocument, RagQueryInput, RagQueryResult, RagService } from './types.ts';

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

export function queryRagWithAdditionalDocuments(
  input: RagQueryInput,
  additionalDocuments: RagDocument[] = [],
): RagQueryResult {
  if (additionalDocuments.length === 0) return getRagService().query(input);
  return createLocalRagService({
    documents: [...snapshot.documents, ...additionalDocuments],
    indexVersion: `${snapshot.index_version}+dynamic-${additionalDocuments.length}`,
    generatedAt: snapshot.generated_at,
  }).query(input);
}

export function getRagHealthWithAdditionalDocuments(additionalDocuments: RagDocument[] = [], warning?: string) {
  const base = getRagService().health();
  return {
    ...base,
    index_version: additionalDocuments.length > 0 ? `${base.index_version}+dynamic-${additionalDocuments.length}` : base.index_version,
    page_count: base.page_count + additionalDocuments.length,
    chunk_count: base.chunk_count + additionalDocuments.length,
    dynamic_document_count: additionalDocuments.length,
    dynamic_warning: warning,
  };
}
