export const PRO100_MAX_FILE_SIZE = 100 * 1024 * 1024;
export const EMPTY_PRO100_FORM = {
  title: '',
  clientName: '',
  categoryId: '',
  description: '',
  tags: '',
};

export const parsePro100Tags = (value) => String(value || '')
  .split(',')
  .map(tag => tag.trim())
  .filter(Boolean)
  .slice(0, 12);

export const validatePro100File = (file) => {
  if (!file || !file.name.toLowerCase().endsWith('.sto')) {
    return 'Wybierz plik PRO100 z rozszerzeniem .sto.';
  }
  if (file.size <= 0) return 'Wybrany plik jest pusty.';
  if (file.size > PRO100_MAX_FILE_SIZE) return 'Plik jest większy niż 100 MB.';
  return '';
};

export const validatePro100Form = (form) => {
  if (!form.title.trim()) return 'Podaj nazwę projektu.';
  if (!form.categoryId) return 'Wybierz kategorię.';
  return '';
};

export const pro100MetadataFromForm = (form) => ({
  category_id: form.categoryId,
  title: form.title.trim(),
  client_name: form.clientName.trim() || null,
  description: form.description.trim() || null,
  tags: parsePro100Tags(form.tags),
});

export const normalizePro100SearchValue = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ł/g, 'l')
  .replace(/Ł/g, 'L')
  .toLocaleLowerCase('pl-PL');

export const filterAndSortPro100Files = ({
  files,
  categories,
  search,
  activeCategory,
  sortOrder,
}) => {
  const categoryById = Object.fromEntries(categories.map(category => [category.id, category]));
  const searchTerms = normalizePro100SearchValue(search).trim().split(/\s+/).filter(Boolean);
  const filtered = files.filter(file => {
    const searchableTags = Array.isArray(file.tags)
      ? file.tags
      : String(file.tags || '').replace(/[{}"]/g, ' ').split(',');
    if (searchTerms.length === 0 && activeCategory !== 'all' && file.category_id !== activeCategory) {
      return false;
    }
    if (searchTerms.length === 0) return true;
    const searchableText = normalizePro100SearchValue([
      file.title,
      file.original_filename,
      file.client_name,
      categoryById[file.category_id]?.name,
      file.description,
      ...searchableTags,
    ].join(' '));
    return searchTerms.every(term => searchableText.includes(term));
  });

  return [...filtered].sort((first, second) => {
    if (sortOrder === 'oldest') return new Date(first.updated_at) - new Date(second.updated_at);
    if (sortOrder === 'title') return String(first.title).localeCompare(String(second.title), 'pl');
    return new Date(second.updated_at) - new Date(first.updated_at);
  });
};
