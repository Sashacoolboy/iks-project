import { createHash } from 'node:crypto';

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function buildCatalogVersion({ files }) {
  const hashes = {};
  for (const [name, content] of Object.entries(files))
    hashes[name] = { sha256: sha256(content), bytes: Buffer.byteLength(content) };
  return { generated_at: new Date().toISOString(), hashes };
}
