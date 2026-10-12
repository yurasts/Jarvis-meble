import { useCallback, useEffect, useRef, useState } from 'react';
import projectCashTransactionsRepository from '../data/projectCashTransactionsRepository';

const useCashTransactions = ({
  scopeKey,
  projectScope,
  repository = projectCashTransactionsRepository,
}) => {
  const [resource, setResource] = useState({
    scopeKey: null,
    transactions: [],
    status: 'loading',
  });
  const activeScopeRef = useRef(scopeKey);
  const loadRequestRef = useRef(0);
  const mutationVersionRef = useRef(0);

  useEffect(() => {
    activeScopeRef.current = scopeKey;
  }, [scopeKey]);

  const retry = useCallback(async () => {
    if (!scopeKey) return false;
    const requestId = ++loadRequestRef.current;
    const mutationVersion = mutationVersionRef.current;
    setResource(current => ({
      scopeKey,
      transactions: current.scopeKey === scopeKey ? current.transactions : [],
      status: 'loading',
    }));

    try {
      const transactions = await repository.list(projectScope);
      if (activeScopeRef.current !== scopeKey || loadRequestRef.current !== requestId
        || mutationVersionRef.current !== mutationVersion) return false;
      setResource({ scopeKey, transactions, status: 'ready' });
      return true;
    } catch {
      if (activeScopeRef.current === scopeKey && loadRequestRef.current === requestId
        && mutationVersionRef.current === mutationVersion) {
        setResource({ scopeKey, transactions: [], status: 'error' });
      }
      return false;
    }
  }, [projectScope, repository, scopeKey]);

  useEffect(() => {
    if (!scopeKey) return undefined;
    let active = true;
    const requestId = ++loadRequestRef.current;
    const mutationVersion = mutationVersionRef.current;
    repository.list(projectScope)
      .then(transactions => {
        if (!active || loadRequestRef.current !== requestId
          || mutationVersionRef.current !== mutationVersion) return;
        setResource({ scopeKey, transactions, status: 'ready' });
      })
      .catch(() => {
        if (!active || loadRequestRef.current !== requestId
          || mutationVersionRef.current !== mutationVersion) return;
        setResource({ scopeKey, transactions: [], status: 'error' });
      });
    return () => { active = false; };
  }, [projectScope, repository, scopeKey]);

  const updateCurrent = useCallback((operationScope, update) => {
    if (activeScopeRef.current !== operationScope) return;
    mutationVersionRef.current += 1;
    setResource(current => ({
      scopeKey: operationScope,
      transactions: update(current.scopeKey === operationScope ? current.transactions : []),
      status: 'ready',
    }));
  }, []);

  const save = useCallback(async (projectId, draft) => {
    const operationScope = scopeKey;
    try {
      const saved = await repository.save(projectId, draft);
      updateCurrent(operationScope, current => draft.id
        ? current.map(transaction => transaction.id === saved.id ? saved : transaction)
        : [saved, ...current]);
      return { error: null };
    } catch (error) {
      return { error };
    }
  }, [repository, scopeKey, updateCurrent]);

  const remove = useCallback(async (id) => {
    const operationScope = scopeKey;
    try {
      await repository.remove(id);
      updateCurrent(operationScope, current => current.filter(transaction => transaction.id !== id));
      return { error: null };
    } catch (error) {
      return { error };
    }
  }, [repository, scopeKey, updateCurrent]);

  const currentResource = resource.scopeKey === scopeKey;
  return {
    cashTransactions: currentResource ? resource.transactions : [],
    cashStatus: scopeKey && currentResource ? resource.status : 'loading',
    loadCashTransactions: retry,
    saveCashTransaction: save,
    deleteCashTransaction: remove,
  };
};

export default useCashTransactions;
