import { useCallback, useEffect, useRef, useState } from 'react';
import projectFilesRepository from '../data/projectFilesRepository';
import { downloadBlob } from '../utils/downloadBlob';

const FILE_ACTION_ERROR = 'Nie udało się wykonać operacji na pliku. Spróbuj ponownie.';
const DELETE_ERROR = 'Nie udało się usunąć pliku. Spróbuj ponownie.';
const STO_SAVE_ERROR = 'Nie udało się zapisać pliku .sto. Spróbuj ponownie.';
const STO_DOWNLOAD_ERROR = 'Nie udało się pobrać pliku .sto.';

const useProjectFiles = ({
  clientId,
  currentProfile,
  coverUrl,
  onCoverChange,
  repository = projectFilesRepository,
}) => {
  const [resource, setResource] = useState({ clientId: null, files: [] });
  const [uploadingClientId, setUploadingClientId] = useState(null);
  const [deleteOperation, setDeleteOperation] = useState(null);
  const [fileActionIssue, setFileActionIssue] = useState({ clientId: null, message: '' });
  const [coverOperation, setCoverOperation] = useState(null);
  const [replacingStoClientId, setReplacingStoClientId] = useState(null);
  const [downloadingStoClientId, setDownloadingStoClientId] = useState(null);
  const [stoIssue, setStoIssue] = useState({ clientId: null, message: '' });
  const activeClientRef = useRef(clientId);
  const mutationVersionRef = useRef(0);

  useEffect(() => {
    activeClientRef.current = clientId;
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    const loadVersion = mutationVersionRef.current;
    repository.list(clientId)
      .then(files => {
        if (!cancelled && mutationVersionRef.current === loadVersion) {
          setResource({ clientId, files });
        }
      })
      .catch(error => {
        console.error(error);
        if (!cancelled && mutationVersionRef.current === loadVersion) {
          setResource({ clientId, files: [] });
          setFileActionIssue({ clientId, message: FILE_ACTION_ERROR });
        }
      });
    return () => { cancelled = true; };
  }, [clientId, repository]);

  const files = resource.clientId === clientId ? resource.files : [];
  const loading = resource.clientId !== clientId;
  const uploading = uploadingClientId === clientId;
  const deletingFileId = deleteOperation?.clientId === clientId ? deleteOperation.fileId : null;
  const fileActionError = fileActionIssue.clientId === clientId ? fileActionIssue.message : '';
  const settingCover = coverOperation?.clientId === clientId ? coverOperation.fileId : false;
  const replacingSto = replacingStoClientId === clientId;
  const downloadingSto = downloadingStoClientId === clientId;
  const stoError = stoIssue.clientId === clientId ? stoIssue.message : '';

  const updateCurrentFiles = useCallback((updater, operationClientId = clientId) => {
    if (activeClientRef.current !== operationClientId) return;
    mutationVersionRef.current += 1;
    setResource(current => {
      const currentFiles = current.clientId === operationClientId ? current.files : [];
      return { clientId: operationClientId, files: updater(currentFiles) };
    });
  }, [clientId]);

  const uploadFiles = useCallback(async (selectedFiles, category) => {
    if (!selectedFiles?.length) return;
    const operationClientId = clientId;
    setUploadingClientId(operationClientId);
    setFileActionIssue({ clientId: operationClientId, message: '' });
    const uploaded = [];
    let failed = false;

    for (const file of selectedFiles) {
      try {
        uploaded.push(await repository.upload({
          clientId: operationClientId,
          category,
          file,
          profile: currentProfile,
        }));
      } catch (error) {
        failed = true;
        console.error(error);
      }
    }

    if (uploaded.length > 0) {
      updateCurrentFiles(current => [...uploaded.reverse(), ...current], operationClientId);
    }
    setUploadingClientId(current => current === operationClientId ? null : current);
    if (failed && activeClientRef.current === operationClientId) {
      setFileActionIssue({ clientId: operationClientId, message: FILE_ACTION_ERROR });
    }
  }, [clientId, currentProfile, repository, updateCurrentFiles]);

  const replaceSto = useCallback(async (file, currentFile) => {
    if (!/\.sto$/i.test(file?.name || '')) {
      setStoIssue({ clientId, message: 'Wybierz plik z rozszerzeniem .sto.' });
      return false;
    }
    const operationClientId = clientId;
    setReplacingStoClientId(operationClientId);
    setStoIssue({ clientId: operationClientId, message: '' });
    try {
      const savedFile = await repository.replaceSto({
        clientId: operationClientId,
        file,
        profile: currentProfile,
        currentFile,
      });
      updateCurrentFiles(
        current => [savedFile, ...current.filter(item => item.id !== savedFile.id)],
        operationClientId,
      );
      return true;
    } catch (error) {
      console.error(error);
      if (activeClientRef.current === operationClientId) {
        setStoIssue({ clientId: operationClientId, message: STO_SAVE_ERROR });
      }
      return false;
    } finally {
      setReplacingStoClientId(current => current === operationClientId ? null : current);
    }
  }, [clientId, currentProfile, repository, updateCurrentFiles]);

  const removeFile = useCallback(async (file) => {
    if (deletingFileId !== null) return false;
    const operationClientId = clientId;
    const operation = { clientId: operationClientId, fileId: file.id };
    setDeleteOperation(operation);
    setFileActionIssue({ clientId: operationClientId, message: '' });
    try {
      const clearCover = file.file_url === coverUrl;
      await repository.remove({ clientId: operationClientId, file, clearCover });
      updateCurrentFiles(current => current.filter(item => item.id !== file.id), operationClientId);
      if (clearCover) onCoverChange?.(null);
      return true;
    } catch (error) {
      console.error(error);
      if (activeClientRef.current === operationClientId) {
        setFileActionIssue({ clientId: operationClientId, message: DELETE_ERROR });
      }
      return false;
    } finally {
      setDeleteOperation(current => current === operation ? null : current);
    }
  }, [clientId, coverUrl, deletingFileId, onCoverChange, repository, updateCurrentFiles]);

  const updateComment = useCallback(async (file, comment) => {
    const operationClientId = clientId;
    setFileActionIssue({ clientId: operationClientId, message: '' });
    try {
      await repository.updateComment(file.id, comment);
      updateCurrentFiles(
        current => current.map(item => item.id === file.id ? { ...item, comment } : item),
        operationClientId,
      );
      return true;
    } catch (error) {
      console.error(error);
      if (activeClientRef.current === operationClientId) {
        setFileActionIssue({ clientId: operationClientId, message: FILE_ACTION_ERROR });
      }
      return false;
    }
  }, [clientId, repository, updateCurrentFiles]);

  const toggleCover = useCallback(async (file) => {
    const operationClientId = clientId;
    const nextCoverUrl = coverUrl === file.file_url ? null : file.file_url;
    const operation = { clientId: operationClientId, fileId: file.id };
    setCoverOperation(operation);
    setFileActionIssue({ clientId: operationClientId, message: '' });
    try {
      await repository.updateCover(operationClientId, nextCoverUrl);
      if (activeClientRef.current === operationClientId) onCoverChange?.(nextCoverUrl);
      return true;
    } catch (error) {
      console.error(error);
      if (activeClientRef.current === operationClientId) {
        setFileActionIssue({ clientId: operationClientId, message: FILE_ACTION_ERROR });
      }
      return false;
    } finally {
      setCoverOperation(current => current === operation ? null : current);
    }
  }, [clientId, coverUrl, onCoverChange, repository]);

  const downloadSto = useCallback(async (file) => {
    if (!file || downloadingSto) return false;
    const operationClientId = clientId;
    setDownloadingStoClientId(operationClientId);
    setStoIssue({ clientId: operationClientId, message: '' });
    try {
      const blob = await repository.download(file.file_path);
      downloadBlob(blob, file.file_name || 'projekt.sto');
      return true;
    } catch (error) {
      console.error(error);
      if (activeClientRef.current === operationClientId) {
        setStoIssue({ clientId: operationClientId, message: STO_DOWNLOAD_ERROR });
      }
      return false;
    } finally {
      setDownloadingStoClientId(current => current === operationClientId ? null : current);
    }
  }, [clientId, downloadingSto, repository]);

  return {
    files,
    loading,
    uploading,
    deletingFileId,
    fileActionError,
    clearFileActionError: () => setFileActionIssue({ clientId, message: '' }),
    settingCover,
    replacingSto,
    downloadingSto,
    stoError,
    uploadFiles,
    replaceSto,
    removeFile,
    updateComment,
    toggleCover,
    downloadSto,
  };
};

export default useProjectFiles;
