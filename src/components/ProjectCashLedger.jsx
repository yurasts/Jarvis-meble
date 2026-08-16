import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { transactionsForProject, sortCashDesc, summarizeCash, plannedWycena } from '../utils/cashLedger';
import { projectTotals } from './dashboardHelpers';
import s from './ProjectCashLedger.module.css';

const STATUS_COLOR = { new: '#e53e3e', design: '#dd6b20', production: '#d69e2e', done: '#38a169' };
const COMPLETED_STATUSES = new Set(['done', 'Zrealizowane', 'Zakończone']);

// getFullYear/getMonth/getDate — lokalna strefa czasowa. toISOString() konwertowałby na UTC, co
// koło północy w Polsce (UTC+1/+2) potrafi cofnąć datę o jeden dzień (review P2).
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const emptyDraft = () => ({ description: '', amount: '', occurred_on: todayISO() });
const isNewKey = (key) => typeof key === 'string' && key.startsWith('new-');
const directionFromNewKey = (key) => (key.startsWith('new-inflow-') ? 'inflow' : 'outflow');
// "+0.00 zł"/"−0.00 zł" wygląda jak błąd, nie jak "brak operacji tego typu" — znak dopisujemy
// tylko przy realnej (dodatniej) sumie, zero pokazujemy bez znaku.
const formatSigned = (value, sign) => (value > 0 ? `${sign}${value.toFixed(2)} zł` : `${value.toFixed(2)} zł`);
const formatCompactDate = (value) => {
  const [, month, day] = String(value || '').split('-');
  return month && day ? `${day}.${month}` : String(value || '');
};

// Карточка одного проекта — общая для MobileClientBalanceScreen (несколько карточек, N проектов
// клиента) и вкладки Rozliczenia mobile ProjectModal (одна карточка, activeClient). Один и тот же
// массив реальных денежных операций (project_cash_transactions), без копирования данных между
// экранами — вызывающий код передаёт единый transactions (App.jsx) и операции сохранения/удаления,
// сама карточка фильтрует по client.id (utils/cashLedger.js).
//
// editingKey/onEditingKeyChange — тот же контролируемый/неконтролируемый паттерн, что и
// FilesTab.expanded/onExpandedChange: MobileClientBalanceScreen лифтит editingKey (несколько
// карточек — глобально должен быть открыт только один редактор), Rozliczenia (одна карточка) не
// передаёт эти пропсы — компонент держит своё состояние сам.
//
// onDirtyChange репортит РЕАЛЬНУЮ грязь — сравнение draft с originalDraft (снимком на момент
// открытия редактора), а не сам факт "редактор открыт" (review P1: открытие без изменений не
// должно взводить dirty). Вызывается всегда, вне зависимости от controlled/uncontrolled режима.
//
// ref.saveActiveDraft() — императивный доступ к сохранению текущего открытого черновика извне
// (используется sticky-кнопкой Zapisz в MobileClientBalanceScreen и диалогом подтверждения смены
// таба в ProjectModal — оба живут вне этого компонента, а черновик не лифтится наружу).
const ProjectCashLedger = forwardRef(function ProjectCashLedger({
  client,
  transactions,
  onSaveTransaction,
  onDeleteTransaction,
  showProjectHeader = false,
  editingKey: editingKeyProp,
  onEditingKeyChange,
  onDirtyChange,
  status = 'ready',
  onRetry,
  desktopLayout = false,
}, ref) {
  const isControlled = editingKeyProp !== undefined;
  const [internalEditingKey, setInternalEditingKey] = useState(null);
  const editingKey = isControlled ? editingKeyProp : internalEditingKey;

  const setEditingKey = (key) => {
    if (isControlled) {
      onEditingKeyChange?.(key);
    } else {
      setInternalEditingKey(key);
    }
  };

  const [draft, setDraft] = useState(emptyDraft);
  const [originalDraft, setOriginalDraft] = useState(emptyDraft);
  const [editorError, setEditorError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // Próba otwarcia INNEJ operacji, gdy aktualna ma niezapisany draft (review P1 — dawniej openEdit/
  // openNew po prostu nadpisywały editingKey, cichо gubiąc draft A). Tylko dla trybu unmontrolled
  // (Rozliczenia, jedna karta) — w controlled (Bilans, wiele kart) tę samą ochronę robi rodzic
  // (MobileClientBalanceScreen.requestEditingKeyChange), bo tylko on widzi WSZYSTKIE karty naraz;
  // w tym trybie pendingSwitch nigdy się nie ustawia (patrz requestSwitch niżej).
  const [pendingSwitch, setPendingSwitch] = useState(null); // { key, setup } | null
  const [pendingSwitchError, setPendingSwitchError] = useState(false);
  const [pendingSwitchSaving, setPendingSwitchSaving] = useState(false);
  // Ostatni editingKeyProp, dla którego draft/originalDraft zostały już załadowane (controlled —
  // patrz efekt niżej). Zapobiega ponownemu (nadpisującemu) ładowaniu przy każdym renderze.
  const loadedControlledKeyRef = useRef(null);

  const isDraftDirty = editingKey !== null && (
    draft.description !== originalDraft.description ||
    draft.amount !== originalDraft.amount ||
    draft.occurred_on !== originalDraft.occurred_on
  );

  useEffect(() => {
    onDirtyChange?.(isDraftDirty);
  }, [isDraftDirty, onDirtyChange]);

  const projectId = client.id;
  const list = sortCashDesc(transactionsForProject(transactions, projectId));
  const { wplaty, wydatki, saldo } = summarizeCash(list);

  const { materials, services, total: totalCost } = projectTotals(client);
  const coef = Number(client.budget_coefficient) || 2;
  const wycena = plannedWycena(client, totalCost);

  const closeEditor = () => {
    setEditingKey(null);
    setDraft(emptyDraft());
    setOriginalDraft(emptyDraft());
    setEditorError(null);
  };

  const currentDirection = isNewKey(editingKey)
    ? directionFromNewKey(editingKey)
    : list.find((t) => t.id === editingKey)?.direction;

  const handleSave = async () => {
    const amountNum = parseFloat(String(draft.amount).replace(',', '.'));
    if (!draft.description.trim() || !(amountNum > 0) || !draft.occurred_on) {
      setEditorError('Wypełnij opis, kwotę i datę (kwota musi być dodatnia).');
      return { error: 'validation' };
    }
    setSaving(true);
    setEditorError(null);
    const payload = {
      ...(isNewKey(editingKey) ? {} : { id: editingKey }),
      direction: currentDirection,
      amount: amountNum,
      occurred_on: draft.occurred_on,
      description: draft.description.trim(),
    };
    try {
      const result = await onSaveTransaction(projectId, payload);
      if (result?.error) {
        setEditorError('Nie udało się zapisać. Spróbuj ponownie.');
        return { error: result.error };
      }
      closeEditor();
      return { error: null };
    } catch (error) {
      setEditorError('Błąd połączenia. Sprawdź internet i spróbuj ponownie.');
      return { error };
    } finally {
      setSaving(false);
    }
  };

  const computeInitialDraft = useCallback((key) => {
    if (isNewKey(key)) return emptyDraft();
    const t = list.find((tx) => tx.id === key);
    return { description: t?.description || '', amount: String(t?.amount ?? ''), occurred_on: t?.occurred_on || todayISO() };
  }, [list]);

  // Jedyne miejsce, które faktycznie zmienia editingKey na inny NIEPUSTY klucz (poza samym
  // zamknięciem). W trybie uncontrolled (Rozliczenia) karta sama pyta lokalnie, jeśli aktualny
  // draft jest dirty. W trybie controlled (Bilans) NIGDY nie woła setup() tutaj — draft dla nowego
  // klucza ładuje wyłącznie efekt niżej, reagujący na FAKTYCZNĄ zmianę editingKeyProp od rodzica.
  // Wcześniejsza wersja wołała setup() od razu również w controlled (bo lokalny warunek sprawdzał
  // tylko !isControlled) — to nadpisywało aktywny, niezapisany draft A wartościami B natychmiast,
  // ZANIM rodzic (MobileClientBalanceScreen) zdążył pokazać/rozstrzygnąć własne potwierdzenie
  // (review P1: "Target setup przepisuje aktywny draft przed potwierdzeniem").
  const requestSwitch = (key, setup) => {
    if (isControlled) {
      onEditingKeyChange?.(key);
      return;
    }
    if (editingKey !== null && isDraftDirty && key !== editingKey) {
      setPendingSwitch({ key, setup });
      return;
    }
    setup();
    setEditingKey(key);
  };

  const openNew = (direction) => {
    const key = `new-${direction}-${projectId}`;
    requestSwitch(key, () => {
      const initial = computeInitialDraft(key);
      setDraft(initial);
      setOriginalDraft(initial);
      setEditorError(null);
    });
  };

  const openEdit = (t) => {
    requestSwitch(t.id, () => {
      const initial = computeInitialDraft(t.id);
      setDraft(initial);
      setOriginalDraft(initial);
      setEditorError(null);
    });
  };

  // Controlled (Bilans): ładuje draft REAKTYWNIE, dopiero gdy editingKeyProp faktycznie się zmieni
  // (czyli rodzic już rozstrzygnął — od razu albo po potwierdzeniu Odrzuć/Zapisz). To jedyne
  // miejsce, które w tym trybie w ogóle dotyka draft/originalDraft dla NOWEGO klucza — stąd żadne
  // kliknięcie w openEdit/openNew nie może już przedwcześnie nadpisać aktywnego draftu.
  useEffect(() => {
    if (!isControlled) return;
    if (editingKeyProp === loadedControlledKeyRef.current) return;
    loadedControlledKeyRef.current = editingKeyProp;
    if (editingKeyProp === null) return;
    const initial = computeInitialDraft(editingKeyProp);
    setDraft(initial);
    setOriginalDraft(initial);
    setEditorError(null);
  }, [isControlled, editingKeyProp, computeInitialDraft]);

  const cancelSwitch = () => { setPendingSwitch(null); setPendingSwitchError(false); };

  const discardSwitch = () => {
    const { key, setup } = pendingSwitch;
    setPendingSwitch(null);
    setPendingSwitchError(false);
    setup();
    setEditingKey(key);
  };

  const saveAndSwitch = async () => {
    setPendingSwitchSaving(true);
    setPendingSwitchError(false);
    const result = await handleSave();
    setPendingSwitchSaving(false);
    if (result?.error) { setPendingSwitchError(true); return; }
    const { key, setup } = pendingSwitch;
    setPendingSwitch(null);
    setup();
    setEditingKey(key);
  };

  // Императивный доступ извне (sticky Zapisz w Bilans, potwierdzenie zmiany taba w Rozliczenia) —
  // bez deps: metody muszą zawsze widzieć bieżący editingKey/draft, karta renderuje się rzadko.
  useImperativeHandle(ref, () => ({
    saveActiveDraft: () => (editingKey !== null ? handleSave() : Promise.resolve({ error: null })),
    hasActiveDraft: () => editingKey !== null,
  }));

  const handleDelete = async (id) => {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await onDeleteTransaction(id);
    setDeleting(false);
    if (error) { setDeleteError('Nie udało się usunąć. Spróbuj ponownie.'); return; }
    setConfirmDeleteId(null);
    if (editingKey === id) closeEditor();
  };

  const projectName = client.project_name || client.full_name || '—';
  const statusColor = COMPLETED_STATUSES.has(client.status) ? STATUS_COLOR.done : (STATUS_COLOR[client.status] || STATUS_COLOR.new);
  const formatDesktopMoney = (value) => Number(value || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatDesktopSigned = (value, sign) => (
    value > 0 ? `${sign}${formatDesktopMoney(value)} zł` : `${formatDesktopMoney(value)} zł`
  );
  const plannedMetrics = [
    { label: 'Materiały', value: `${desktopLayout ? formatDesktopMoney(materials) : materials.toFixed(2)} zł` },
    { label: 'Usługi', value: `${desktopLayout ? formatDesktopMoney(services) : services.toFixed(2)} zł` },
    { label: 'Współczynnik', value: `×${coef}` },
    { label: 'Wycena', value: `${desktopLayout ? formatDesktopMoney(wycena) : wycena.toFixed(2)} zł` },
  ];
  const desktopInflows = list.filter((transaction) => transaction.direction === 'inflow');
  const desktopOutflows = list.filter((transaction) => transaction.direction === 'outflow');
  const desktopPairCount = Math.max(desktopInflows.length, desktopOutflows.length);
  const desktopPairs = Array.from({ length: desktopPairCount }, (_, index) => ({
    inflow: desktopInflows[index] || null,
    outflow: desktopOutflows[index] || null,
  }));

  const compactSummary = (
    <div className={s.compactSummary}>
      <span className={s.compactInflow}>{formatSigned(wplaty, '+')}</span>
      <span className={s.compactOutflow}>{formatSigned(wydatki, '−')}</span>
      <span className={s.compactSaldo}>Saldo {saldo.toFixed(2)} zł</span>
    </div>
  );

  const renderEditorFields = () => (
    <div className={s.editor}>
      <div className={s.editorField}>
        <label className={s.editorLabel} htmlFor={`cash-desc-${editingKey}`}>Opis</label>
        <input
          id={`cash-desc-${editingKey}`}
          className={s.editorInput}
          type="text"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder={currentDirection === 'inflow' ? 'np. Zaliczka' : 'np. Materiały, transport'}
        />
      </div>
      <div className={s.editorField}>
        <label className={s.editorLabel} htmlFor={`cash-amount-${editingKey}`}>Kwota (zł)</label>
        <input
          id={`cash-amount-${editingKey}`}
          className={s.editorInput}
          type="number" min="0" step="0.01"
          value={draft.amount}
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
        />
      </div>
      <div className={s.editorField}>
        <label className={s.editorLabel} htmlFor={`cash-date-${editingKey}`}>Data</label>
        <input
          id={`cash-date-${editingKey}`}
          className={s.editorInput}
          type="date"
          value={draft.occurred_on}
          onChange={(e) => setDraft((d) => ({ ...d, occurred_on: e.target.value }))}
        />
      </div>
      {editorError && <div className={s.editorError}>{editorError}</div>}
      <div className={s.editorActions}>
        <button type="button" className={s.editorSave} disabled={saving} onClick={handleSave}>
          {saving ? 'Zapisywanie…' : 'Zapisz'}
        </button>
        <button type="button" className={s.editorCancel} onClick={closeEditor}>Anuluj</button>
      </div>
    </div>
  );

  const renderDesktopEditorFields = (transactionId = null) => (
    <div className={s.desktopInlineEditor}>
      <div className={s.desktopInlineFields}>
        <input
          className={`${s.desktopInlineInput} ${s.desktopDateInput}`}
          type="date"
          value={draft.occurred_on}
          onChange={(e) => setDraft((current) => ({ ...current, occurred_on: e.target.value }))}
          aria-label="Data operacji"
        />
        <input
          autoFocus
          className={`${s.desktopInlineInput} ${s.desktopDescriptionInput}`}
          type="text"
          value={draft.description}
          onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
          placeholder={currentDirection === 'inflow' ? 'Nazwa wpłaty' : 'Nazwa wydatku'}
          aria-label="Nazwa operacji"
        />
        <input
          className={`${s.desktopInlineInput} ${s.desktopAmountInput}`}
          type="number"
          min="0"
          step="0.01"
          value={draft.amount}
          onChange={(e) => setDraft((current) => ({ ...current, amount: e.target.value }))}
          placeholder="0.00"
          aria-label="Kwota operacji"
        />
        <button type="button" className={s.desktopInlineSave} disabled={saving} onClick={handleSave} aria-label="Zapisz operację">
          {saving ? '…' : '✓'}
        </button>
        <button type="button" className={s.desktopInlineCancel} disabled={saving} onClick={closeEditor} aria-label="Anuluj edycję">×</button>
        {transactionId && (
          <button
            type="button"
            className={s.desktopInlineDelete}
            disabled={saving}
            onClick={() => { setConfirmDeleteId(transactionId); setDeleteError(null); }}
          >
            Usuń
          </button>
        )}
      </div>
      {editorError && <div className={s.desktopEditorError}>{editorError}</div>}
    </div>
  );

  const renderDesktopTransaction = (transaction) => {
    if (!transaction) return <div className={s.desktopEmptyCell} aria-hidden="true" />;
    if (confirmDeleteId === transaction.id) {
      return (
        <div className={s.desktopConfirmRow}>
          <span>Usunąć „{transaction.description}”?</span>
          {deleteError && <span className={s.deleteError}>{deleteError}</span>}
          <div className={s.desktopConfirmActions}>
            <button type="button" className={s.desktopConfirmDelete} disabled={deleting} onClick={() => handleDelete(transaction.id)}>
              {deleting ? 'Usuwanie…' : 'Tak'}
            </button>
            <button type="button" className={s.desktopConfirmCancel} disabled={deleting} onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}>Nie</button>
          </div>
        </div>
      );
    }
    if (editingKey === transaction.id) return renderDesktopEditorFields(transaction.id);
    return (
      <div
        className={s.desktopTransactionRow}
        role="button"
        tabIndex={0}
        onClick={() => openEdit(transaction)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openEdit(transaction);
          }
        }}
      >
        <span className={s.desktopTransactionDate}>{formatCompactDate(transaction.occurred_on)}</span>
        <span className={s.desktopTransactionName}>{transaction.description}</span>
        <span className={transaction.direction === 'inflow' ? s.desktopTransactionInflow : s.desktopTransactionOutflow}>
          {transaction.direction === 'inflow' ? '+' : '−'}{formatDesktopMoney(transaction.amount)} zł
        </span>
      </div>
    );
  };

  return (
    <div className={`${s.card} ${desktopLayout ? s.desktopCard : ''}`} style={{ position: 'relative' }}>
      {pendingSwitch && (
        <div className={s.switchOverlay}>
          <div className={s.switchBox}>
            <p className={s.switchText}>Masz niezapisaną operację. Co zrobić przed otwarciem innej?</p>
            {pendingSwitchError && <p className={s.deleteError}>Nie udało się zapisać operacji. Spróbuj ponownie.</p>}
            <div className={s.switchActions}>
              <button type="button" className={s.editorCancel} disabled={pendingSwitchSaving} onClick={cancelSwitch}>Anuluj</button>
              <button type="button" className={s.switchDiscard} disabled={pendingSwitchSaving} onClick={discardSwitch}>Odrzuć</button>
              <button type="button" className={s.editorSave} style={{ flex: '0 0 auto' }} disabled={pendingSwitchSaving} onClick={saveAndSwitch}>
                {pendingSwitchSaving ? 'Zapisywanie…' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}
      {desktopLayout ? (
        <>
          <div className={s.desktopProjectHeader}>
            <span className={s.desktopProjectName}>
              <span className={s.projectStatusDot} style={{ background: statusColor }} />
              {projectName}
            </span>
            {plannedMetrics.map((metric) => (
              <span key={metric.label} className={s.desktopMetric}>
                <span className={s.desktopMetricLabel}>{metric.label}</span>
                <span className={s.desktopMetricValue}>{metric.value}</span>
              </span>
            ))}
          </div>
          {status === 'ready' && (
            <div className={s.desktopSummaryRow}>
              <span className={s.compactInflow}>{formatDesktopSigned(wplaty, '+')}</span>
              <span className={s.compactOutflow}>{formatDesktopSigned(wydatki, '−')}</span>
            </div>
          )}
        </>
      ) : (
        <>
          {showProjectHeader ? (
            <div className={s.projectHeader}>
              <span className={s.projectHeaderName}>
                <span className={s.projectStatusDot} style={{ background: statusColor }} />
                {projectName}
              </span>
              {status === 'ready' && compactSummary}
            </div>
          ) : (
            status === 'ready' && <div className={s.compactSummaryStandalone}>{compactSummary}</div>
          )}

          <div className={s.plannedRow}>
            {plannedMetrics.map((metric) => (
              <div key={metric.label} className={s.plannedCell}>
                <span className={s.plannedLabel}>{metric.label}</span>
                <span className={s.plannedValue}>{metric.value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {status === 'loading' && <div className={s.loadState}>Ładowanie rozliczeń…</div>}

      {status === 'error' && (
        <div className={s.loadState}>
          <span>Nie udało się załadować rozliczeń.</span>
          <button type="button" className={s.retryBtn} onClick={onRetry}>Spróbuj ponownie</button>
        </div>
      )}

      {status === 'ready' && (
        <>
          {desktopLayout ? (
            <div className={s.desktopTransactionsList}>
              {desktopPairs.length === 0 && !isNewKey(editingKey) && <div className={s.desktopEmpty}>Brak operacji.</div>}
              {desktopPairs.map((pair, index) => (
                <div key={`${pair.inflow?.id || 'inflow'}-${pair.outflow?.id || 'outflow'}-${index}`} className={s.desktopPairRow}>
                  <div className={s.desktopTransactionCell}>{renderDesktopTransaction(pair.inflow)}</div>
                  <div className={s.desktopTransactionCell}>{renderDesktopTransaction(pair.outflow)}</div>
                </div>
              ))}
              {isNewKey(editingKey) && (
                <div className={s.desktopPairRow}>
                  <div className={s.desktopTransactionCell}>
                    {currentDirection === 'inflow' ? renderDesktopEditorFields() : <div className={s.desktopEmptyCell} aria-hidden="true" />}
                  </div>
                  <div className={s.desktopTransactionCell}>
                    {currentDirection === 'outflow' ? renderDesktopEditorFields() : <div className={s.desktopEmptyCell} aria-hidden="true" />}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={s.transactionsList}>
              {list.length === 0 && <div className={s.empty}>Brak operacji.</div>}
              {list.map((t) => {
                if (confirmDeleteId === t.id) {
                  return (
                    <div key={t.id} className={s.confirmRow}>
                      <span className={s.confirmText}>Usunąć „{t.description}” ({Number(t.amount).toFixed(2)} zł)?</span>
                      {deleteError && <span className={s.deleteError}>{deleteError}</span>}
                      <div className={s.confirmActions}>
                        <button type="button" className={s.editorSave} style={{ flex: '0 0 auto', background: '#e53e3e' }} disabled={deleting} onClick={() => handleDelete(t.id)}>
                          {deleting ? 'Usuwanie…' : 'Tak'}
                        </button>
                        <button type="button" className={s.editorCancel} disabled={deleting} onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}>Nie</button>
                      </div>
                    </div>
                  );
                }
                if (editingKey === t.id) {
                  return <div key={t.id} className={s.editorSlot}>{renderEditorFields()}</div>;
                }
                return (
                  <div
                    key={t.id}
                    className={`${s.row} ${t.direction === 'inflow' ? s.rowInflow : s.rowOutflow}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(t)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(t); } }}
                  >
                    <div className={s.rowMain}>
                      <span className={s.rowDescription}>{t.description}</span>
                      <span className={s.rowDate}>{t.occurred_on}</span>
                    </div>
                    <span className={s.rowAmount} style={{ color: t.direction === 'inflow' ? '#38a169' : '#e53e3e' }}>
                      {t.direction === 'inflow' ? '+' : '−'}{Number(t.amount).toFixed(2)} zł
                    </span>
                    <button
                      type="button"
                      className={s.rowDelete}
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(t.id); setDeleteError(null); }}
                      aria-label="Usuń operację"
                    >
                      ✖
                    </button>
                  </div>
                );
              })}
              {isNewKey(editingKey) && <div className={s.editorSlot}>{renderEditorFields()}</div>}
            </div>
          )}
          <div className={s.actions}>
            <button type="button" className={`${s.addBtn} ${s.addInflow}`} disabled={desktopLayout && editingKey !== null} onClick={() => openNew('inflow')}>+ Wpłata</button>
            <button type="button" className={`${s.addBtn} ${s.addOutflow}`} disabled={desktopLayout && editingKey !== null} onClick={() => openNew('outflow')}>− Wydatek</button>
          </div>
        </>
      )}
    </div>
  );
});

export default ProjectCashLedger;
