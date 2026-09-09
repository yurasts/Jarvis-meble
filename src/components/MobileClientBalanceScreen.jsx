import { useState, useRef } from 'react';
import ProjectCashLedger from './ProjectCashLedger';
import { transactionsForProjects, summarizeCash } from '../utils/cashLedger';
import { projectTotals } from './dashboardHelpers';
import s from './MobileClientBalanceScreen.module.css';

const formatDesktopMoney = (value) => Number(value || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Mobile / Client Balance / Expanded v1 — отдельный полноэкранный экран (Bilans klienta),
// открывается кнопкой "Bilans" в заголовке группы клиента (ProjectListPanel, только mobileLayout).
// Список проектов (MobileProjectsScreen) остаётся смонтированным под этим экраном — сюда не
// передаётся управление его состоянием (поиск/фильтр/scroll), он просто визуально и по кликам
// перекрыт (z-index, см. .module.css), как и MobileBottomNav.
//
// Суммы клиента — агрегация ВСЕХ доступных проектов с тем же client_name (без ограничения текущим
// переключателем Moje/GGS — clients здесь ожидается ПОЛНЫЙ, нефильтрованный массив из App.jsx;
// завершённые проекты тоже входят).
export default function MobileClientBalanceScreen({
  clientName, clients, transactions, cashStatus = 'ready', onRetryCash,
  onSaveTransaction, onDeleteTransaction, onSaveProjectCoefficient, onClose, desktopLayout = false,
}) {
  // editingKey лифтится сюда (не в ProjectCashLedger) — глобально на весь экран должен быть открыт
  // не более одного редактора операции, даже если у клиента несколько карточек-проектов.
  const [editingKey, setEditingKey] = useState(null);
  // Реальная "грязь" — приходит из ProjectCashLedger (сравнение draft/originalDraft), а не сам факт
  // "редактор открыт" (review P1). В любой момент не более одной карточки может её взвести, т.к.
  // editingKey — синглтон на весь экран.
  const [cashDirty, setCashDirty] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [savingBottom, setSavingBottom] = useState(false);
  // Próba otwarcia operacji w INNYM projekcie (albo innej w tym samym), gdy aktualna karta ma
  // niezapisany draft (review P1 — dawniej editingKey był po prostu nadpisywany, cicho gubiąc
  // draft). Ochrona żyje TUTAJ (nie w ProjectCashLedger), bo tylko ten ekran zna cashDirty i
  // aktywną kartę jednocześnie dla WSZYSTKICH kart klienta (przełączanie między kartami jest z
  // definicji niewidoczne dla pojedynczej karty).
  const [pendingSwitchKey, setPendingSwitchKey] = useState(null);
  const [switchSaveError, setSwitchSaveError] = useState(false);
  const [switchSaving, setSwitchSaving] = useState(false);
  const [coefficientDrafts, setCoefficientDrafts] = useState({});
  const [editingCoefficientProjectId, setEditingCoefficientProjectId] = useState(null);
  const [coefficientSaveError, setCoefficientSaveError] = useState('');

  const projects = (clients || []).filter((c) => (c.client_name || c.full_name || '—') === clientName);
  const projectIds = projects.map((p) => p.id);
  const clientTransactions = transactionsForProjects(transactions, projectIds);
  const { wplaty, wydatki, saldo } = summarizeCash(clientTransactions);

  const coefficientDraftFor = (project) => {
    const key = String(project.id);
    return Object.prototype.hasOwnProperty.call(coefficientDrafts, key)
      ? coefficientDrafts[key]
      : String(Number(project.budget_coefficient) || 2);
  };

  const changedCoefficientProjects = projects.filter((project) => {
    const key = String(project.id);
    if (!Object.prototype.hasOwnProperty.call(coefficientDrafts, key)) return false;
    const next = Number(coefficientDrafts[key]);
    const current = Number(project.budget_coefficient) || 2;
    return !Number.isFinite(next) || next <= 0 || Math.abs(next - current) > 0.000001;
  });

  const editCoefficient = (projectId) => {
    const project = projects.find((item) => String(item.id) === String(projectId));
    if (!project) return;
    setCoefficientDrafts((current) => {
      const key = String(projectId);
      if (Object.prototype.hasOwnProperty.call(current, key)) return current;
      return { ...current, [key]: String(Number(project.budget_coefficient) || 2) };
    });
    setEditingCoefficientProjectId(String(projectId));
    setCoefficientSaveError('');
  };

  const changeCoefficient = (projectId, value) => {
    setCoefficientDrafts((current) => ({ ...current, [String(projectId)]: value }));
    setCoefficientSaveError('');
  };

  const cancelCoefficientEdit = (projectId) => {
    setCoefficientDrafts((current) => {
      const next = { ...current };
      delete next[String(projectId)];
      return next;
    });
    setEditingCoefficientProjectId(null);
    setCoefficientSaveError('');
  };

  // editingKey — либо `new-{direction}-{projectId}` (по конструкции принадлежит ровно одному
  // проекту), либо id существующей транзакции (глобально уникален, но какой карточке "свой" —
  // нужно посмотреть у какой транзакции такой id). Карточке, которой ключ не принадлежит,
  // передаётся null — открыт эффективно только один редактор на весь экран.
  const editingKeyForProject = (projectId) => {
    if (editingKey === null) return null;
    if (String(editingKey).startsWith('new-')) {
      return editingKey.endsWith(`-${projectId}`) ? editingKey : null;
    }
    const tx = (transactions || []).find((t) => t.id === editingKey);
    return tx && tx.project_id === projectId ? editingKey : null;
  };

  // Проект, которому сейчас принадлежит editingKey (для sticky Zapisz внизу — обратная операция к
  // editingKeyForProject) — обратный поиск карточки, чей ref нужно дёрнуть.
  const activeProjectId = (() => {
    if (editingKey === null) return null;
    if (String(editingKey).startsWith('new-')) {
      const parts = String(editingKey).split('-');
      return parts[parts.length - 1];
    }
    const tx = (transactions || []).find((t) => t.id === editingKey);
    return tx ? String(tx.project_id) : null;
  })();

  const cardRefs = useRef({});

  const requestBack = () => {
    if (cashDirty || changedCoefficientProjects.length > 0) { setConfirmBack(true); return; }
    onClose();
  };

  const discardAndBack = () => {
    setEditingKey(null);
    setCashDirty(false);
    setCoefficientDrafts({});
    setEditingCoefficientProjectId(null);
    setCoefficientSaveError('');
    setConfirmBack(false);
    onClose();
  };

  // Sticky Zapisz — сохраняет ЧЕРНОВИК ТЕКУЩЕЙ открытой карточки (черновик не лифтится на этот
  // экран, только editingKey/dirty — см. ProjectCashLedger.saveActiveDraft через ref). Ошибка
  // остаётся видна внутри самой открытой карточки (её собственный editorError), кнопка ничего не
  // дублирует.
  const handleBottomSave = async () => {
    setSavingBottom(true);
    setCoefficientSaveError('');

    if (activeProjectId !== null) {
      const card = cardRefs.current[activeProjectId];
      const cashResult = await card?.saveActiveDraft();
      if (cashResult?.error) {
        setSavingBottom(false);
        return;
      }
    }

    for (const project of changedCoefficientProjects) {
      const coefficient = Number(coefficientDraftFor(project));
      if (!Number.isFinite(coefficient) || coefficient <= 0) {
        setCoefficientSaveError('Współczynnik musi być większy od zera.');
        setSavingBottom(false);
        return;
      }
      const { total } = projectTotals(project);
      const calculatedBudget = Number((total * coefficient).toFixed(2));
      const result = await onSaveProjectCoefficient?.(project.id, coefficient, calculatedBudget);
      if (result?.error || !onSaveProjectCoefficient) {
        setCoefficientSaveError('Nie udało się zapisać współczynnika.');
        setSavingBottom(false);
        return;
      }
    }

    if (changedCoefficientProjects.length > 0) {
      setCoefficientDrafts({});
      setEditingCoefficientProjectId(null);
    }
    setSavingBottom(false);
  };

  const hasSaveableChanges = activeProjectId !== null || changedCoefficientProjects.length > 0;

  // Przekazywane kartom zamiast bezpośrednio setEditingKey — jedyna droga, którą KAŻDA karta
  // (własna lub inna) zgłasza chęć otwarcia innej operacji. null (zamknięcie z poziomu karty, która
  // aktualnie posiada editingKey) i "brak realnej zmiany" przechodzą od razu; próba przeskoczenia na
  // INNY klucz przy cashDirty=true zatrzymuje się na potwierdzeniu.
  const requestEditingKeyChange = (newKey) => {
    if (newKey === null || !cashDirty || newKey === editingKey) {
      setEditingKey(newKey);
      return;
    }
    setPendingSwitchKey(newKey);
  };

  const cancelSwitch = () => { setPendingSwitchKey(null); setSwitchSaveError(false); };

  const discardSwitch = () => {
    const key = pendingSwitchKey;
    setPendingSwitchKey(null);
    setSwitchSaveError(false);
    setCashDirty(false);
    setEditingKey(key);
  };

  const saveAndSwitch = async () => {
    if (activeProjectId === null) return;
    const card = cardRefs.current[activeProjectId];
    setSwitchSaving(true);
    setSwitchSaveError(false);
    const result = await card?.saveActiveDraft();
    setSwitchSaving(false);
    if (result?.error) { setSwitchSaveError(true); return; }
    const key = pendingSwitchKey;
    setPendingSwitchKey(null);
    setCashDirty(false);
    setEditingKey(key);
  };

  return (
    <div className={`${s.screen} ${desktopLayout ? s.desktopScreen : ''}`}>
      {desktopLayout ? (
        <div className={`${s.header} ${s.desktopHeader}`}>
          <div className={s.desktopHeaderRow}>
            <div className={s.desktopIdentity}>
              <h2 className={s.desktopScreenTitle}>Bilans klienta</h2>
              <span className={s.desktopClientName}>{clientName}</span>
            </div>
            <div className={s.desktopHeaderActions}>
              {cashStatus === 'ready' && (
                <div className={s.desktopHeaderSaldo}>
                  <span>SALDO</span>
                  <strong>{formatDesktopMoney(saldo)} zł</strong>
                </div>
              )}
              <span className={s.desktopProjectCount}>
                {projects.length} {projects.length === 1 ? 'projekt' : 'projekty'}
              </span>
              <button
                type="button"
                className={s.desktopTopSave}
                disabled={!hasSaveableChanges || savingBottom}
                onClick={handleBottomSave}
              >
                {savingBottom ? 'Zapisywanie…' : 'Zapisz'}
              </button>
            </div>
          </div>
          {cashStatus === 'error' ? (
            <div className={s.loadError}>
              <span>Nie udało się załadować rozliczeń.</span>
              <button type="button" className={s.retryBtn} onClick={onRetryCash}>Spróbuj ponownie</button>
            </div>
          ) : cashStatus === 'ready' && (
            <div className={s.desktopSummaryRow}>
              <div className={`${s.desktopSummaryMetric} ${s.desktopSummaryInflow}`}>
                <span>WPŁATY</span>
                <strong className={s.inflow}>{formatDesktopMoney(wplaty)} zł</strong>
              </div>
              <div className={`${s.desktopSummaryMetric} ${s.desktopSummaryOutflow}`}>
                <span>WYDATKI</span>
                <strong className={s.outflow}>{formatDesktopMoney(wydatki)} zł</strong>
              </div>
            </div>
          )}
          {coefficientSaveError && <div className={s.coefficientSaveError}>{coefficientSaveError}</div>}
        </div>
      ) : (
        <div className={s.header}>
          <button type="button" className={s.backBtn} onClick={requestBack}>← Projekty</button>
          <h2 className={s.screenTitle}>Bilans klienta</h2>
          <div className={s.titleRow}>
            <span className={s.clientName}>{clientName}</span>
            <span className={s.projectCount}>{projects.length} {projects.length === 1 ? 'projekt' : 'projekty'}</span>
          </div>
          {cashStatus === 'error' ? (
            <div className={s.loadError}>
              <span>Nie udało się załadować rozliczeń.</span>
              <button type="button" className={s.retryBtn} onClick={onRetryCash}>Spróbuj ponownie</button>
            </div>
          ) : cashStatus === 'ready' && (
            <div className={s.summaryRow}>
              <div className={s.summaryTile}>
                <div className={s.summaryLabel}>Wpłaty</div>
                <div className={`${s.summaryValue} ${s.inflow}`}>{wplaty.toFixed(2)} zł</div>
              </div>
              <div className={s.summaryTile}>
                <div className={s.summaryLabel}>Wydatki</div>
                <div className={`${s.summaryValue} ${s.outflow}`}>{wydatki.toFixed(2)} zł</div>
              </div>
              <div className={s.summaryTile}>
                <div className={s.summaryLabel}>Saldo</div>
                <div className={s.summaryValue}>{saldo.toFixed(2)} zł</div>
              </div>
            </div>
          )}
        </div>
      )}

      {!desktopLayout && coefficientSaveError && <div className={s.mobileCoefficientSaveError}>{coefficientSaveError}</div>}

      <div className={`${s.content} ${desktopLayout ? s.desktopContent : ''}`}>
        {projects.length === 0 && <div className={s.empty}>Brak projektów tego klienta.</div>}
        {projects.map((project) => (
          <div key={project.id} className={`${s.projectCard} ${desktopLayout ? s.desktopProjectCard : ''}`}>
            <ProjectCashLedger
              ref={(el) => { cardRefs.current[String(project.id)] = el; }}
              client={project}
              transactions={transactions}
              onSaveTransaction={onSaveTransaction}
              onDeleteTransaction={onDeleteTransaction}
              coefficientValue={coefficientDraftFor(project)}
              coefficientEditing={editingCoefficientProjectId === String(project.id)}
              onCoefficientEdit={() => editCoefficient(project.id)}
              onCoefficientChange={(value) => changeCoefficient(project.id, value)}
              onCoefficientFinish={() => setEditingCoefficientProjectId(null)}
              onCoefficientCancel={() => cancelCoefficientEdit(project.id)}
              showProjectHeader
              desktopLayout={desktopLayout}
              showDesktopSaldo={desktopLayout}
              editingKey={editingKeyForProject(project.id)}
              onEditingKeyChange={requestEditingKeyChange}
              onDirtyChange={setCashDirty}
              status={cashStatus}
              onRetry={onRetryCash}
            />
          </div>
        ))}
      </div>

      {!desktopLayout && (
      <div className={s.bottomBar}>
        <button
          type="button"
          className={s.bottomSave}
          disabled={!hasSaveableChanges || savingBottom}
          onClick={handleBottomSave}
        >
          {savingBottom ? 'Zapisywanie…' : 'Zapisz'}
        </button>
      </div>
      )}

      {confirmBack && (
        <div className={s.confirmOverlay}>
          <div className={s.confirmBox}>
            <h3 className={s.confirmTitle}>Masz niezapisane zmiany</h3>
            <p className={s.confirmText}>Chcesz wrócić do listy projektów — odrzucić niezapisaną operację?</p>
            <div className={s.confirmActions}>
              <button type="button" className={s.confirmDiscard} onClick={discardAndBack}>Odrzuć zmiany</button>
              <button type="button" className={s.confirmCancel} onClick={() => setConfirmBack(false)}>Anuluj</button>
            </div>
          </div>
        </div>
      )}

      {pendingSwitchKey !== null && (
        <div className={s.confirmOverlay}>
          <div className={s.confirmBox}>
            <h3 className={s.confirmTitle}>Masz niezapisaną operację</h3>
            <p className={s.confirmText}>Co zrobić przed otwarciem innej operacji?</p>
            {switchSaveError && <p className={s.switchError}>Nie udało się zapisać operacji. Spróbuj ponownie.</p>}
            <div className={s.confirmActions}>
              <button type="button" className={s.confirmCancel} disabled={switchSaving} onClick={cancelSwitch}>Anuluj</button>
              <button type="button" className={s.confirmDiscard} disabled={switchSaving} onClick={discardSwitch}>Odrzuć</button>
              <button type="button" className={s.confirmSave} disabled={switchSaving} onClick={saveAndSwitch}>
                {switchSaving ? 'Zapisywanie…' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
