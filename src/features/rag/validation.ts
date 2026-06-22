import type {
  Confidentiality,
  KnowledgeStatus,
  RagFilters,
  RagQueryInput,
} from './types.ts';

const confidentialityValues = new Set<Confidentiality>([
  'public',
  'internal',
  'confidential',
  'restricted',
]);

const statusValues = new Set<KnowledgeStatus>([
  'draft',
  'reviewed',
  'published',
  'deprecated',
  'archived',
]);

export class RagValidationError extends Error {
  readonly status = 422;
  readonly code = 'INVALID_RAG_QUERY';
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new RagValidationError(`${field} must be an array of strings`);
  }
  return value.map(item => item.trim()).filter(Boolean);
}

function validateFilters(value: unknown): RagFilters | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RagValidationError('filters must be an object');
  }

  const raw = value as Record<string, unknown>;
  const domains = stringArray(raw.domains, 'filters.domains');
  const status = stringArray(raw.status, 'filters.status') as KnowledgeStatus[] | undefined;
  if (status?.some(item => !statusValues.has(item))) {
    throw new RagValidationError('filters.status contains an unsupported value');
  }

  const confidentiality = raw.confidentiality_max;
  if (confidentiality !== undefined && (
    typeof confidentiality !== 'string'
    || !confidentialityValues.has(confidentiality as Confidentiality)
  )) {
    throw new RagValidationError('filters.confidentiality_max is invalid');
  }

  return {
    ...(domains ? { domains } : {}),
    ...(status ? { status } : {}),
    ...(confidentiality ? { confidentiality_max: confidentiality as Confidentiality } : {}),
  };
}

export function validateRagQuery(value: unknown): RagQueryInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RagValidationError('request body must be an object with query');
  }

  const raw = value as Record<string, unknown>;
  if (typeof raw.query !== 'string' || raw.query.trim().length === 0) {
    throw new RagValidationError('query must be a non-empty string');
  }
  if (raw.query.length > 2000) {
    throw new RagValidationError('query must not exceed 2000 characters');
  }

  const topK = raw.top_k;
  if (topK !== undefined && (
    typeof topK !== 'number'
    || !Number.isInteger(topK)
    || topK < 1
    || topK > 20
  )) {
    throw new RagValidationError('top_k must be an integer between 1 and 20');
  }

  if (raw.conversation_id !== undefined && typeof raw.conversation_id !== 'string') {
    throw new RagValidationError('conversation_id must be a string');
  }
  if (raw.include_debug !== undefined && typeof raw.include_debug !== 'boolean') {
    throw new RagValidationError('include_debug must be a boolean');
  }

  return {
    query: raw.query.trim(),
    filters: validateFilters(raw.filters),
    ...(raw.conversation_id ? { conversation_id: raw.conversation_id } : {}),
    ...(topK ? { top_k: topK } : {}),
    ...(raw.include_debug !== undefined ? { include_debug: raw.include_debug } : {}),
  };
}
