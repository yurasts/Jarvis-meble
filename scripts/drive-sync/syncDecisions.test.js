// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shouldTransferByHash, syncEntryKey } from './syncDecisions.js';

describe('drive sync SHA-256 loop prevention', () => {
  it('skips an upload or download when both hashes match', () => {
    const hash = 'a'.repeat(64);
    expect(shouldTransferByHash(hash, hash)).toBe(false);
    expect(shouldTransferByHash(hash.toUpperCase(), hash)).toBe(false);
  });

  it('transfers new or changed content', () => {
    expect(shouldTransferByHash('a'.repeat(64), 'b'.repeat(64))).toBe(true);
    expect(shouldTransferByHash(null, 'b'.repeat(64))).toBe(true);
  });

  it('builds the same identity key from database and local shapes', () => {
    expect(syncEntryKey({ project_id: 7, category: 'projekt', relative_path: 'a/b.pdf' }))
      .toBe(syncEntryKey({ projectId: 7, category: 'projekt', relativePath: 'a/b.pdf' }));
  });
});
