import { describe, expect, it } from 'vitest';
import {
  PROJECT_STATUSES,
  STATUS_BOARD_TITLE,
  STATUS_LABEL,
  STATUS_LEGEND,
  normalizeStatus,
  resolveDisplayStatus,
  statusBgVar,
  statusBoardColorVar,
  statusColorVar,
  statusLabel,
} from './projectStatuses';

describe('projectStatuses', () => {
  it('describes every status in each lookup table', () => {
    expect(PROJECT_STATUSES).toEqual(['new', 'design', 'production', 'done']);
    for (const status of PROJECT_STATUSES) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_BOARD_TITLE[status]).toBeTruthy();
    }
    expect(STATUS_LEGEND.map(entry => entry.status)).toEqual(PROJECT_STATUSES);
  });

  it('falls back to new for unknown or legacy values', () => {
    expect(normalizeStatus('design')).toBe('design');
    expect(normalizeStatus(undefined)).toBe('new');
    expect(normalizeStatus('Zrealizowane')).toBe('new');
    expect(statusLabel('whatever')).toBe('Nowy');
  });

  it('shows legacy completed values as done', () => {
    expect(resolveDisplayStatus('Zrealizowane')).toBe('done');
    expect(resolveDisplayStatus('Zakończone')).toBe('done');
    expect(resolveDisplayStatus('production')).toBe('production');
    expect(resolveDisplayStatus(null)).toBe('new');
  });

  it('returns CSS custom properties instead of hard-coded colours', () => {
    expect(statusColorVar('done')).toBe('var(--status-done-color)');
    expect(statusBgVar('bogus')).toBe('var(--status-new-bg)');
    expect(statusBoardColorVar('design')).toBe('var(--status-design-board-color)');
  });
});
