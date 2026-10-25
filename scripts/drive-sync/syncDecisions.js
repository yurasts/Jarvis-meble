export const shouldTransferByHash = (localHash, syncedHash) => (
  !localHash || !syncedHash || localHash.toLowerCase() !== syncedHash.toLowerCase()
);

export const syncEntryKey = ({ project_id: projectId, projectId: directProjectId, category, relative_path: relativePath, relativePath: directRelativePath }) => (
  `${projectId ?? directProjectId}:${category}:${relativePath ?? directRelativePath}`
);
