import { describe, expect, it } from 'vitest';
import {
  filterAndSortPro100Files,
  parsePro100Tags,
  pro100MetadataFromForm,
  validatePro100File,
  validatePro100Form,
} from './pro100Library';

describe('PRO100 library rules', () => {
  it('validates form fields and STO file constraints', () => {
    expect(validatePro100Form({ title: ' ', categoryId: 'cat' })).toContain('nazwę');
    expect(validatePro100Form({ title: 'Kitchen', categoryId: '' })).toContain('kategorię');
    expect(validatePro100File({ name: 'plan.pdf', size: 10 })).toContain('.sto');
    expect(validatePro100File({ name: 'plan.sto', size: 0 })).toContain('pusty');
    expect(validatePro100File({ name: 'plan.sto', size: 101 * 1024 * 1024 })).toContain('100 MB');
    expect(validatePro100File({ name: 'plan.STO', size: 128 })).toBe('');
  });

  it('normalizes metadata and limits tags', () => {
    const tags = Array.from({ length: 15 }, (_, index) => ` tag-${index} `).join(',');
    expect(parsePro100Tags(tags)).toHaveLength(12);
    expect(pro100MetadataFromForm({
      title: '  Kuchnia  ',
      clientName: ' ',
      categoryId: 'cat-1',
      description: '  Opis  ',
      tags: 'biała, narożna',
    })).toEqual({
      category_id: 'cat-1',
      title: 'Kuchnia',
      client_name: null,
      description: 'Opis',
      tags: ['biała', 'narożna'],
    });
  });

  it('searches without Polish diacritics and preserves global search semantics', () => {
    const categories = [
      { id: 'kitchen', name: 'Kuchnie' },
      { id: 'wardrobe', name: 'Szafy' },
    ];
    const files = [
      { id: '1', title: 'Biała kuchnia', category_id: 'kitchen', tags: ['narożna'], updated_at: '2026-02-01' },
      { id: '2', title: 'Dębowa szafa', category_id: 'wardrobe', tags: [], updated_at: '2026-01-01' },
    ];

    const result = filterAndSortPro100Files({
      files,
      categories,
      search: 'biala narozna',
      activeCategory: 'wardrobe',
      sortOrder: 'newest',
    });

    expect(result.map(file => file.id)).toEqual(['1']);
  });

  it('filters by category without search and applies the requested sort', () => {
    const files = [
      { id: '1', title: 'Zeta', category_id: 'cat', updated_at: '2026-02-01' },
      { id: '2', title: 'Alfa', category_id: 'cat', updated_at: '2026-01-01' },
      { id: '3', title: 'Other', category_id: 'other', updated_at: '2026-03-01' },
    ];
    const result = filterAndSortPro100Files({
      files,
      categories: [],
      search: '',
      activeCategory: 'cat',
      sortOrder: 'title',
    });

    expect(result.map(file => file.id)).toEqual(['2', '1']);
  });
});
