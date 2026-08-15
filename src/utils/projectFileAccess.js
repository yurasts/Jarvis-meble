import { supabase } from '../supabase';

const PROJECT_FILES_BUCKET = 'project-files';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const getProjectFileDisplayUrl = (file) =>
  file?.signed_url || file?.file_url || '';

export async function withProjectFileSignedUrls(files) {
  const source = Array.isArray(files) ? files : [];
  const paths = [...new Set(source.map(file => file?.file_path).filter(Boolean))];

  if (paths.length === 0) {
    return source.map(file => ({ ...file, signed_url: file?.file_url || '' }));
  }

  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Nie udało się utworzyć podpisanych adresów plików.', error);
    return source.map(file => ({ ...file, signed_url: file?.file_url || '' }));
  }

  const signedUrlByPath = new Map();
  for (const item of data || []) {
    if (item.path && item.signedUrl) signedUrlByPath.set(item.path, item.signedUrl);
    else if (item.error) console.error('Nie udało się podpisać jednego z plików projektu.', item.error);
  }

  return source.map(file => ({
    ...file,
    signed_url: signedUrlByPath.get(file.file_path) || file.file_url || '',
  }));
}
