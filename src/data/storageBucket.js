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
  };
};
