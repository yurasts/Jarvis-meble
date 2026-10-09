export const isProjectImage = type => Boolean(type?.startsWith('image/'));
export const isProjectPdf = type => type === 'application/pdf';
export const shortenProjectFilename = (name, max = 12) => {
  if (!name) return '';
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
};
