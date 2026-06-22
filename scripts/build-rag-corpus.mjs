import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (!process.env.AI_PMO_KB_PATH) {
  throw new Error('Set AI_PMO_KB_PATH to the AI-PMO-SYS Vault before rebuilding the corpus.');
}

const vaultPath = resolve(process.env.AI_PMO_KB_PATH);
const outputPath = resolve('src/features/rag/corpus.snapshot.json');

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === '99-归档') return [];
      return markdownFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const body = trimmed.slice(1, -1).trim();
    return body ? body.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')) : [];
  }
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseMarkdown(path) {
  const text = readFileSync(path, 'utf8');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return null;

  const frontmatter = {};
  for (const line of text.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1 || line.startsWith(' ')) continue;
    frontmatter[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1));
  }

  if (!/^KB-\d{4,}$/.test(frontmatter.id || '')) return null;
  if (!['reviewed', 'published'].includes(frontmatter.status)) return null;
  if (frontmatter.confidentiality === 'restricted') return null;

  const fullBody = text.slice(end + 5).trim();
  const timelineStart = fullBody.search(/\n---\n\s*## 证据时间线/u);
  const body = (timelineStart === -1 ? fullBody : fullBody.slice(0, timelineStart)).trim();
  const array = key => Array.isArray(frontmatter[key])
    ? frontmatter[key]
    : frontmatter[key] ? [frontmatter[key]] : [];

  return {
    page_id: frontmatter.id,
    title: frontmatter.title || frontmatter.id,
    type: frontmatter.type || 'concept',
    status: frontmatter.status,
    authority: frontmatter.authority || 'curated',
    confidentiality: frontmatter.confidentiality || 'internal',
    domains: array('domains'),
    aliases: array('aliases'),
    tags: array('tags'),
    source_refs: array('source_refs'),
    content: body,
  };
}

const documents = markdownFiles(vaultPath)
  .map(parseMarkdown)
  .filter(Boolean)
  .sort((a, b) => a.page_id.localeCompare(b.page_id));

if (documents.length === 0) {
  throw new Error(`No reviewed KB pages found under ${vaultPath}`);
}

const newestMtime = markdownFiles(vaultPath)
  .map(path => statSync(path).mtimeMs)
  .reduce((max, value) => Math.max(max, value), 0);
const generatedAt = new Date(newestMtime).toISOString();
const snapshot = {
  schema_version: '1.0',
  index_version: `${generatedAt.slice(0, 10)}.${documents.length}`,
  generated_at: generatedAt,
  documents,
};

writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, documents: documents.length, index_version: snapshot.index_version }));
