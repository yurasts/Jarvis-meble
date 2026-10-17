export const createStorageBucket = (client, bucketName, logger = console) => {
  const bucket = () => client.storage.from(bucketName);
  return {
    upload: (path, file, options) => bucket().upload(path, file, options),
    getPublicUrl: path => bucket().getPublicUrl(path),
    download: path => bucket().download(path),
    async remove(path) {
      if (!path) return null;
      const { error } = await bucket().remove([path]);
      if (error) logger.error(error);
      return error || null;
    },
    // Пакетное удаление (корзина Supabase принимает массив путей). Ошибка логируется и
    // возвращается — удаление файлов из хранилища всегда «best effort».
    async removeMany(paths, chunkSize = 100) {
      const unique = [...new Set((paths || []).filter(Boolean))];
      let firstError = null;
      for (let index = 0; index < unique.length; index += chunkSize) {
        const { error } = await bucket().remove(unique.slice(index, index + chunkSize));
        if (error) {
          logger.error(error);
          firstError = firstError || error;
        }
      }
      return firstError;
    },
  };
};
