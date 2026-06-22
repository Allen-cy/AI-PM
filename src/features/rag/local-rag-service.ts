import type {
  Confidentiality,
  RagCitation,
  RagDocument,
  RagQueryInput,
  RagQueryResult,
  RagService,
} from './types.ts';

const confidentialityRank: Record<Confidentiality, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

interface RankedDocument {
  document: RagDocument;
  score: number;
  coverage: number;
  excerpt: string;
}

interface LocalRagOptions {
  documents: RagDocument[];
  indexVersion: string;
  generatedAt?: string;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokens(value: string): string[] {
  const normalized = normalize(value);
  const result = new Set<string>();

  for (const match of normalized.matchAll(/[a-z0-9]+/g)) {
    if (match[0].length > 1) result.add(match[0]);
  }
  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const sequence = match[0];
    if (sequence.length <= 6) result.add(sequence);
    for (let index = 0; index < sequence.length - 1; index += 1) {
      result.add(sequence.slice(index, index + 2));
    }
  }

  return [...result];
}

function scoreText(queryTokens: string[], text: string, weight: number): { score: number; matched: Set<string> } {
  const haystack = normalize(text);
  const matched = new Set<string>();
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      matched.add(token);
      score += weight;
    }
  }
  return { score, matched };
}

function selectExcerpt(document: RagDocument, queryTokens: string[]): string {
  const candidates = document.content
    .split(/(?<=[。！？])|\n+/u)
    .map(item => item.trim())
    .filter(item => item.length >= 12);

  const best = candidates
    .map(text => ({ text, hits: queryTokens.filter(token => normalize(text).includes(token)).length }))
    .sort((a, b) => b.hits - a.hits || b.text.length - a.text.length)[0]?.text
    ?? document.content;

  return best.length > 220 ? `${best.slice(0, 217)}...` : best;
}

function rankDocuments(documents: RagDocument[], query: string): RankedDocument[] {
  const queryTokens = tokens(query);
  const normalizedQuery = normalize(query);

  return documents
    .map(document => {
      const matches = new Set<string>();
      let score = 0;
      const fields: Array<[string, number]> = [
        [document.title, 8],
        [document.aliases.join(' '), 6],
        [document.domains.join(' '), 5],
        [document.tags.join(' '), 3],
        [document.content, 1],
      ];

      for (const [text, weight] of fields) {
        const result = scoreText(queryTokens, text, weight);
        score += result.score;
        result.matched.forEach(token => matches.add(token));
      }

      const searchable = normalize(`${document.title} ${document.aliases.join(' ')} ${document.content}`);
      if (normalizedQuery.length >= 2 && searchable.includes(normalizedQuery)) score += 15;
      const coverage = queryTokens.length === 0 ? 0 : matches.size / queryTokens.length;
      score *= 0.7 + coverage;

      return {
        document,
        score,
        coverage,
        excerpt: selectExcerpt(document, queryTokens),
      };
    })
    .filter(item => item.score >= 1.5 && item.coverage > 0)
    .sort((a, b) => b.score - a.score || a.document.page_id.localeCompare(b.document.page_id));
}

function requiresLiveData(query: string): boolean {
  const timeSensitive = /(当前|现在|实时|今天|本周|下周|逾期|正在执行|所有项目)/u.test(query);
  const operational = /(项目|任务|风险|问题|里程碑|回款|成本|资源)/u.test(query);
  return timeSensitive && operational;
}

function citation(item: RankedDocument): RagCitation {
  return {
    source_id: item.document.source_refs[0] ?? null,
    source_ids: item.document.source_refs,
    page_id: item.document.page_id,
    document: item.document.title,
    locator: `page=${item.document.page_id}`,
    excerpt: item.excerpt,
    authority: item.document.authority,
    confidentiality: item.document.confidentiality,
    relevance: Math.min(0.99, Number((0.55 + item.coverage * 0.35).toFixed(2))),
  };
}

function response(
  indexVersion: string,
  answerStatus: RagQueryResult['answer_status'],
  answer: string,
  citations: RagCitation[],
  confidence: number,
): RagQueryResult {
  return {
    answer,
    answer_status: answerStatus,
    confidence,
    citations,
    retrieval: {
      mode: 'keyword',
      provider: 'local-corpus',
      index_version: indexVersion,
      result_count: citations.length,
    },
    trace_id: crypto.randomUUID(),
    schema_version: '1.0',
  };
}

export function createLocalRagService(options: LocalRagOptions): RagService {
  const documents = options.documents.map(document => ({ ...document }));
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  return {
    query(input: RagQueryInput): RagQueryResult {
      if (requiresLiveData(input.query)) {
        return response(
          options.indexVersion,
          'insufficient_evidence',
          '这个问题需要飞书中的实时项目、任务或业财数据。当前知识库只包含已审方法论，未连接实时业务数据，因此不能给出项目清单。',
          [],
          0,
        );
      }

      const allowedStatuses = new Set(input.filters?.status ?? ['reviewed', 'published']);
      const domainFilter = input.filters?.domains ?? [];
      const maxConfidentiality = input.filters?.confidentiality_max ?? 'internal';
      const scoped = documents.filter(document => (
        allowedStatuses.has(document.status)
        && (domainFilter.length === 0 || domainFilter.some(domain => document.domains.includes(domain)))
      ));
      const permitted = scoped.filter(document => (
        confidentialityRank[document.confidentiality] <= confidentialityRank[maxConfidentiality]
      ));

      const rankedPermitted = rankDocuments(permitted, input.query);
      const topK = input.top_k ?? 5;
      const top = rankedPermitted.slice(0, topK);

      if (top.length === 0) {
        const blockedByPermission = rankDocuments(scoped, input.query).length > 0;
        if (blockedByPermission) {
          return response(
            options.indexVersion,
            'forbidden',
            '存在相关知识，但其密级超出当前查询权限，未将内容加入检索上下文。',
            [],
            0,
          );
        }
        return response(
          options.indexVersion,
          'insufficient_evidence',
          '当前已审知识中没有足够证据回答这个问题。请补充项目背景，或先摄入并审核相关来源。',
          [],
          0,
        );
      }

      const citations = top.map(citation);
      const answerLines = citations.map(item => `- ${item.document}：${item.excerpt} [${item.page_id}]`);
      const confidence = Math.min(0.95, Number((0.55 + top[0].coverage * 0.35).toFixed(2)));
      return response(
        options.indexVersion,
        'answered',
        `根据当前已审知识，相关结论如下：\n\n${answerLines.join('\n')}`,
        citations,
        confidence,
      );
    },

    health() {
      return {
        status: documents.length > 0 ? 'ok' : 'degraded',
        provider: 'local-corpus',
        index_version: options.indexVersion,
        page_count: documents.length,
        chunk_count: documents.length,
        embedded_chunk_count: 0,
        retrieval_mode: 'keyword',
        generated_at: generatedAt,
      };
    },
  };
}
