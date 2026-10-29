import { describe, expect, it } from 'vitest';
import {
  formatProjectFileDate,
  formatProjectFileSize,
  projectFileDisplayLabel,
} from './projectFileMetadata';

describe('project file metadata', () => {
  const file = {
    file_name: 'kuchnia.sto',
    size_bytes: 2.4 * 1024 * 1024,
    uploaded_at: '2026-10-27T19:20:00+01:00',
  };

  it('formats persisted bytes and the Warsaw timestamp in one label', () => {
    expect(formatProjectFileSize(file)).toBe('2.4 MB');
    expect(formatProjectFileDate(file)).toBe('27.10.2026, 19:20');
    expect(projectFileDisplayLabel(file)).toBe('kuchnia.sto · 2.4 MB · 27.10.2026, 19:20');
  });

  it('supports File-style size and compact dates, omitting missing metadata', () => {
    expect(projectFileDisplayLabel({
      file_name: 'front.jpg',
      size: 1536,
      created_at: '2026-10-27T19:20:00+01:00',
    }, { includeYear: false })).toBe('front.jpg · 1.5 KB · 27.10, 19:20');
    expect(projectFileDisplayLabel({ file_name: 'legacy.pdf' })).toBe('legacy.pdf');
  });
});
