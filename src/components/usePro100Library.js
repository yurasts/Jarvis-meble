import { useCallback, useEffect, useRef, useState } from 'react';
import pro100LibraryRepository from '../data/pro100LibraryRepository';
import { downloadBlob } from '../utils/downloadBlob';
import {
  pro100MetadataFromForm,
  validatePro100File,
  validatePro100Form,
} from '../utils/pro100Library';

const LOAD_ERROR = 'Nie udało się załadować biblioteki PRO100. Spróbuj ponownie.';

const operationErrorMessage = (error) => {
  switch (error?.stage) {
    case 'create-upload': return 'Nie udało się wysłać pliku. Spróbuj ponownie.';
    case 'create-save': return 'Nie udało się zapisać pliku w bibliotece.';
    case 'metadata-save': return 'Nie udało się zapisać zmian.';
    case 'replace-upload': return 'Nie udało się wysłać nowej wersji pliku.';
    case 'replace-save': return 'Nie udało się zapisać nowej wersji pliku.';
    case 'delete': return 'Nie udało się usunąć pliku.';
    case 'download': return 'Nie udało się pobrać pliku.';
    default: return 'Nie udało się wykonać operacji. Spróbuj ponownie.';
  }
};

const usePro100Library = ({ repository = pro100LibraryRepository } = {}) => {
  const [categories, setCategories] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const loadRequestRef = useRef(0);

  const runMutation = useCallback(async (operation, onSuccess) => {
    setActionBusy(true);
    setActionError('');
    try {
      const result = await operation();
      onSuccess(result);
      return true;
    } catch (error) {
      console.error(error);
      setActionError(operationErrorMessage(error));
      return false;
    } finally {
      setActionBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const requestId = ++loadRequestRef.current;
    repository.load()
      .then(result => {
        if (!active || loadRequestRef.current !== requestId) return;
        setCategories(result.categories);
        setFiles(result.files);
        setLoading(false);
      })
      .catch(error => {
        console.error(error);
        if (!active || loadRequestRef.current !== requestId) return;
        setLoadError(LOAD_ERROR);
        setLoading(false);
      });
    return () => { active = false; };
  }, [repository]);

  const reload = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await repository.load();
      if (loadRequestRef.current !== requestId) return false;
      setCategories(result.categories);
      setFiles(result.files);
      setLoading(false);
      return true;
    } catch (error) {
      console.error(error);
      if (loadRequestRef.current === requestId) {
        setLoadError(LOAD_ERROR);
        setLoading(false);
      }
      return false;
    }
  }, [repository]);

  const saveFile = useCallback(async ({ mode, form, selectedFile, editingFile }) => {
    const formError = validatePro100Form(form);
    if (formError) {
      setActionError(formError);
      return false;
    }
    if (mode === 'create') {
      const fileError = validatePro100File(selectedFile);
      if (fileError) {
        setActionError(fileError);
        return false;
      }
    }

    const metadata = pro100MetadataFromForm(form);
    return runMutation(
      () => mode === 'create'
        ? repository.create({ file: selectedFile, metadata })
        : repository.updateMetadata(editingFile.id, metadata),
      savedFile => {
        if (mode === 'create') {
          setFiles(current => [savedFile, ...current]);
          setNotice('Plik został dodany do biblioteki.');
        } else {
          setFiles(current => current.map(file => file.id === savedFile.id ? savedFile : file));
          setNotice('Opis pliku został zaktualizowany.');
        }
      },
    );
  }, [repository, runMutation]);

  const replaceFile = useCallback(async (currentFile, nextFile) => {
    const validation = validatePro100File(nextFile);
    if (validation) {
      setActionError(validation);
      return false;
    }
    return runMutation(
      () => repository.replace(currentFile, nextFile),
      savedFile => {
        setFiles(current => current.map(file => file.id === savedFile.id ? savedFile : file));
        setNotice('Plik został zastąpiony nową wersją.');
      },
    );
  }, [repository, runMutation]);

  const deleteFile = useCallback(async (file) => {
    return runMutation(
      () => repository.remove(file),
      () => {
        setFiles(current => current.filter(item => item.id !== file.id));
        setNotice('Plik został usunięty z biblioteki.');
      },
    );
  }, [repository, runMutation]);

  const downloadFile = useCallback(async (file) => {
    setNotice('');
    setActionError('');
    try {
      const blob = await repository.download(file.storage_path);
      downloadBlob(blob, file.original_filename || 'projekt.sto');
      return true;
    } catch (error) {
      console.error(error);
      setActionError(operationErrorMessage(error));
      return false;
    }
  }, [repository]);

  return {
    categories,
    files,
    loading,
    loadError,
    actionBusy,
    actionError,
    notice,
    reload,
    saveFile,
    replaceFile,
    deleteFile,
    downloadFile,
    clearActionError: () => setActionError(''),
  };
};

export default usePro100Library;
