import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CabinetCalculator from './CabinetCalculator';

const materials = [
  { id: 'm-body', name: 'PL W960 SM Biały', category: 'Płyta', price: 180, is_favorite: true },
  { id: 'm-front', name: 'U702 ST9 Kaszmir', category: 'Płyta', price: 220 },
  { id: 'm-front2', name: 'U960 SM Dąb Sonoma', category: 'Płyta', price: 260 },
  { id: 'm-edge-body', name: 'ABS W960 SM Biały', category: 'Obrzeże', price: 1.13 },
  { id: 'm-edge-front', name: 'ABS U702 ST9 Kaszmir', category: 'Obrzeże', price: 4.2 },
  { id: 'm-hinge-soft', name: "BLUM Zawias 110' nakładany ze spowalniaczem na wkręty 71B3550", category: 'Zawiasy', price: 12 },
  { id: 'm-hinge-spring', name: "BLUM Zawias 110' nakładany ze sprężyną na wkręty 71T3550", category: 'Zawiasy', price: 14 },
  { id: 'm-runner', name: 'Blum Tandem L-500', category: 'Prowadnice', price: 45 },
  { id: 'm-top', name: 'Blat laminowany', category: 'Inne', price: 150 },
  { id: 'm-leg-front', name: 'Nogi zwykłe', category: 'Akcesoria', price: 1 },
  { id: 'm-leg-axilo', name: 'Nóżka Axilo HAFELE H-100 mm', category: 'Akcesoria', price: 4.19 },
  { id: 'm-hdf', name: 'HDF BIAŁY 2850x2070x3mm', category: 'HDF', price: 56.73 },
  { id: 'm-hanger', name: 'ZAWIESZKA CAMAR 806 KPL', category: 'Akcesoria', price: 8 },
  { id: 'm-tipon', name: 'TIP-ON STRONG IF BIAŁY MAGNES MOCNY', category: 'Akcesoria', price: 14.19 },
  { id: 'm-handle', name: 'Uchwyt GAMET meblowy 128mm', category: 'Akcesoria', price: 6.5 },
  { id: 'm-hafele', name: 'Profil HAFELE aluminiowy', category: 'Akcesoria', price: 25 },
];
const servicesList = [
  { id: 's-cut', name: 'Cięcie płyty', price: 2 },
  { id: 's-edge', name: 'Oklejanie PCV', price: 1.5 },
];

const renderCalculator = (props = {}) => {
  const onAddToProject = vi.fn();
  const onStateChange = vi.fn();
  render(
    <CabinetCalculator
      materials={materials}
      servicesList={servicesList}
      projectMultiplier={2}
      onAddToProject={onAddToProject}
      onStateChange={onStateChange}
      {...props}
    />,
  );
  return { onAddToProject, onStateChange };
};

// SearchableMaterialSelect (Etap D) zastąpiło gołe <select> — wybór pozycji to teraz: otwórz
// (klik na trigger z aria-label) -> kliknij opcję o danej (częściowej) nazwie. `materialName` ''
// wybiera pustą pozycję ("— nie wybrano —" / "Domyślna z projektu").
const pickMaterial = (labelText, materialName) => {
  fireEvent.click(screen.getByLabelText(labelText));
  fireEvent.click(materialName
    ? screen.getByRole('option', { name: new RegExp(materialName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    : screen.getByRole('option', { name: /^(— nie wybrano —|Domyślna z projektu)$/ }));
};

// Etap H, krok 1 — nie ma już osobnego modalu: wszystkie wiersze (Pozycja/Wybrany materiał/
// Ilość/Cena/Wartość) żyją wprost w głównej tabeli kalkulatora. Lokalizujemy wiersz po tekście w
// jego komórce "Wybrany materiał" (nazwa materiału) albo po etykiecie roli (aria-label selecta).
// Etap I — ten sam tekst materiału może DODATKOWO pojawić się w nagłówku grupy (auto-rozwiniętym,
// gdy grupa ma już moduł) — stąd szukamy wszystkich dopasowań i bierzemy to wewnątrz <tr>.
// queryAllByText (nie getAllByText!) — brak żadnego dopasowania (np. wiersz usunięty z tabeli po
// przekierowaniu area=0) musi dać `undefined`, nie rzucić wyjątkiem.
const rowByMaterialName = (name) => screen.queryAllByText(name).map(el => el.closest('tr')).find(Boolean);
const roleButton = (name) => screen.getByRole('button', { name, exact: true });

// Etap J, krok 2 — podpis presetu żyje w DWÓCH miejscach naraz: na kafelku "+ Dodaj moduł"
// (zawsze widocznym) i w nagłówku KARTY dodanego modułu (.moduleName) — gołe screen.getByText(label)
// jest więc wieloznaczne, odkąd dodamy choć 1 taki moduł. Selector celuje tylko w nagłówek karty.
const moduleCardTitle = (label) => screen.queryByText(label, { selector: '[class*="moduleName"]' });

// Etap I — etykiety 7 "grup płytowych" (4 kuchenne + Szafa/Łazienka/RTV, każda z 1 wspólną grupą)
// i 4 wkładek kategorii, dokładnie jak w BOARD_GROUPS/CATEGORY_TABS w komponencie.
const KITCHEN_BOTTOM = '⬇️ Szafki dolne';
const KITCHEN_TOP = '⬆️ Szafki górne';
const KITCHEN_MEZZANINE = '⏫ Antresole / Górny rząd pod sufit';
const KITCHEN_TALL = '📏 Słupki / Wysoka zabudowa';
const WARDROBE_GROUP = '🚪 Szafa / Garderoba';
const BATHROOM_GROUP = '🛁 Łazienka';
const RTV_GROUP = '📺 RTV';

// Nagłówek grupy (toggle) ma w accessible name strzałkę ▸/▾ i (dla niepustych grup) licznik —
// dopasowujemy po samej etykiecie grupy, żeby nie zależeć od dokładnej spacji/sufiksu.
const groupToggle = (groupLabel) => screen.getByRole('button', { name: new RegExp(`^[▸▾]\\s*${groupLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
const expandGroup = (groupLabel) => fireEvent.click(groupToggle(groupLabel));
// Etap N, krok 1 — 4 wkładki-przyciski zastąpione dropdownem "Typ zabudowy": przełączanie kategorii
// to teraz zmiana wartości <select>, nie klik przycisku z aria-pressed.
const switchCategory = (tabLabel) => {
  const select = screen.getByLabelText('Typ zabudowy');
  const option = within(select).getByRole('option', { name: tabLabel });
  fireEvent.change(select, { target: { value: option.value } });
};
const boardField = (fieldLabel, groupLabel) => screen.getByLabelText(`${fieldLabel} — ${groupLabel}`);

// Etap J, krok 2 — kafelki "+ Dodaj moduł" są teraz ikona SVG + krótka podpis (np. "Z szufladami"),
// bez "Szafka dolna"/nazwy grupy w tekście — ta sama krótka podpis bywa więc WIELOZNACZNA, gdy 2
// grupy z tym samym presetem (np. "Z szufladami" w Szafki dolne I w Słupki) są jednocześnie
// widoczne pod tą samą kategorią. `groupSectionFor` znajduje kontener TEJ konkretnej grupy (przez
// nagłówek-toggle), `addModuleInGroup` klika kafelek tylko wewnątrz niego.
const groupSectionFor = (groupLabel) => groupToggle(groupLabel).closest('[class*="groupSection"]');
// Etap U, krok 1 — tabela po prawej jest teraz JEDNA, WSPÓLNA dla wszystkich 5 grup kuchennych
// naraz (zgrupowana Ściana -> jarus -> wiersze, patrz renderUnifiedKitchenTable) — nie ma już
// osobnego kontenera PER GRUPĘ (dawne `data-group-slide-table`, Etap T). `kitchenModuleTable`
// znajduje TEN jeden `<table>` (odróżniony od tabel "Materiały"/"Usługi" niżej w panelu po klasie);
// `groupRowsFor` filtruje jego wiersze po `data-row-group` (ustawianym na KAŻDYM wierszu modułu,
// niezależnie od tego, w którym jarusie/ścianie akurat się znalazł).
const KITCHEN_GROUP_KEY_BY_LABEL = {
  [KITCHEN_BOTTOM]: 'kitchen_bottom',
  [KITCHEN_TOP]: 'kitchen_top',
  [KITCHEN_MEZZANINE]: 'kitchen_mezzanine',
  [KITCHEN_TALL]: 'kitchen_tall',
};
const kitchenModuleTable = () => document.querySelector('table[class*="moduleTable"]');
const groupRowsFor = (groupLabel) => Array.from(document.querySelectorAll(`[data-row-group="${KITCHEN_GROUP_KEY_BY_LABEL[groupLabel]}"]`));
const addModuleInGroup = (groupLabel, caption) => fireEvent.click(
  within(groupSectionFor(groupLabel)).getByRole('button', { name: caption, exact: true }),
);

// Etap Q, krok 1 — panel materiałów grupy (4 pola płyty/kromki + 2 checkboxy) nie rozwija się już
// automatycznie, kiedy grupa dostanie swój pierwszy moduł — żyje za WŁASNYM gear-przyciskiem
// "⚙️ Materiały — <grupa>" w nagłówku (obok "▸/▾ <Grupa> (N)"), zwinięty domyślnie.
const materialsGearButton = (groupLabel) => screen.getByLabelText(`Materiały — ${groupLabel}`);
const expandMaterials = (groupLabel) => fireEvent.click(materialsGearButton(groupLabel));
// Etap Q, krok 1 — panel "Wymiary ściany i wysokości" (Obszar 1/2) żyje za gear-przyciskiem
// "⚙️ Wymiary ściany i wysokości" w górnym nagłówku (obok "Typ zabudowy"), zwinięty domyślnie.
const heightsGearButton = () => screen.getByRole('button', { name: /⚙️ Wymiary ściany i wysokości/ });
const expandHeightsPanel = () => fireEvent.click(heightsGearButton());
// Etap Q, krok 4 — "Konstrukcja / Szuflady" i "HDF" nie są już osobnymi kolumnami tabeli: żyją za
// jednym, per-wierszowym przyciskiem "⚙️" (aria-label "Konstrukcja, szuflady, półki, HDF — <moduł>").
// Etap W, krok 2 — klik otwiera teraz CENTROWANY MODAL (createPortal do document.body), nie popover
// zaczepiony o wiersz — jego zawartość (HDF/Drzwi/Półki/szuflady/Standard lodówki/Duplikuj/Usuń/
// Przesuń) trzeba więc odpytywać przez `settingsModal()`, NIE `within(row)`.
const openRowSettings = (row) => fireEvent.click(within(row).getByRole('button', { name: /^Konstrukcja, szuflady, półki, HDF/ }));
const settingsModal = () => screen.getByTestId('cabinet-settings-modal');
const closeRowSettings = () => fireEvent.click(within(settingsModal()).getByRole('button', { name: 'Zamknij ustawienia szafki' }));
// Etap R, krok 2 — Szer./Wys./Gł. w wierszu to teraz klik-do-edycji ("✎ 600"), nie zawsze-widoczny
// <input> — trigger (gdy zwinięty) i input (gdy rozwinięty) dzielą TEN SAM aria-label, więc
// getByLabelText trafia w to, co akurat jest wyrenderowane. `readInlineNumber` czyta wyświetlaną
// liczbę (działa scope'owane do `container`, np. jednego wiersza <tr> albo całego `screen`).
// `screen` nie jest DOM-owym kontenerem (within() go nie akceptuje) — ma WŁASNE gotowe query'sy.
const findByLabel = (container, label) => (container === screen ? screen.getByLabelText(label) : within(container).getByLabelText(label));
const readInlineNumber = (container, label) => findByLabel(container, label).textContent;
// `setInlineNumber`: klika trigger (otwiera edycję), wpisuje nową wartość, zapisuje przez Blur
// (Enter działałby tak samo — oba ścieżki testuje osobny test "inline-editowania").
const setInlineNumber = (container, label, value) => {
  fireEvent.click(findByLabel(container, label));
  const input = findByLabel(container, label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe('CabinetCalculator', () => {
  it('shows a placeholder in the quote table and a disabled add-to-project button until the first module is added', () => {
    renderCalculator();
    expect(screen.getByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ })).toBeDisabled();
  });

  it('adds a module in 1 click and shows its per-row line and its row in the quote table', () => {
    renderCalculator();
    addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

    expect(moduleCardTitle('Z drzwiami')).toBeInTheDocument();
    // Etap M, krok 2 — dawna zwarta linijka "↳ Korpus: ... Front: ... Zawiasy: ..." zastąpiona
    // osobnymi kolumnami tabeli (Korpus (m²)/Front (m²)/Obrzeże (mb)).
    const row = moduleCardTitle('Z drzwiami').closest('tr');
    // Etap W, krok 1 — "m²" żyje teraz TYLKO w nagłówku kolumny (Korpus/Front) — w samym wierszu
    // zostaje czysta liczba.
    expect(row.querySelector('[data-label="Korpus (m²)"]')).toHaveTextContent(/^\d+\.\d{2}$/);
    expect(rowByMaterialName('PL W960 SM Biały')).toHaveTextContent(/1 ark\. \(\d+\.\d{2} m²\)/);
    expect(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ })).not.toBeDisabled();
  });

  it('recomputes front/body areas live when a module dimension changes', () => {
    renderCalculator();
    addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
    const row = moduleCardTitle('Klasyczna (z drzwiami)').closest('tr');
    const before = row.querySelector('[data-label="Front (m²)"]').textContent;

    setInlineNumber(screen, 'Wys. (mm)', '2400');

    const after = row.querySelector('[data-label="Front (m²)"]').textContent;
    expect(after).not.toBe(before);
  });

  it('removes a module and the quote table goes back to the empty placeholder', () => {
    renderCalculator();
    fireEvent.click(roleButton('Blat'));
    expect(screen.queryByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Usuń moduł/ }));
    expect(screen.getByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).toBeInTheDocument();
  });

  // Etap N, krok 4 — furnitura (zawiasy/nogi/zawieszki/uchwyty/TIP-ON/profil HAFELE) jest tymczasowo
  // usunięta z rozliczenia (includeHardware:false) — "Dodaj do projektu" przenosi już TYLKO
  // płyty/kromkę/HDF + usługi, nigdy osprzęt.
  // Etap AA, krok 4 — "pierwszy etap" powrotu osprzętu: nóżki wróciły do rozliczenia (legFront/
  // legRearAxilo, patrz includeLegs w jądrze) — zawiasy/zawieszki/uchwyty/TIP-ON zostają schowane
  // (includeHardware: false, kolejny etap). m-runner (prowadnice) nie pojawia się tutaj, bo "Z
  // drzwiami" (base_doors) nie ma w ogóle szuflad — test komplettów szuflad żyje osobno, niżej.
  it('adds board/edge/HDF/nogi/service lines to the project — reszta osprzętu zostaje wykluczona (Etap N/AA)', () => {
    const { onAddToProject } = renderCalculator();
    addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

    fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

    expect(onAddToProject).toHaveBeenCalledTimes(1);
    const { materialLines, serviceLines } = onAddToProject.mock.calls[0][0];
    const byId = id => materialLines.find(line => line.item.id === id);

    expect(byId('m-body')).toMatchObject({ quantity: 1 });
    expect(byId('m-front')).toMatchObject({ quantity: 1 });
    expect(byId('m-hdf')).toMatchObject({ quantity: 1 });
    expect(byId('m-leg-front')).toMatchObject({ quantity: 2 }); // base_doors, W=600<=900 -> legsForWidth = 4 (2 przód + 2 tył)
    expect(byId('m-leg-axilo')).toMatchObject({ quantity: 2 });
    expect(byId('m-hinge-soft')).toBeUndefined();
    expect(byId('m-hinge-spring')).toBeUndefined();
    expect(byId('m-runner')).toBeUndefined();
    expect(byId('m-hanger')).toBeUndefined();
    expect(byId('m-tipon')).toBeUndefined();
    expect(serviceLines.find(line => line.item.id === 's-cut')).toBeTruthy();
    expect(serviceLines.find(line => line.item.id === 's-edge')).toBeTruthy();
  });

  it('flashes a confirmation after adding to the project', async () => {
    renderCalculator();
    addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
    fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

    expect(await screen.findByRole('button', { name: '✓ Dodano!' })).toBeInTheDocument();
  });

  describe('autozapis stanu kalkulatora (projects.calculator_state)', () => {
    it('initializes modules/selection/activeCategory from initialState', () => {
      renderCalculator({
        initialState: {
          activeCategory: 'kitchen',
          modules: [{ id: 'restored-1', category: 'kitchen', group: 'kitchen_bottom', type: 'base_doors', label: 'Z drzwiami', icon: 'doors', W: 777, H: 820, D: 520, doors: 1, shelves: 1, qty: 1 }],
          selection: {},
          boards: {},
        },
      });
      expect(moduleCardTitle('Z drzwiami')).toBeInTheDocument();
      expect(readInlineNumber(screen, 'Szer. (mm)')).toContain('777');
    });

    it('falls back to empty defaults when initialState is {} (nowy projekt) and starts on the Kuchnia tab', () => {
      renderCalculator({ initialState: {} });
      expect(screen.getByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).toBeInTheDocument();
      expect(screen.getByLabelText('Typ zabudowy')).toHaveValue('kitchen');
      expect(within(groupSectionFor(KITCHEN_BOTTOM)).getByRole('button', { name: 'Z drzwiami', exact: true })).toBeInTheDocument();
    });

    it('restores a non-default activeCategory (e.g. bathroom) from initialState', () => {
      renderCalculator({ initialState: { activeCategory: 'bathroom' } });
      expect(screen.getByLabelText('Typ zabudowy')).toHaveValue('bathroom');
      expect(roleButton('Szafka pod umywalkę (podwieszana)')).toBeInTheDocument();
    });

    it('calls onStateChange with the latest modules/selection/boards/activeCategory after a change, but not on initial mount', () => {
      const { onStateChange } = renderCalculator();
      expect(onStateChange).not.toHaveBeenCalled();

      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      expect(onStateChange).toHaveBeenCalled();
      const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
      expect(lastCall.modules).toHaveLength(1);
      expect(lastCall.modules[0].type).toBe('base_doors');
      expect(lastCall.modules[0].group).toBe('kitchen_bottom');
      expect(lastCall.activeCategory).toBe('kitchen');
      expect(lastCall.boards).toEqual({});
    });

    it('persists a group\'s board config (material + checkbox) via onStateChange', () => {
      const { onStateChange } = renderCalculator();
      expandGroup(KITCHEN_BOTTOM);
      fireEvent.click(screen.getByLabelText('Korpus z płyty frontowej — ⬇️ Szafki dolne'));
      const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
      expect(lastCall.boards.kitchen_bottom.bodyFromFront).toBe(true);
    });

    it('shows the save status indicator in the header based on the saveStatus prop', () => {
      renderCalculator({ saveStatus: 'saved' });
      expect(screen.getByRole('status')).toHaveTextContent('✓ Zapisano w projekcie');
    });

    it('shows nothing when saveStatus is not set yet', () => {
      renderCalculator();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  // Etap I, krok 1 — 4 wkładki typu zabudowy na szczycie kalkulatora.
  describe('wkładki typu zabudowy (Etap I, krok 1)', () => {
    it('Kuchnia is the default active tab, with its 5 groups and their add buttons visible', () => {
      renderCalculator();
      expect(screen.getByLabelText('Typ zabudowy')).toHaveValue('kitchen');
      expect(groupToggle(KITCHEN_BOTTOM)).toBeInTheDocument();
      expect(groupToggle(KITCHEN_TOP)).toBeInTheDocument();
      expect(groupToggle(KITCHEN_MEZZANINE)).toBeInTheDocument();
      expect(groupToggle(KITCHEN_TALL)).toBeInTheDocument();
      expect(roleButton('Blat')).toBeInTheDocument();
    });

    it('switching to Szafa/Łazienka/RTV swaps the visible groups and add buttons', () => {
      renderCalculator();
      switchCategory(WARDROBE_GROUP);
      expect(roleButton('Regał otwarty')).toBeInTheDocument();
      // Kuchnia (i jej grupy, w tym Szafki dolne) w ogóle nie są renderowane pod inną wkładką.
      expect(screen.queryByRole('button', { name: 'Z drzwiami', exact: true })).not.toBeInTheDocument();

      switchCategory(BATHROOM_GROUP);
      expect(roleButton('Szafka pod umywalkę (podwieszana)')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Regał otwarty', exact: true })).not.toBeInTheDocument();

      switchCategory(RTV_GROUP);
      expect(roleButton('Szafka RTV stojąca')).toBeInTheDocument();
    });

    it('a module added under one tab stays in the project and in the quote table after switching tabs away', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      switchCategory(WARDROBE_GROUP);
      expect(screen.queryByText('Z drzwiami')).not.toBeInTheDocument(); // lista modułów jest per-grupa aktywnej karty

      // Ale tabela kalkulacji (na dole) jest JEDNA dla całego projektu — wiersz nadal tam jest.
      expect(rowByMaterialName('PL W960 SM Biały')).toHaveTextContent('1 ark.');

      switchCategory('🍳 Kuchnia');
      expect(moduleCardTitle('Z drzwiami')).toBeInTheDocument();
    });

    it('the quote table aggregates board material rows from ALL categories at once, not just the active tab', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const singleModuleArea = Number(rowByMaterialName('PL W960 SM Biały').textContent.match(/\(([\d.]+) m²\)/)[1]);

      switchCategory(WARDROBE_GROUP);
      fireEvent.click(roleButton('Regał otwarty')); // domyślny korpus = ta sama biała płyta (WHITE_HINTS)

      const combinedArea = Number(rowByMaterialName('PL W960 SM Biały').textContent.match(/\(([\d.]+) m²\)/)[1]);
      expect(combinedArea).toBeGreaterThan(singleModuleArea);
    });
  });

  // Etap I, krok 2 — materiały płyty/kromki wybiera się RAZ na grupę, nie globalnie i nie per moduł.
  // Etap J, krok 1 — wiersze materiału są teraz gołym tekstem "✎ Pole: nazwa — cena", nie pudełkiem.
  describe('materiały grupy (Etap I/J, krok 2)', () => {
    it('Szafki dolne always show their own 4 material rows + 2 checkboxes, with no inherit switcher', () => {
      renderCalculator();
      expandGroup(KITCHEN_BOTTOM);
      expect(boardField('Płyta korpusu', KITCHEN_BOTTOM)).toBeInTheDocument();
      expect(boardField('Płyta frontu', KITCHEN_BOTTOM)).toBeInTheDocument();
      expect(boardField('Obrzeże korpusu', KITCHEN_BOTTOM)).toBeInTheDocument();
      expect(boardField('Obrzeże frontu', KITCHEN_BOTTOM)).toBeInTheDocument();
      expect(screen.getByLabelText('Korpus z płyty frontowej — ⬇️ Szafki dolne')).not.toBeChecked();
      expect(screen.getByLabelText('Obrzeże korpusu w kolorze frontu — ⬇️ Szafki dolne')).not.toBeChecked();
      expect(screen.queryByLabelText('Materiały grupy:')).not.toBeInTheDocument();
    });

    it('a compact material row shows "Pole: nazwa — cena" as one line of text, with a pencil trigger', () => {
      renderCalculator();
      expandGroup(KITCHEN_BOTTOM);
      const row = boardField('Płyta korpusu', KITCHEN_BOTTOM);
      expect(row).toHaveTextContent('Płyta korpusu:');
      expect(row).toHaveTextContent('PL W960 SM Biały');
      expect(row).toHaveTextContent('180.00 zł');
    });

    it('an empty group is compact (material rows hidden) until its "⚙️ Materiały" gear is clicked', () => {
      renderCalculator();
      expect(screen.queryByLabelText(`Płyta korpusu — ${KITCHEN_TOP}`)).not.toBeInTheDocument();
      expect(materialsGearButton(KITCHEN_TOP)).toHaveAttribute('aria-expanded', 'false');

      expandMaterials(KITCHEN_TOP);
      expect(boardField('Płyta korpusu', KITCHEN_TOP)).toBeInTheDocument();
      expect(materialsGearButton(KITCHEN_TOP)).toHaveAttribute('aria-expanded', 'true');
    });

    // Etap Q, krok 1 — dawne auto-rozwinięcie materiałów grupy "bo dostała pierwszy moduł" jest
    // USUNIĘTE: panel materiałów zostaje zwinięty za gear-przyciskiem, niezależnie od tego, ile
    // modułów ma już grupa — trzeba go rozwinąć jawnie (klik na "⚙️ Materiały").
    it('adding the first module to a group does NOT auto-expand its material rows — stays behind the gear button', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      expect(materialsGearButton(KITCHEN_TOP)).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByLabelText(`Płyta korpusu — ${KITCHEN_TOP}`)).not.toBeInTheDocument();

      expandMaterials(KITCHEN_TOP);
      expect(boardField('Płyta korpusu', KITCHEN_TOP)).toBeInTheDocument();
    });

    it('the "⚙️ Materiały" gear shows a short decor-code hint ("W960 / U702") without expanding', () => {
      renderCalculator();
      expect(materialsGearButton(KITCHEN_BOTTOM)).toHaveTextContent('W960');
      expect(materialsGearButton(KITCHEN_BOTTOM)).toHaveTextContent('U702');
    });

    it('two groups with different front materials produce two separate "Płyta frontu" rows, aggregated by actual material', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // Szafki dolne, front = U702 ST9 Kaszmir (domyślny)
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)'); // Szafki górne, własne materiały domyślnie
      expandMaterials(KITCHEN_TOP);

      pickMaterial(`Płyta frontu — ${KITCHEN_TOP}`, 'U960 SM Dąb Sonoma');

      const kaszmirRow = rowByMaterialName('U702 ST9 Kaszmir');
      const sonomaRow = rowByMaterialName('U960 SM Dąb Sonoma');
      expect(kaszmirRow).toHaveTextContent('Płyta frontu');
      expect(sonomaRow).toHaveTextContent('Płyta frontu');
      expect(kaszmirRow).not.toBe(sonomaRow);
    });

    it('"Korpus z płyty frontowej" on a GROUP routes ALL its modules\' body area into front, live', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      expandMaterials(KITCHEN_BOTTOM);
      const frontBefore = rowByMaterialName('U702 ST9 Kaszmir').textContent;

      fireEvent.click(screen.getByLabelText('Korpus z płyty frontowej — ⬇️ Szafki dolne'));

      // Wiersz grupy nadal POKAZUJE "PL W960 SM Biały" (to wciąż jej "Płyta korpusu") — ale ten
      // materiał nie ma już ŻADNEGO wiersza w tabeli kalkulacji (area=0, przefiltrowane).
      expect(rowByMaterialName('PL W960 SM Biały')).toBeUndefined();
      const frontAfter = rowByMaterialName('U702 ST9 Kaszmir').textContent;
      expect(frontAfter).not.toBe(frontBefore);
    });

    it('"Obrzeże korpusu w kolorze frontu" on a group merges that group\'s body edge into the front edge row', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      expandMaterials(KITCHEN_BOTTOM);
      expect(rowByMaterialName('ABS W960 SM Biały')).toBeTruthy();
      const frontBefore = rowByMaterialName('ABS U702 ST9 Kaszmir').textContent;

      fireEvent.click(screen.getByLabelText('Obrzeże korpusu w kolorze frontu — ⬇️ Szafki dolne'));

      expect(rowByMaterialName('ABS W960 SM Biały')).toBeUndefined();
      const frontAfter = rowByMaterialName('ABS U702 ST9 Kaszmir').textContent;
      expect(frontAfter).not.toBe(frontBefore);
    });

    it('Blat (kitchen_countertop) only has a single "Blat" material field, no korpus/front/obrzeże/inherit', () => {
      renderCalculator();
      expandMaterials('🪵 Blat');
      expect(screen.getByLabelText('Blat')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Płyta korpusu — 🪵 Blat/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Materiały grupy:')).not.toBeInTheDocument();
    });
  });

  // Etap I, krok 2 — dziedziczenie materiałów między grupami kuchennymi.
  describe('dziedziczenie "Materiały grupy" (Etap I, krok 2)', () => {
    it('Szafki górne default to "Własne materiały" (own rows visible, no inherit from dolne)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      expandMaterials(KITCHEN_TOP);
      expect(screen.getByLabelText(`Materiały grupy: — ${KITCHEN_TOP}`)).toHaveValue('own');
      expect(boardField('Płyta frontu', KITCHEN_TOP)).toBeInTheDocument();
    });

    it('Antresole/Słupki default to "Jak w: Szafki dolne" — own rows hidden, material resolves to Szafki dolne\'s', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // front dolnych = U702 ST9 Kaszmir
      addModuleInGroup(KITCHEN_TALL, 'Z półkami');
      expandMaterials(KITCHEN_TALL);

      expect(screen.getByLabelText(`Materiały grupy: — ${KITCHEN_TALL}`)).toHaveValue('dolne');
      expect(screen.queryByLabelText(`Płyta frontu — ${KITCHEN_TALL}`)).not.toBeInTheDocument();
      // Jeden wspólny wiersz frontu (ta sama płyta co "Szafki dolne"), nie dwa osobne.
      expect(screen.getAllByText('U702 ST9 Kaszmir').length).toBeGreaterThanOrEqual(1);
    });

    it('switching inherit to "Jak w: Szafki górne" re-resolves the material to the upper group\'s own choice', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      expandMaterials(KITCHEN_TOP);
      pickMaterial(`Płyta frontu — ${KITCHEN_TOP}`, 'U960 SM Dąb Sonoma');
      addModuleInGroup(KITCHEN_MEZZANINE, 'Klapa pod sufit');
      expandMaterials(KITCHEN_MEZZANINE);

      fireEvent.change(screen.getByLabelText(`Materiały grupy: — ${KITCHEN_MEZZANINE}`), { target: { value: 'gorne' } });

      expect(screen.getAllByText('U960 SM Dąb Sonoma').length).toBeGreaterThanOrEqual(1);
    });

    it('switching inherit to "Własne materiały" reveals that group\'s own 4 rows again', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Z półkami');
      expandMaterials(KITCHEN_TALL);
      expect(screen.queryByLabelText(`Płyta korpusu — ${KITCHEN_TALL}`)).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(`Materiały grupy: — ${KITCHEN_TALL}`), { target: { value: 'own' } });

      expect(boardField('Płyta korpusu', KITCHEN_TALL)).toBeInTheDocument();
    });
  });

  // Etap I, krok 4 — karta szafki straciła checkboxy materiałowe (teraz w nagłówku grupy) i
  // panel "🎨 Własne materiały szafki" (usunięty całkowicie) — zostają tylko pola konstrukcyjne.
  describe('zdekotorowana karta szafki (Etap I/J, krok 4)', () => {
    it('a door-bearing module card has no material checkboxes/override button, only HDF (and no drawer checkbox)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

      // Grupa (Szafki dolne) auto-rozwija się razem z dodaniem tego modułu i ma WŁASNE checkboxy
      // "Korpus/Obrzeże z płyty frontowej" w swoim nagłówku — scope'ujemy więc do samej KARTY
      // modułu (<li>), żeby nie złapać przypadkiem checkboxów grupy żyjących gdzie indziej w DOM.
      const row = moduleCardTitle('Z drzwiami').closest('tr');
      const card = within(row);
      expect(card.queryByLabelText('Korpus z płyty frontowej')).not.toBeInTheDocument();
      expect(card.queryByLabelText('Obrzeże korpusu w kolorze frontu')).not.toBeInTheDocument();
      expect(card.queryByLabelText(/Drugi kolor frontu/)).not.toBeInTheDocument();
      expect(card.queryByRole('button', { name: '🎨 Własne materiały szafki' })).not.toBeInTheDocument();
      expect(card.queryByLabelText('Typ szuflady zewn.')).not.toBeInTheDocument();

      openRowSettings(row); // Etap W, krok 2 — HDF żyje teraz w CabinetSettingsModal "⚙️"
      const modal = within(settingsModal());
      expect(modal.queryByLabelText('HDF wpuszczany')).toBeInTheDocument();
      expect(modal.queryByLabelText('Dodatkowa szuflada wewnętrzna')).not.toBeInTheDocument(); // base_doors nie ma szuflad
    });

    it('HDF wpuszczany defaults to checked on wall_cabinet/tall_cabinet/oven_cabinet, unchecked on base_doors', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      addModuleInGroup(KITCHEN_TALL, 'Z półkami');
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod piekarnik');

      // Etap W, krok 2 — tylko JEDEN CabinetSettingsModal może być otwarty naraz (globalny
      // `settingsModuleId`), więc sprawdzamy stan HDF jednego wiersza na raz, zamykając modal
      // (closeRowSettings) przed przejściem do następnego, zamiast otwierać wszystkie 4 naraz.
      const rows = [
        moduleCardTitle('Z drzwiami').closest('tr'),
        moduleCardTitle('Klasyczna (z drzwiami)').closest('tr'),
        moduleCardTitle('Z półkami').closest('tr'),
        moduleCardTitle('Pod piekarnik').closest('tr'),
      ];
      const expectedChecked = [false, true, true, true]; // base_doors, wall_cabinet, tall_cabinet, oven_cabinet

      rows.forEach((row, i) => {
        openRowSettings(row);
        const checkbox = within(settingsModal()).getByLabelText('HDF wpuszczany');
        if (expectedChecked[i]) expect(checkbox).toBeChecked();
        else expect(checkbox).not.toBeChecked();
        closeRowSettings();
      });
    });

    it('HDF wpuszczany does not appear at all on sink_cabinet/dishwasher_front/vanity_cabinet (no HDF concept)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');
      addModuleInGroup(KITCHEN_BOTTOM, 'Zabudowa zmywarki');
      // Oba popovery otwarte, PÓKI "Pod zlew"/"Zabudowa zmywarki" są jeszcze widoczne (wkładka
      // Kuchnia) — przełączenie kategorii niżej ukrywa ich wiersze całkowicie.
      openRowSettings(moduleCardTitle('Pod zlew').closest('tr'));
      openRowSettings(moduleCardTitle('Zabudowa zmywarki').closest('tr'));
      expect(screen.queryByLabelText('HDF wpuszczany')).not.toBeInTheDocument();

      switchCategory(BATHROOM_GROUP);
      fireEvent.click(roleButton('Szafka pod umywalkę (podwieszana)'));
      openRowSettings(moduleCardTitle('Szafka pod umywalkę (podwieszana)').closest('tr'));
      expect(screen.queryByLabelText('HDF wpuszczany')).not.toBeInTheDocument();
    });

    it('"Dodatkowa szuflada wewnętrzna" toggles the internal drawer counters, same as before', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z szufladami');
      const row = moduleCardTitle('Z szufladami').closest('tr');
      openRowSettings(row);
      expect(screen.queryByLabelText('Wewn. wysokie (szt.)')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Dodatkowa szuflada wewnętrzna'));
      expect(screen.getByLabelText('Wewn. wysokie (szt.)')).toHaveValue(0);
      expect(screen.getByLabelText('Wewn. niskie (szt.)')).toHaveValue(1);
    });
  });

  // Etap I, krok 3 — wiele presetów dzieli jeden typ bazowy; karta musi pokazać etykietę PRESETU
  // (tego, co user kliknął), nie generyczną etykietę typu.
  describe('karta pokazuje etykietę PRESETU, nie generyczną etykietę typu (Etap I, krok 3)', () => {
    it('"Klapa pod sufit" and "Nad okap" are both wall_cabinet but show their own distinct label', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Nad okap');
      addModuleInGroup(KITCHEN_MEZZANINE, 'Klapa pod sufit');

      expect(moduleCardTitle('Nad okap')).toBeInTheDocument();
      expect(moduleCardTitle('Klapa pod sufit')).toBeInTheDocument();
      expect(moduleCardTitle('Klasyczna (z drzwiami)')).not.toBeInTheDocument(); // etykieta innego presetu, nigdy nie kliknięta
    });

    it('"Regał otwarty" (wardrobe_section) shows its own label, not the generic "Szafa / Garderoba"', () => {
      renderCalculator();
      switchCategory(WARDROBE_GROUP);
      fireEvent.click(roleButton('Regał otwarty'));
      expect(moduleCardTitle('Regał otwarty')).toBeInTheDocument();
    });
  });

  // Etap N, krok 4 — selekt "Otwieranie" (Uchwyt/Opuszczany front/TIP-ON/Profil HAFELE) zastąpiony
  // jedną galką "Opuszczany front (+20 mm)": osprzęt (uchwyt/TIP-ON/profil HAFELE/zawiasy/nogi) nie
  // ma już własnego wiersza w rozliczeniu (includeHardware:false).
  describe('checkbox "Opuszczany front (+20 mm)" (zamiast selecta Otwieranie) i brak osprzętu w rozliczeniu', () => {
    // Etap AD, krok 1 — zgłoszenie (fronty.jpg): checkbox żyje teraz WYŁĄCZNIE w Szafkach górnych
    // (kitchen_top) — "Z drzwiami" (kitchen_bottom) nie ma go już wcale, patrz test niżej.
    it('toggling "Opuszczany front (+20 mm)" changes the Front (m²) cell live (kitchen_top)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      const row = moduleCardTitle('Klasyczna (z drzwiami)').closest('tr');
      const before = row.querySelector('[data-label="Front (m²)"]').textContent;

      openRowSettings(row);
      fireEvent.click(screen.getByLabelText('Opuszczany front (+20 mm)'));

      const after = row.querySelector('[data-label="Front (m²)"]').textContent;
      expect(after).not.toBe(before);
    });

    it('wall_cabinet defaults to "Opuszczany front" checked (its own type default)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      openRowSettings(moduleCardTitle('Klasyczna (z drzwiami)').closest('tr'));
      expect(screen.getByLabelText('Opuszczany front (+20 mm)')).toBeChecked();
    });

    it('base_doors (kitchen_bottom, "Z drzwiami") nie ma już w ogóle checkboxa "Opuszczany front" (Etap AD, krok 1)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      expect(screen.queryByLabelText('Opuszczany front (+20 mm)')).not.toBeInTheDocument();
    });

    // Etap AA, krok 4 — nóżki (legFront/legRearAxilo) wróciły do rozliczenia jako "pierwszy etap"
    // powrotu osprzętu — zawiasy/zawieszki/uchwyty/TIP-ON/profil HAFELE zostają schowane dalej.
    it('zawiasy/zawieszki/uchwyty/TIP-ON/profil HAFELE nadal nie pojawiają się w rozliczeniu, ale nóżki TAK (Etap AA, krok 4)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));

      [
        "BLUM Zawias 110' nakładany ze spowalniaczem na wkręty 71B3550",
        "BLUM Zawias 110' nakładany ze sprężyną na wkręty 71T3550",
        'ZAWIESZKA CAMAR 806 KPL',
        'TIP-ON STRONG IF BIAŁY MAGNES MOCNY',
        'Uchwyt GAMET meblowy 128mm',
        'Profil HAFELE aluminiowy',
      ].forEach((name) => {
        expect(screen.queryByText(name)).not.toBeInTheDocument();
      });
      // Płyta/kromka/HDF zostają — i TERAZ też nóżki (pierwszy etap powrotu osprzętu).
      expect(screen.getByText('HDF BIAŁY 2850x2070x3mm')).toBeInTheDocument();
      expect(screen.getByText('Nogi zwykłe')).toBeInTheDocument();
      expect(screen.getByText('Nóżka Axilo HAFELE H-100 mm')).toBeInTheDocument();
    });

    // Etap AC, krok 2 — zgłoszenie (Screenshot_2_3.jpg/Screenshot_1_3.jpg): katalog usera nie ma ani
    // jednej pozycji z dosłownym "nogi zwykłe"/"axilo" w nazwie -> auto-wybór dla roli nóżek spadał
    // na CAŁĄ, niefiltrowaną listę materiałów i "wygrywał" zawias (pierwszy alfabetycznie). Fixture
    // niżej ma TYLKO 1 zawias ("Blum CLIP top BLUMOTION...") i 1 nóżkę bez literalnego trafienia w
    // hint ("Nóżka meblowa cokołowa...") — dokładnie ten scenariusz, bez żadnej innej pozycji, która
    // mogłaby przypadkiem "zasłonić" wynik.
    it('"Nogi przednie (zwykłe)" i "Nogi tylne (Axilo)" nigdy nie podstawiają zawiasu, nawet gdy katalog nie ma pozycji z dosłownym "nogi zwykłe"/"axilo" w nazwie (Etap AC, krok 2)', () => {
      const noLiteralLegMatchMaterials = [
        { id: 'm-hinge-only', name: 'Blum CLIP top BLUMOTION — zawias 110° nakładany', category: 'Zawiasy', price: 12 },
        { id: 'm-leg-generic', name: 'Nóżka meblowa cokołowa H=100mm', category: 'Akcesoria', price: 1 },
      ];
      renderCalculator({ materials: noLiteralLegMatchMaterials });
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

      // Zawias wciąż jest WIDOCZNY gdzie indziej (Blok 1 — osobny wybór konstrukcyjny, poza tym
      // testem) — liczy się tylko to, co trafia w wiersz "Wybrany materiał" DLA roli nóżek.
      const legFrontRow = screen.getByText('Nogi przednie (zwykłe)').closest('tr');
      const legRearRow = screen.getByText('Nogi tylne (Axilo)').closest('tr');
      [legFrontRow, legRearRow].forEach((row) => {
        expect(within(row).queryByText('Blum CLIP top BLUMOTION — zawias 110° nakładany')).not.toBeInTheDocument();
        expect(within(row).getByText('Nóżka meblowa cokołowa H=100mm')).toBeInTheDocument();
      });
    });
  });

  // Etap N, krok 4 — szuflady (MERIVOBOX i inne prowadnice) nie mają już własnej roli materiałowej
  // w tabeli kalkulacji (includeHardware:false, patrz jądro) — tylko GEOMETRIA (liczniki Wysokie/
  // Niskie w kolumnie "Konstrukcja / Szuflady") zostaje widoczna i testowalna na tym poziomie.
  describe('"Układ szuflad" — presety i ręczne liczniki Wysokie/Niskie (geometria)', () => {
    it('domyślnie "2 wysokie + 1 niska"; ręczne liczniki Wysokie/Niskie pojawiają się tylko po wyborze "Własny układ"', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z szufladami');
      openRowSettings(moduleCardTitle('Z szufladami').closest('tr'));

      // base_drawers domyślnie: 2 wysokie + 1 niska (standardowa tumba od razu z mieszanymi wysokościami).
      expect(screen.getByLabelText('Układ szuflad zewnętrznych')).toHaveValue('2_wysokie_1_niska');
      expect(screen.queryByLabelText('Szuflady wysokie (szt.)')).not.toBeInTheDocument();

      // "Własny układ..." odkrywa ręczne liczniki Wysokie/Niskie (przejmują ostatnie wartości presetu: 2/1).
      fireEvent.change(screen.getByLabelText('Układ szuflad zewnętrznych'), { target: { value: 'wlasny' } });
      expect(screen.getByLabelText('Szuflady wysokie (szt.)')).toHaveValue(2);
      expect(screen.getByLabelText('Szuflady niskie (szt.)')).toHaveValue(1);
      fireEvent.change(screen.getByLabelText('Szuflady wysokie (szt.)'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('Szuflady niskie (szt.)'), { target: { value: '0' } });
      expect(screen.getByLabelText('Szuflady wysokie (szt.)')).toHaveValue(3);
      expect(screen.getByLabelText('Szuflady niskie (szt.)')).toHaveValue(0);

      fireEvent.click(screen.getByLabelText('Dodatkowa szuflada wewnętrzna'));
      expect(screen.getByLabelText('Wewn. wysokie (szt.)')).toHaveValue(0);
      expect(screen.getByLabelText('Wewn. niskie (szt.)')).toHaveValue(1);
    });
  });

  // Etap C — bug krytyczny #1 (ADR-010): PostgREST serializuje materials.id jako JS number, a
  // <select onChange> daje zawsze string. Te fixture'y UMYŚLNIE używają numerycznych id (jak
  // prawdziwy Postgres), żeby odtworzyć realny bug — testujemy teraz przez rolę GRUPY (boards),
  // nie przez dawną globalną rolę `selection.bodyMaterial`.
  describe('Numeryczne id materiałów (jak Postgres) — nigdy "— nie wybrano —" / 0.00 zł, gdy select pokazuje materiał', () => {
    const numericIdMaterials = [
      { id: 101, name: 'PL W960 SM Biały', category: 'Płyta', price: 180 },
      { id: 102, name: 'U702 ST9 Kaszmir', category: 'Płyta', price: 220 },
      { id: 201, name: 'ABS W960 SM Biały', category: 'Obrzeże', price: 1.13 },
      { id: 202, name: 'ABS U702 ST9 Kaszmir', category: 'Obrzeże', price: 4.2 },
      { id: 301, name: 'BLUM Zawias 110°', category: 'Zawiasy', price: 6 },
      { id: 401, name: 'Nogi zwykłe', category: 'Akcesoria', price: 1 },
      { id: 402, name: 'Nóżka Axilo HAFELE H-100 mm', category: 'Akcesoria', price: 4.19 },
      { id: 501, name: 'HDF BIAŁY 2850x2070x3mm', category: 'HDF', price: 56.73 },
      { id: 601, name: 'Blum Tandem L-500', category: 'Prowadnice', price: 45 },
    ];

    const addDoorsModule = () => addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

    it('fresh project (no calculator_state yet): Płyta korpusu/frontu i Obrzeże są realnymi, niezerowymi pozycjami', () => {
      renderCalculator({ materials: numericIdMaterials });
      addDoorsModule();
      expect(screen.queryByText('— nie wybrano —')).not.toBeInTheDocument();
      expect(rowByMaterialName('PL W960 SM Biały')).toHaveTextContent('180.00');
      expect(rowByMaterialName('U702 ST9 Kaszmir')).toHaveTextContent('220.00');
      expect(rowByMaterialName('ABS W960 SM Biały')).toHaveTextContent('1.13');
    });

    it('a saved calculator_state with the group\'s id as a STRING ("101") still resolves to the real numeric material (101)', () => {
      renderCalculator({
        materials: numericIdMaterials,
        initialState: { modules: [], selection: {}, boards: { kitchen_bottom: { bodyMaterialId: '101' } } },
      });
      expandGroup(KITCHEN_BOTTOM);
      expect(boardField('Płyta korpusu', KITCHEN_BOTTOM)).toHaveTextContent('PL W960 SM Biały');
      addDoorsModule();
      expect(rowByMaterialName('PL W960 SM Biały')).toHaveTextContent('180.00'); // nie 0.00 zł
    });

    it('a saved calculator_state pointing at a material id that no longer exists in the catalog forces a real fallback, not "— nie wybrano —"', () => {
      renderCalculator({
        materials: numericIdMaterials,
        initialState: { modules: [], selection: {}, boards: { kitchen_bottom: { bodyMaterialId: 999999, edgeMaterialFrontId: 999999 } } },
      });
      addDoorsModule();
      expect(screen.queryByText('— nie wybrano —')).not.toBeInTheDocument();
      expandGroup(KITCHEN_BOTTOM);
      const bodyTrigger = boardField('Płyta korpusu', KITCHEN_BOTTOM);
      expect(bodyTrigger).not.toHaveTextContent('— nie wybrano —');
      expect(bodyTrigger).toHaveTextContent(/zł/);
    });

    it('an explicitly cleared OPTIONAL role (countertop="") stays blank — it is not a stale id to repair', () => {
      renderCalculator({
        materials: numericIdMaterials,
        initialState: { modules: [], selection: { countertop: '' } },
      });
      fireEvent.click(roleButton('Blat'));
      expandGroup('🪵 Blat');
      // "Blat" to wciąż JEDNA globalna rola, widoczna i w nagłówku grupy (emptyLabel: "Domyślna z
      // projektu"), i w wierszu tabeli (domyślny placeholder "— nie wybrano —") — oba miejsca
      // muszą zgodnie pokazać PUSTĄ wartość, każde swoim własnym tekstem dla tego stanu.
      const blatSelects = screen.getAllByLabelText('Blat');
      expect(blatSelects.length).toBeGreaterThanOrEqual(1);
      blatSelects.forEach(select => expect(select).toHaveTextContent(/^(— nie wybrano —|Domyślna z projektu)/));
    });
  });

  // Etap H, krok 3 / Etap I, krok 3 — 4 nowe typy kuchenne + vanity_cabinet (Łazienka).
  describe('nowe typy modułów', () => {
    it('all 4 new kitchen add-buttons exist and add a module with a frontLine on click', () => {
      renderCalculator();
      ['Pod piekarnik', 'Pod zlew', 'Zabudowa zmywarki', 'Narożna zaślepiona'].forEach((caption) => {
        addModuleInGroup(KITCHEN_BOTTOM, caption);
      });
      expect(moduleCardTitle('Pod piekarnik')).toBeInTheDocument();
      expect(moduleCardTitle('Pod zlew')).toBeInTheDocument();
      expect(moduleCardTitle('Zabudowa zmywarki')).toBeInTheDocument();
      expect(moduleCardTitle('Narożna zaślepiona')).toBeInTheDocument();
    });

    it('oven_cabinet shows an "Układ szuflad" (1 niska domyślnie) but no front-flap checkbox/"Drzwi" field', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod piekarnik');
      openRowSettings(moduleCardTitle('Pod piekarnik').closest('tr'));
      expect(screen.getByLabelText('Układ szuflad zewnętrznych')).toBeInTheDocument();
      expect(screen.queryByLabelText('Opuszczany front (+20 mm)')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Drzwi')).not.toBeInTheDocument();
    });

    // Etap AD, krok 1 — zgłoszenie (fronty.jpg): "Opuszczany front" zniknęło z kitchen_bottom
    // (sink_cabinet/dishwasher_front nie są Szafkami górnymi) — zostaje tylko brak "Układ szuflad"/
    // "Półki", jak dawniej.
    it('sink_cabinet/dishwasher_front nie mają już checkboxa "Opuszczany front" (kitchen_bottom), ani "Układ szuflad"/"Półki"', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');
      addModuleInGroup(KITCHEN_BOTTOM, 'Zabudowa zmywarki');

      // Etap W, krok 2 — tylko JEDEN CabinetSettingsModal naraz: sprawdzamy każdy wiersz po kolei
      // (zamiast otwierać oba i liczyć 2 checkboxy naraz, jak przy starym, per-wierszowym popoverze).
      [moduleCardTitle('Pod zlew').closest('tr'), moduleCardTitle('Zabudowa zmywarki').closest('tr')].forEach((row) => {
        openRowSettings(row);
        const modal = within(settingsModal());
        expect(modal.queryByLabelText('Opuszczany front (+20 mm)')).not.toBeInTheDocument();
        expect(modal.queryByLabelText('Układ szuflad zewnętrznych')).not.toBeInTheDocument();
        expect(modal.queryByLabelText('Liczba półek')).not.toBeInTheDocument();
        closeRowSettings();
      });
    });

    it('corner_blind_cabinet shows a "Szer. frontu (mm)" input, defaulting to 450', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Narożna zaślepiona');
      openRowSettings(moduleCardTitle('Narożna zaślepiona').closest('tr'));
      expect(screen.getByLabelText('Szerokość frontu (mm)')).toHaveValue(450);
    });

    it('dishwasher_front still counts as 1 front — shows a single, non-zero Front (m²) value', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Zabudowa zmywarki');
      const row = moduleCardTitle('Zabudowa zmywarki').closest('tr');
      expect(row.querySelector('[data-label="Front (m²)"]').textContent).toMatch(/^\d+\.\d{2}$/);
    });

    it('vanity_cabinet (Łazienka) has a drawer preset and a "Dodatkowa szuflada wewnętrzna" checkbox, no HDF, no front-flap checkbox/"Drzwi"', () => {
      renderCalculator();
      switchCategory(BATHROOM_GROUP);
      fireEvent.click(roleButton('Szafka pod umywalkę (podwieszana)'));
      openRowSettings(moduleCardTitle('Szafka pod umywalkę (podwieszana)').closest('tr'));

      expect(screen.getByLabelText('Układ szuflad zewnętrznych')).toHaveValue('2_wysokie');
      expect(screen.queryByLabelText('HDF wpuszczany')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Opuszczany front (+20 mm)')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Drzwi')).not.toBeInTheDocument();
    });
  });

  // Etap J, krok 2 — kafelki "+ Dodaj moduł" mają teraz ikonę SVG + krótką podpis zamiast długiej
  // tekstowej pigułki; szczególnie dla Kuchni krótkie podpisy nie powtarzają już słowa z nazwy grupy.
  describe('krótkie podpisy kafelków dodawania (Etap J, krok 2)', () => {
    it('Szafki dolne pokazują 6 krótkich podpisów bez słów "Szafka"/"dolna"', () => {
      renderCalculator();
      const group = within(groupSectionFor(KITCHEN_BOTTOM));
      ['Z drzwiami', 'Z szufladami', 'Pod piekarnik', 'Pod zlew', 'Zabudowa zmywarki', 'Narożna zaślepiona'].forEach((caption) => {
        expect(group.getByRole('button', { name: caption, exact: true })).toBeInTheDocument();
      });
      expect(group.queryByText(/Szafka dolna/)).not.toBeInTheDocument();
    });

    it('Szafki górne use "Klasyczna (z drzwiami)"/"Nad okap", not "Szafka górna"/"Szafka nad okap"', () => {
      renderCalculator();
      const group = within(groupSectionFor(KITCHEN_TOP));
      expect(group.getByRole('button', { name: 'Klasyczna (z drzwiami)', exact: true })).toBeInTheDocument();
      expect(group.getByRole('button', { name: 'Nad okap', exact: true })).toBeInTheDocument();
      expect(group.queryByText('Szafka górna')).not.toBeInTheDocument();
    });

    it('Słupki use "Z półkami"/"Z szufladami", not "Słupek z półkami"/"Słupek z szufladami"', () => {
      renderCalculator();
      const group = within(groupSectionFor(KITCHEN_TALL));
      expect(group.getByRole('button', { name: 'Z półkami', exact: true })).toBeInTheDocument();
      expect(group.getByRole('button', { name: 'Z szufladami', exact: true })).toBeInTheDocument();
      expect(group.queryByText(/Słupek/)).not.toBeInTheDocument();
    });
  });

  // Etap N, krok 2 — panel wysokości kuchni rozbity na 3 obszary: Obszar zabudowy (ściana) /
  // Parametry szafek i blatu (w tym 4 edytowalne, rekomendowane wysokości jarusów) / Blendy i cokół.
  // Tylko pod wkładką Kuchnia.
  describe('panel wysokości kuchni w 3 obszarach (Etap N, krok 2)', () => {
    it('the gear hint ("⚙️ Wymiary ściany i wysokości") shows the live wall/ceiling/countertop numbers without expanding', () => {
      renderCalculator();
      expect(heightsGearButton()).toHaveTextContent('3000');
      expect(heightsGearButton()).toHaveTextContent('2600');
      expect(heightsGearButton()).toHaveTextContent('900');
      expect(screen.queryByLabelText('Szerokość ściany / zabudowy (mm)')).not.toBeInTheDocument();
    });

    it('Obszar 1 (zabudowa/ściana) shows Jarvis defaults and the "Zajęte" indicator', () => {
      renderCalculator();
      expandHeightsPanel();
      expect(screen.getByLabelText('Szerokość ściany / zabudowy (mm)')).toHaveValue(3000);
      expect(screen.getByLabelText('Wysokość sufitu (mm)')).toHaveValue(2600);
      expect(screen.getByLabelText('Pas roboczy / fartuch (mm)')).toHaveValue(600);
      expect(screen.getByText(/Zajęte \(ściana X\):/)).toHaveTextContent('Zajęte (ściana X): 0 / 3000 mm (zostało 3000 mm)');
    });

    it('Obszar 2 (szafki i blat) shows its 4 inputs and the 4 editable, computed tier heights', () => {
      renderCalculator();
      expandHeightsPanel();
      expect(screen.getByLabelText('Wysokość blatu (mm)')).toHaveValue(900);
      expect(screen.getByLabelText('Grubość blatu (mm)')).toHaveValue(38);
      expect(screen.getByLabelText('Głębokość blatu (mm)')).toHaveValue(600);
      expect(screen.getByLabelText('Wysokość nóżek / cokołu (mm)')).toHaveValue(105);

      // 900 - 38 - 105 = 757; bez antresoli: górne = 2600-20-900-600=1080, słupki = 2600-20-105=2475.
      expect(screen.getByLabelText('Wys. szafek dolnych (mm)')).toHaveValue(757);
      expect(screen.getByLabelText('Wys. szafek górnych (mm)')).toHaveValue(1080);
      expect(screen.getByLabelText('Wys. słupków (mm)')).toHaveValue(2475);
      expect(screen.getByLabelText('Wys. antresoli (mm)')).toHaveValue(400);
    });

    it('its gear button (and the panel behind it) is hidden outside the Kuchnia tab', () => {
      renderCalculator();
      expandHeightsPanel();
      expect(screen.getByLabelText('Wysokość sufitu (mm)')).toBeInTheDocument();

      switchCategory(WARDROBE_GROUP);

      expect(screen.queryByLabelText('Wysokość sufitu (mm)')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /⚙️ Wymiary ściany i wysokości/ })).not.toBeInTheDocument();
    });

    it('changing Wysokość blatu recomputes "Wys. szafek dolnych" live', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Wysokość blatu (mm)'), { target: { value: '920' } });
      // 920 - 38 - 105 = 777
      expect(screen.getByLabelText('Wys. szafek dolnych (mm)')).toHaveValue(777);
    });

    it('"Zajęte" indicator grows as modules are added to the busiest kitchen row', () => {
      renderCalculator();
      expandHeightsPanel();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // domyślna szerokość 600mm
      expect(screen.getByText(/Zajęte \(ściana X\):/)).toHaveTextContent('Zajęte (ściana X): 600 / 3000 mm (zostało 2400 mm)');
    });

    it('a newly added "Z drzwiami" (Szafki dolne) gets the computed bottomHeight, not a hardcoded 820', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      expect(readInlineNumber(screen, 'Wys. (mm)')).toContain('757');
    });

    it('"Nad okap" and "Nad słupkiem / lodówką" keep their OWN fixed height, unaffected by the panel', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Nad okap');
      addModuleInGroup(KITCHEN_MEZZANINE, 'Nad słupkiem / lodówką');
      const heightTriggers = screen.getAllByLabelText('Wys. (mm)');
      expect(heightTriggers[0]).toHaveTextContent('450');
      expect(heightTriggers[1]).toHaveTextContent('350');
    });

    // Etap O, krok 1 — reaktywna synchronizacja: zmiana Wysokość blatu natychmiast przelicza
    // WSZYSTKIE standardowe (bez customHeight) dodane szafki danego jarusu, bez klikania żadnego
    // przycisku — to był bug ze zgłoszenia (szczelina pod blatem po zmianie Wysokość blatu).
    it('changing Wysokość blatu automatically updates already-added cabinets, with no gap under the countertop', () => {
      renderCalculator();
      expandHeightsPanel();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // heightRole: bottom -> 757
      addModuleInGroup(KITCHEN_TOP, 'Nad okap'); // no heightRole -> stays 450

      fireEvent.change(screen.getByLabelText('Wysokość blatu (mm)'), { target: { value: '920' } }); // bottomHeight -> 777

      const heightTriggers = screen.getAllByLabelText('Wys. (mm)');
      expect(heightTriggers[0]).toHaveTextContent('777'); // bez klikania żadnego przycisku
      expect(heightTriggers[1]).toHaveTextContent('450'); // "Nad okap" nietknięte (brak heightRole)
    });

    it('manually editing "Wys. (mm)" locks that one cabinet (customHeight) — it stops following the panel, and "↺" resets it', () => {
      renderCalculator();
      expandHeightsPanel();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');
      const heightTriggers = () => screen.getAllByLabelText('Wys. (mm)');

      setInlineNumber(moduleCardTitle('Z drzwiami').closest('tr'), 'Wys. (mm)', '800');
      expect(heightTriggers()[0]).toHaveTextContent('800');

      // Zmiana blatu nadal automatycznie przelicza DRUGĄ, standardową szafkę...
      fireEvent.change(screen.getByLabelText('Wysokość blatu (mm)'), { target: { value: '920' } });
      expect(heightTriggers()[0]).toHaveTextContent('800'); // ...ale NIE tę zablokowaną ręcznie
      expect(heightTriggers()[1]).toHaveTextContent('777');

      fireEvent.click(screen.getByRole('button', { name: /Resetuj ręczną wysokość/ }));
      expect(heightTriggers()[0]).toHaveTextContent('777');
    });

    it('"↻ Resetuj ręczne wysokości do standardu" clears every manual lock at once', () => {
      renderCalculator();
      expandHeightsPanel();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');
      const rows = () => screen.getAllByRole('row').filter(row => within(row).queryByLabelText('Wys. (mm)'));
      setInlineNumber(rows()[0], 'Wys. (mm)', '800');
      setInlineNumber(rows()[1], 'Wys. (mm)', '820');

      fireEvent.click(screen.getByRole('button', { name: '↻ Resetuj ręczne wysokości do standardu' }));

      const heightTriggers = screen.getAllByLabelText('Wys. (mm)');
      expect(heightTriggers[0]).toHaveTextContent('757');
      expect(heightTriggers[1]).toHaveTextContent('757');
    });

    it('manually overriding "Wys. szafek dolnych" feeds that value into newly added modules', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Wys. szafek dolnych (mm)'), { target: { value: '700' } });
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      expect(readInlineNumber(screen, 'Wys. (mm)')).toContain('700');
    });

    // Etap O, krok 1 — dodanie PIERWSZEGO modułu do Antresole zmienia zalecaną wysokość górnych/
    // słupków (hasMezzanineModules) — już dodane standardowe szafki tych 2 jarusów muszą się
    // natychmiast skrócić, bez czekania na kolejną zmianę panelu.
    it('adding the first antresola module shortens already-added "Szafki górne"/"Słupki" cabinets live', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)'); // heightRole: wall, bez antresoli -> 1080
      expect(readInlineNumber(screen, 'Wys. (mm)')).toContain('1080');

      addModuleInGroup(KITCHEN_MEZZANINE, 'Klapa pod sufit'); // heightRole: mezzanine, dodaje się do grupy

      const wallCabinetHeight = screen.getAllByLabelText('Wys. (mm)')
        .find(trigger => trigger.textContent !== '400'); // odfiltruj samą antresolę (mezzanine -> 400)
      expect(wallCabinetHeight).toHaveTextContent('680'); // 1080 - 400 (wysokość antresoli)
    });
  });

  // Etap M, krok 2 — tabela zamiast siatki kart: 1 wiersz na szafkę, szapka kolumn 1x na grupę.
  describe('tabela dodanych szafek (Etap M, krok 2)', () => {
    it('shows one shared column header per group and a row per added module', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');

      // "Ilość"/"Konstrukcja / Szuflady"/"HDF" nie są już osobne kolumny (Etap Q, krok 4) — scalone
      // w ostatnią (bez nagłówka: "⚙️" + "×"). Etap U, krok 1 — tabela jest teraz JEDNA, WSPÓLNA dla
      // wszystkich grup naraz (patrz kitchenModuleTable) — ale "Ilość" scope'ujemy DALEJ do niej
      // samej, bo tabele "Materiały"/"Usługi" niżej w panelu MAJĄ własną kolumnę "Ilość".
      // Etap R, krok 1 — nagłówki SKRÓCONE (bez jednostek w SAMEJ etykiecie), żeby żaden się nie
      // obcinał wielokropkiem. Etap W, krok 1 — Korpus/Front/Obrzeże dostały jeszcze nieprzerwany
      // podtekst jednostki (.colUnit, "m²"/"mb") TUŻ pod etykietą — stąd dopasowanie z przodu
      // (`^Nazwa`), nie dokładne: pełna accessible name <th> to teraz "Korpusm²" itd.
      ['Moduł', 'Szer.', 'Wys.', 'Gł.', 'Korpus', 'Front', 'Obrzeże'].forEach((header) => {
        const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(screen.getByRole('columnheader', { name: new RegExp(`^${escaped}`) })).toBeInTheDocument();
      });
      const moduleTable = within(kitchenModuleTable());
      expect(moduleTable.queryByRole('columnheader', { name: 'Ilość' })).not.toBeInTheDocument();
      expect(moduleTable.queryByRole('columnheader', { name: 'Konstrukcja / Szuflady' })).not.toBeInTheDocument();
      expect(moduleTable.queryByRole('columnheader', { name: 'HDF', exact: true })).not.toBeInTheDocument();
      expect(moduleTable.queryByRole('columnheader', { name: 'Akcje' })).not.toBeInTheDocument();
      expect(moduleCardTitle('Z drzwiami').closest('tr')).toBeTruthy();
      expect(moduleCardTitle('Pod zlew').closest('tr')).toBeTruthy();
    });

    it('the "⚙️" settings popover shows no HDF checkbox for a type without the HDF concept (sink_cabinet)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');
      const row = moduleCardTitle('Pod zlew').closest('tr');
      openRowSettings(row);
      expect(within(row).queryByLabelText('HDF wpuszczany')).not.toBeInTheDocument();
    });

    // Etap P, krok 3 — "Zabudowa zmywarki" (dishwasher_front) nie ma drzwi/półek/szuflad, ale MA
    // sposób otwierania (ani żadne inne pole konstrukcyjne, kitchen_bottom nie dostaje już
    // "Opuszczany front" — Etap AD, krok 1) — jej popover "⚙️" nie ma więc w ogóle sekcji
    // "Konstrukcja i wypełnienie".
    it('the "⚙️" settings popover has NO "Konstrukcja i wypełnienie" section at all for Zabudowa zmywarki (kitchen_bottom, no construction fields left)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Zabudowa zmywarki');
      const row = moduleCardTitle('Zabudowa zmywarki').closest('tr');
      openRowSettings(row);
      const modal = within(settingsModal());
      expect(modal.queryByLabelText('Opuszczany front (+20 mm)')).not.toBeInTheDocument();
      expect(modal.queryByText('Konstrukcja i wypełnienie')).not.toBeInTheDocument();
      expect(modal.queryByLabelText('Drzwi')).not.toBeInTheDocument();
      expect(modal.queryByLabelText('Półki')).not.toBeInTheDocument();
    });

    // Blat (countertop) nie ma ŻADNEGO z pól konstrukcyjnych ani sposobu otwierania — jedyny typ,
    // którego komórka faktycznie zostaje "—".
    it('"Konstrukcja / Szuflady" shows "—" for a type with no construction fields at all (Blat)', () => {
      renderCalculator();
      fireEvent.click(roleButton('Blat'));
      const row = moduleCardTitle('Blat').closest('tr');
      expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    });

    it('removing a row via its × button removes exactly that module', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');

      fireEvent.click(screen.getByRole('button', { name: 'Usuń moduł Z drzwiami' }));

      expect(moduleCardTitle('Z drzwiami')).not.toBeInTheDocument();
      expect(moduleCardTitle('Pod zlew')).toBeInTheDocument();
    });
  });

  // Etap N, krok 3 — rysunek 2D elewacji ściany (WallElevationCanvas), tylko pod wkładką Kuchnia;
  // przestawianie myszką (Pointer Events) nie jest realistycznie symulowalne w jsdom (brak layoutu
  // SVG/getScreenCTM), więc tu testujemy TYLKO obecność rysunku + dostępną alternatywę klawiaturową
  // (strzałki ◀/▶ w tabeli, kolumna "Kolejność") — przeciąganie myszką/HTML5 DnD ma osobne testy e2e.
  describe('WallElevationCanvas — rysunek 2D ściany (Etap N, krok 3)', () => {
    it('is visible under Kuchnia and hidden under other categories', () => {
      renderCalculator();
      expect(screen.getByRole('img', { name: /Rysunek 2D elewacji/ })).toBeInTheDocument();

      switchCategory(WARDROBE_GROUP);
      expect(screen.queryByRole('img', { name: /Rysunek 2D elewacji/ })).not.toBeInTheDocument();
    });

    it('draws one rect per added cabinet, growing as modules are added', () => {
      renderCalculator();
      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const countBefore = canvas.querySelectorAll('rect').length;

      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

      expect(canvas.querySelectorAll('rect').length).toBeGreaterThan(countBefore);
    });

    // Etap O, krok 2 — gabaryty wprost na rysunku: pełna szerokość/wysokość i podświetlony wolny
    // odcinek ściany, widoczny wprost w pustej strefie. Etap Q, krok 3 (a) — ISO/ЕСКД: linie
    // wymiarowe niosą TYLKO liczby (bez "Szerokość ściany:"/"Zajęte:"/"Wolne:"/"mm" itd.).
    it('shows bare-number wall/ceiling dimension lines and a free-space badge, with no words on the drawing', () => {
      renderCalculator();
      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const texts = () => Array.from(canvas.querySelectorAll('text')).map(el => el.textContent);
      // Badge (patrz WallElevationCanvas.jsx) stawia `className` na <rect>, nie na otaczający <g> —
      // właściwy tekst plakietki żyje jako RODZEŃSTWO tego rect, nie jego potomek.
      const freeBadge = () => canvas.querySelector('[class*="freeBadge"]').closest('g').querySelector('text');

      expect(texts()).toContain('3000'); // szerokość ściany
      expect(texts()).toContain('2600'); // wysokość sufitu
      expect(freeBadge()).toHaveTextContent('3000'); // nic dodane -> cała ściana wolna
      expect(texts().some(t => /[A-Za-zążśźćłóęńŻŚŹĆŁÓĘŃ]/.test(t))).toBe(false); // żadnych słów/jednostek

      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // domyślna szerokość 600mm
      expect(texts()).toContain('600'); // zajęte
      expect(freeBadge()).toHaveTextContent('2400');
    });

    // Etap O, krok 1 — reaktywna wysokość widoczna też na SAMYM rysunku (nie tylko w tabeli): etykieta
    // "W×H" na szafce dolnej musi gonić żywą rekomendację po zmianie Wysokość blatu, bez żadnej akcji.
    it('the cabinet label on the drawing updates its height live, with no gap under the countertop', () => {
      renderCalculator();
      expandHeightsPanel();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      expect(canvas).toHaveTextContent('600×757');

      fireEvent.change(screen.getByLabelText('Wysokość blatu (mm)'), { target: { value: '981' } });

      expect(canvas).toHaveTextContent('600×838');
      expect(canvas).not.toHaveTextContent('600×757');
    });
  });

  // Etap O, krok 3 — przełącznik widoku (Widok X / Widok Y / Widok z góry) w nagłówku rysunku.
  describe('przełącznik widoku rysunku — Widok X / Widok Y / Widok z góry (Etap O, krok 3)', () => {
    it('defaults to Widok X and switches to Widok z góry / Widok Y on click', () => {
      renderCalculator();
      expect(screen.getByRole('button', { name: /Widok X/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('img', { name: /Rysunek 2D elewacji ściany X/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Widok z góry/ }));
      expect(screen.getByRole('img', { name: /Widok z góry/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Widok z góry/ })).toHaveAttribute('aria-pressed', 'true');

      // Prosty układ (domyślny) -> "Widok Y" to przekrój boczny, nie elewacja ściany Y.
      fireEvent.click(screen.getByRole('button', { name: /Widok Y/ }));
      expect(screen.getByRole('img', { name: /Przekrój boczny Y/ })).toBeInTheDocument();
    });
  });

  // Etap O, krok 3 — kuchnia narożna L: "Układ ścian", "Szerokość ściany Y" i przełącznik "Ściana:
  // X|Y" per szafka pojawiają się tylko po wybraniu układu narożnego.
  describe('kuchnia narożna L — Układ ścian i przełącznik "Ściana: X|Y" (Etap O, krok 3)', () => {
    it('"Szerokość ściany Y" and the per-row wall toggle are hidden for the default "Prosty" layout', () => {
      renderCalculator();
      expect(screen.queryByLabelText('Szerokość ściany Y (mm)')).not.toBeInTheDocument();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      expect(screen.queryByRole('button', { name: 'Y', exact: true })).not.toBeInTheDocument();
    });

    it('selecting "Narożny L" reveals "Szerokość ściany Y" and a "Zajęte (ściana Y)" badge', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Układ ścian'), { target: { value: 'corner_l' } });

      expect(screen.getByLabelText('Szerokość ściany Y (mm)')).toHaveValue(2200);
      expect(screen.getByText(/Zajęte \(ściana Y\):/)).toBeInTheDocument();
    });

    it('toggling a module to wall "Y" moves its width out of "Zajęte (ściana X)" and into "Zajęte (ściana Y)"', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Układ ścian'), { target: { value: 'corner_l' } });
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // domyślnie ściana X, 600mm

      expect(screen.getByText(/Zajęte \(ściana X\):/)).toHaveTextContent('Zajęte (ściana X): 600 / 3000 mm');
      expect(screen.getByText(/Zajęte \(ściana Y\):/)).toHaveTextContent(/Zajęte \(ściana Y\): 0 \//);

      const row = moduleCardTitle('Z drzwiami').closest('tr');
      fireEvent.click(within(row).getByRole('button', { name: 'Y', exact: true }));

      expect(screen.getByText(/Zajęte \(ściana X\):/)).toHaveTextContent('Zajęte (ściana X): 0 / 3000 mm');
      expect(screen.getByText(/Zajęte \(ściana Y\):/)).toHaveTextContent(/Zajęte \(ściana Y\): 600 \//);
    });

    // Etap P, krok 3 — kolumna "Ściana" jest DRUGĄ kolumną nagłówka (zaraz po "Moduł"), żeby
    // przynależność była widoczna bez przewijania w prawo.
    it('the "Ściana" column header is the 2nd column, right after "Moduł"', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Układ ścian'), { target: { value: 'corner_l' } });
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveTextContent('Moduł');
      expect(headers[1]).toHaveTextContent('Ściana');
    });

    // Etap P, krok 3 — grupowanie wierszy per ściana, z podnagłówkiem licznikowym.
    it('groups rows into "Ściana X" / "Ściana Y" blocks with a count+width subheader', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Układ ścian'), { target: { value: 'corner_l' } });
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // 600mm, ściana X (domyślnie)
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew'); // 600mm, ściana X (domyślnie)
      fireEvent.click(within(moduleCardTitle('Pod zlew').closest('tr')).getByRole('button', { name: 'Y', exact: true }));

      expect(screen.getByText(/📐 Ściana X — Główna \(1 szafka, zajęte 600 mm\)/)).toBeInTheDocument();
      expect(screen.getByText(/📐 Ściana Y — Boczna, lewa \(1 szafka, zajęte 600 mm\)/)).toBeInTheDocument();
    });

    // Etap P, krok 3 — "Widok Y" aktywny na rysunku -> klik na kafelku dodawania tworzy szafkę OD
    // RAZU na ścianie Y, bez potrzeby ręcznego przełączania jej w tabeli.
    it('clicking an add-module tile while "Widok Y" is active creates the cabinet on wall Y', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Układ ścian'), { target: { value: 'corner_l' } });
      fireEvent.click(screen.getByRole('button', { name: /Widok Y/ }));

      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

      const row = moduleCardTitle('Z drzwiami').closest('tr');
      expect(within(row).getByRole('button', { name: 'Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(/Zajęte \(ściana Y\):/)).toHaveTextContent('Zajęte (ściana Y): 600');
    });

    // Etap P, krok 3 — przeciwny przypadek: "Widok X" (domyślny) aktywny -> klik na kafelku tworzy
    // szafkę na ścianie X, jak dotychczas.
    it('clicking an add-module tile while "Widok X" is active creates the cabinet on wall X', () => {
      renderCalculator();
      expandHeightsPanel();
      fireEvent.change(screen.getByLabelText('Układ ścian'), { target: { value: 'corner_l' } });

      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

      const row = moduleCardTitle('Z drzwiami').closest('tr');
      expect(within(row).getByRole('button', { name: 'X', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // Etap P, krok 3 — brak obcinania prawej krawędzi tabeli: dawna osobna kolumna "Front" (1 checkbox)
  // zniknęła (dołączona do "Konstrukcja / Szuflady"), table-layout: fixed + kolumny w % (sumujące
  // się do 100) gwarantują, że Front (m²)/Obrzeże (mb)/Kolejność zawsze zostają w DOM-ie, widoczne.
  describe('tabela szafek nie obcina prawej krawędzi (Etap P, krok 3)', () => {
    it('"Front (m²)" and "Obrzeże (mb)" cells are always present and never clipped out of the row', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const row = moduleCardTitle('Z drzwiami').closest('tr');

      expect(row.querySelector('[data-label="Front (m²)"]')).toBeInTheDocument();
      expect(row.querySelector('[data-label="Obrzeże (mb)"]')).toBeInTheDocument();
      expect(row.querySelector('[data-label="Akcje"]')).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: /Usuń moduł/ })).toBeInTheDocument();
    });
  });

  // Etap P, krok 2 — 4 wiersze materiału grupy (Płyta korpusu/frontu, Obrzeże korpusu/frontu)
  // dostają TĘ SAMĄ siatkę kolumn (ołówek/etykieta/wartość/kopiuj) — kolumna etykiety renderuje się
  // ZAWSZE (nawet pusta), żeby grid-template-columns nigdy nie przesunął wartości materiału.
  describe('wyrównanie 4 wierszy materiału grupy w siatce (Etap P, krok 2)', () => {
    it('each of the 4 board-field rows renders a dedicated label cell, consistently, even before any value is hovered', () => {
      renderCalculator();
      expandGroup(KITCHEN_BOTTOM);

      ['Płyta korpusu', 'Płyta frontu', 'Obrzeże korpusu', 'Obrzeże frontu'].forEach((fieldLabel) => {
        const trigger = boardField(fieldLabel, KITCHEN_BOTTOM);
        const labelSpan = trigger.querySelector('[class*="compactLabel"]');
        expect(labelSpan).toBeInTheDocument();
        expect(labelSpan).toHaveTextContent(`${fieldLabel}:`);
      });
    });
  });

  // Etap P, krok 1 — podpisy na rysunku SVG dostają pogrubienie (font-weight: 600) i stały rozmiar w
  // px (patrz makePxToMm w WallElevationCanvas.jsx) — nie da się w pełni zweryfikować realnych
  // pikseli w jsdom (brak layoutu SVG), ale pogrubienie jest sprawdzalnym, trwałym śladem poprawki.
  describe('czytelność podpisów na rysunku SVG (Etap P, krok 1)', () => {
    it('dimension labels render bold (font-weight 600) for readability', () => {
      renderCalculator();
      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      // Pierwsza linia wymiarowa (dimensionLine) w kolejności DOM to "Szerokość ściany" (3000) —
      // getByText('3000') byłby niejednoznaczny: plakietka "Wolne" pokazuje tę samą wartość, kiedy
      // nic nie jest jeszcze dodane do ściany.
      const label = canvas.querySelector('[class*="dimensionLine"] text');
      expect(label).toHaveTextContent('3000');
      expect(label).toHaveAttribute('font-weight', '600');
    });

    it('the overflow/free-space callout renders as an opaque badge, not translucent text over the wall', () => {
      renderCalculator();
      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const badgeRect = canvas.querySelector('[class*="freeBadge"]');
      expect(badgeRect).toBeInTheDocument();
      expect(badgeRect.closest('g').querySelector('text')).toHaveTextContent('3000');
    });
  });

  // Etap AB, krok 4 — zgłoszenie (zmywarka.jpg): "◀ Przesuń w lewo"/"Przesuń w prawo ▶" usunięte z
  // footera CabinetSettingsModal (nieużywane) — w kuchni przestawianie żyje teraz WYŁĄCZNIE na
  // rysunku (drag&drop, WallElevationCanvas), nietestowalne w jsdom (patrz nagłówek
  // cabinet-calculator-elevation-canvas.spec.js) — stąd testy reorderowania UI żyją TAM
  // ("dragging a cabinet with the mouse..."), nie tutaj. Sama logika (reorderItems/layoutFloorBand/
  // leftTallOffsetMm) ma własne testy jednostkowe w cabinetCalculator.test.js, niezależne od tego,
  // PRZEZ JAKI przycisk UI została wywołana.

  // Etap Q, krok 2 — blendy/cokół PRZESTAŁY być osobnym panelem "Blendy i cokół" (computeTrims,
  // usunięte) i są teraz ZWYKŁYMI modułami (side_filler/top_filler/plinth_strip), dodawanymi jak
  // każda inna szafka — ich m²/mb trafia do TYCH SAMYCH wierszy Płyty/Obrzeża korpusu/frontu
  // grupy, bo przechodzą przez TEN SAM effectiveModules/summarizeCabinetModules co reszta.
  describe('blendy i cokół jako zwykłe moduły — side_filler/top_filler/plinth_strip (Etap Q, krok 2)', () => {
    it('"Blenda boczna" is addable to Szafki górne and grows its existing front board row', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      const before = rowByMaterialName('U702 ST9 Kaszmir').textContent;

      addModuleInGroup(KITCHEN_TOP, 'Blenda boczna');

      expect(moduleCardTitle('Blenda boczna')).toBeInTheDocument();
      const after = rowByMaterialName('U702 ST9 Kaszmir').textContent;
      expect(after).not.toBe(before);
    });

    it('"Blenda górna" is addable to Szafki górne, even with 0 other modules, and gets its own front board row', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Blenda górna');
      expect(moduleCardTitle('Blenda górna')).toBeInTheDocument();
      expect(rowByMaterialName('U702 ST9 Kaszmir')).toBeTruthy();
    });

    it('"Cokół" defaults its board area to the Szafki dolne body row (PL W960 SM Biały)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const before = rowByMaterialName('PL W960 SM Biały').textContent;

      addModuleInGroup(KITCHEN_BOTTOM, 'Cokół');

      const after = rowByMaterialName('PL W960 SM Biały').textContent;
      expect(after).not.toBe(before);
    });

    it('switching a "Cokół" row\'s source to "z płyty frontu" routes its area into the front row instead of the body row', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const bodyBefore = rowByMaterialName('PL W960 SM Biały').textContent;

      addModuleInGroup(KITCHEN_BOTTOM, 'Cokół'); // domyślnie source: 'body' -> body area rośnie
      expect(rowByMaterialName('PL W960 SM Biały').textContent).not.toBe(bodyBefore);

      const row = moduleCardTitle('Cokół').closest('tr');
      openRowSettings(row);
      fireEvent.change(within(settingsModal()).getByLabelText('Cokół — źródło płyty'), { target: { value: 'front' } });

      const bodyAfter = rowByMaterialName('PL W960 SM Biały').textContent;
      expect(bodyAfter).toBe(bodyBefore); // cokół poszedł do frontu, nie do korpusu — body wraca do punktu wyjścia
    });

    // Etap Q, krok 2 — "Cokół" nie ma sensownego STATYCZNEGO domyślnego W: klik liczy na bieżąco
    // sumę szerokości modułów już dodanych do tego rzędu (2400mm to tylko fallback dla pustego rzędu).
    it('clicking "Cokół" with an empty Szafki dolne row falls back to the static 2400mm default width', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Cokół');
      const row = moduleCardTitle('Cokół').closest('tr');
      expect(readInlineNumber(row, 'Szer. (mm)')).toContain('2400');
    });

    it('clicking "Cokół" after a 600mm cabinet is already in the row picks up that row\'s current width (600mm), not the static default', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // domyślna szerokość 600mm
      addModuleInGroup(KITCHEN_BOTTOM, 'Cokół');
      const row = moduleCardTitle('Cokół').closest('tr');
      expect(readInlineNumber(row, 'Szer. (mm)')).toContain('600');
    });
  });

  // Etap R — czytelność palety/szapki, klik-do-edycji Szer./Wys./Gł., ◀▶ na początku wiersza,
  // prawa strona tylko "⚙️"/"×" (⧉ Duplikuj przeniesiony do popoveru).
  describe('klik-do-edycji rozmiarów i uporządkowanie wiersza (Etap R)', () => {
    it('Szer./Wys./Gł. show a plain "600"-style number by default (no pencil icon, no always-visible <input>)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const row = moduleCardTitle('Z drzwiami').closest('tr');
      const trigger = within(row).getByLabelText('Szer. (mm)');
      expect(trigger.tagName).not.toBe('INPUT');
      // Etap W, krok 1 — stały "✎" usunięty (rozpychał rząd); samo "to jest klikalne" zostaje jako
      // przerywane podkreślenie na hover/focus (CSS, patrz .inlineEditTrigger:hover .inlineEditValue).
      expect(trigger).not.toHaveTextContent('✎');
      expect(trigger).toHaveTextContent('600');
    });

    it('clicking the "600" trigger reveals an editable input, focused with its text selected; Enter commits the new value', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const row = moduleCardTitle('Z drzwiami').closest('tr');

      fireEvent.click(within(row).getByLabelText('Szer. (mm)'));
      const input = within(row).getByLabelText('Szer. (mm)');
      expect(input.tagName).toBe('INPUT');
      expect(input).toHaveFocus();

      fireEvent.change(input, { target: { value: '650' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      const triggerAfter = within(row).getByLabelText('Szer. (mm)');
      expect(triggerAfter.tagName).not.toBe('INPUT');
      expect(triggerAfter).toHaveTextContent('650');
    });

    it('Escape cancels the edit and reverts to the original value, without committing the draft', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const row = moduleCardTitle('Z drzwiami').closest('tr');

      fireEvent.click(within(row).getByLabelText('Szer. (mm)'));
      const input = within(row).getByLabelText('Szer. (mm)');
      fireEvent.change(input, { target: { value: '999' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      const triggerAfter = within(row).getByLabelText('Szer. (mm)');
      expect(triggerAfter.tagName).not.toBe('INPUT');
      expect(triggerAfter).toHaveTextContent('600'); // nie 999 — szkic porzucony
    });

    it('blur (not just Enter) also commits the new value', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const row = moduleCardTitle('Z drzwiami').closest('tr');
      setInlineNumber(row, 'Gł. (mm)', '480');
      expect(readInlineNumber(row, 'Gł. (mm)')).toContain('480');
    });

    it('the right side of the row has ONLY "⚙️" and "×" — no visible text tail on the gear, no standalone "⧉"/◀▶ buttons there', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z szufladami'); // ma niepusty summary ("2W+1N") w poprzedniej wersji
      const row = moduleCardTitle('Z szufladami').closest('tr');
      const actionsCell = row.querySelector('[data-label="Akcje"]');
      const buttons = within(actionsCell).getAllByRole('button');
      expect(buttons).toHaveLength(2); // tylko ⚙️ i ×
      const gearButton = within(actionsCell).getByRole('button', { name: /^Konstrukcja, szuflady/ });
      expect(gearButton).toHaveTextContent('⚙️');
      expect(gearButton.textContent.trim()).toBe('⚙️'); // żadnego tekstowego ogona typu "2W+1N"
      expect(within(actionsCell).queryByRole('button', { name: /^Duplikuj moduł/ })).not.toBeInTheDocument();
    });

    it('"⧉ Duplikuj szafkę" lives inside the "⚙️" popover (hidden until opened) and duplicates the row', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const row = moduleCardTitle('Z drzwiami').closest('tr');
      expect(screen.queryByRole('button', { name: /^Duplikuj moduł/ })).not.toBeInTheDocument();

      openRowSettings(row);
      const modal = within(settingsModal());
      expect(modal.getByRole('button', { name: /^Duplikuj moduł/ })).toBeInTheDocument();

      expect(groupRowsFor(KITCHEN_BOTTOM)).toHaveLength(1);
      fireEvent.click(modal.getByRole('button', { name: /^Duplikuj moduł/ }));
      expect(groupRowsFor(KITCHEN_BOTTOM)).toHaveLength(2);
    });

    // Etap R, krok 3 — Duplikuj musi być dostępny dla KAŻDEGO typu, więc "⚙️" renderuje się ZAWSZE
    // teraz, nawet dla Blat (countertop), który nie ma żadnych pól konstrukcyjnych/HDF.
    it('the "⚙️" gear still renders for a type with no construction fields at all (Blat), so "Duplikuj" stays reachable', () => {
      renderCalculator();
      fireEvent.click(roleButton('Blat'));
      const row = moduleCardTitle('Blat').closest('tr');
      const gearButton = within(row).getByRole('button', { name: /^Konstrukcja, szuflady/ });
      fireEvent.click(gearButton);
      expect(within(settingsModal()).getByRole('button', { name: /^Duplikuj moduł/ })).toBeInTheDocument();
    });

    it('column headers are shortened (no units) so none of them truncate: "Szer.", "Wys.", "Gł.", "Korpus", "Front", "Obrzeże"', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      ['Szer.', 'Wys.', 'Gł.', 'Korpus', 'Front', 'Obrzeże'].forEach((header) => {
        const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(screen.getByRole('columnheader', { name: new RegExp(`^${escaped}`) })).toBeInTheDocument();
      });
    });

    // Etap W, krok 1 — "m²"/"mb" przeniesione z komórek do nagłówka (podtekst, .colUnit).
    it('"m²"/"mb" live in the column header as a subtext, not duplicated inside each cell', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');

      expect(screen.getByRole('columnheader', { name: /^Korpus/ })).toHaveTextContent('Korpusm²');
      expect(screen.getByRole('columnheader', { name: /^Front/ })).toHaveTextContent('Frontm²');
      expect(screen.getByRole('columnheader', { name: /^Obrzeże/ })).toHaveTextContent('Obrzeżemb');

      const row = moduleCardTitle('Z drzwiami').closest('tr');
      expect(row.querySelector('[data-label="Korpus (m²)"]')).not.toHaveTextContent('m²');
      expect(row.querySelector('[data-label="Front (m²)"]')).not.toHaveTextContent('m²');
      expect(row.querySelector('[data-label="Obrzeże (mb)"]')).not.toHaveTextContent('mb');
    });
  });

  // Etap S, krok 1 — 5 grup kuchennych w JEDNYM kontenerze z zakładkami u góry (karuzela slajdów)
  // zamiast długiej pionowej wstęgi.
  describe('zakładki grup kuchennych — karuzela slajdów (Etap S)', () => {
    const tab = (shortLabel) => screen.getByRole('tab', { name: new RegExp(`^${shortLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    const slide = (groupKey) => document.querySelector(`[data-group-slide="${groupKey}"]`);

    it('shows all 5 kitchen tabs with a live module count, "⬇️ Dolne" active by default', () => {
      renderCalculator();
      [
        ['⬇️ Dolne', KITCHEN_BOTTOM],
        ['⬆️ Górne', KITCHEN_TOP],
        ['⏫ Antresole', KITCHEN_MEZZANINE],
        ['📏 Słupki', KITCHEN_TALL],
        ['🪵 Blat', '🪵 Blat'],
      ].forEach(([shortLabel]) => {
        expect(tab(shortLabel)).toBeInTheDocument();
        expect(tab(shortLabel)).toHaveTextContent('(0)');
      });
      expect(tab('⬇️ Dolne')).toHaveAttribute('aria-selected', 'true');
      expect(tab('⬆️ Górne')).toHaveAttribute('aria-selected', 'false');
      expect(slide('kitchen_bottom')).toHaveAttribute('data-active', 'true');
      expect(slide('kitchen_top')).toHaveAttribute('data-active', 'false');
    });

    it('the tab count updates live as modules are added to that group', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_BOTTOM, 'Pod zlew');
      expect(tab('⬇️ Dolne')).toHaveTextContent('(2)');
      expect(tab('⬆️ Górne')).toHaveTextContent('(0)');
    });

    it('clicking a tab switches the active slide (aria-selected + data-active flip to the clicked group)', () => {
      renderCalculator();
      fireEvent.click(tab('⬆️ Górne'));

      expect(tab('⬆️ Górne')).toHaveAttribute('aria-selected', 'true');
      expect(tab('⬇️ Dolne')).toHaveAttribute('aria-selected', 'false');
      expect(slide('kitchen_top')).toHaveAttribute('data-active', 'true');
      expect(slide('kitchen_bottom')).toHaveAttribute('data-active', 'false');
    });

    it('every group\'s own content (materials gear, add-tiles, table) still lives in its own slide, reachable without clicking its tab first', () => {
      // Etap S, krok 1 — świadomy wybór: slajdy NIE są aria-hidden/display:none (tylko wizualnie
      // przesunięte poza viewport), więc istniejące testy (addModuleInGroup bez klikania zakładki)
      // dalej działają — to sprawdzamy tu wprost, dla grupy INNEJ niż domyślnie aktywna.
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Z półkami');
      expect(moduleCardTitle('Z półkami')).toBeInTheDocument();
    });

    // Etap S, krok 1 (bonus) — klik na szafce NA RYSUNKU przełącza slajder na grupę tej szafki.
    it('clicking a cabinet on the WallElevationCanvas switches the slider to that cabinet\'s group', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      expect(tab('⬇️ Dolne')).toHaveAttribute('aria-selected', 'true'); // domyślna zakładka

      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      fireEvent.click(within(canvas).getByRole('button', { name: /Klasyczna \(z drzwiami\)/ }));

      expect(tab('⬆️ Górne')).toHaveAttribute('aria-selected', 'true');
      expect(slide('kitchen_top')).toHaveAttribute('data-active', 'true');
    });
  });

  // Etap T — kalkulator renderuje się w pełnoekranowym portalu (createPortal do document.body),
  // z własnym przyciskiem "← Wróć do projektu"/Escape zamiast ponownego kliku w stary przycisk-
  // przełącznik; paleta+zakładki grup są teraz WSPÓLNYM, pełnoszerokim paskiem NAD obiema kolumnami
  // (rysunek + tabela), nie tylko nad tabelą; podświetlenie wybranej/najechanej szafki jest
  // DWUSTRONNE (tabela <-> rysunek, w obie strony, dla kliku I dla hover).
  describe('pełny ekran, wspólny pasek grup i dwustronne podświetlenie (Etap T)', () => {
    it('"← Wróć do projektu" calls onClose', () => {
      const onClose = vi.fn();
      renderCalculator({ onClose });
      fireEvent.click(screen.getByRole('button', { name: '← Wróć do projektu' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape closes the calculator when no inner editor/popover is focused', () => {
      const onClose = vi.fn();
      renderCalculator({ onClose });
      fireEvent.keyDown(screen.getByText('📐 Kalkulator', { exact: true }), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Ten sam `stopPropagation()`, który od Etapu R chroni InlineEditableNumberCell przed globalnym
    // "Escape zamyka projekt" (useProjectCloseLifecycle), zatrzymuje zdarzenie ZANIM dotrze do
    // nowego handleOverlayKeyDown w .fullscreenOverlay — Escape w otwartym edytorze porzuca tylko
    // SZKIC liczby, nie zamyka całego kalkulatora.
    it('Escape inside an open inline-number editor cancels just the edit, without closing the calculator', () => {
      const onClose = vi.fn();
      renderCalculator({ onClose });
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      setInlineNumber(screen, 'Szer. (mm)', '650');
      fireEvent.click(screen.getByLabelText('Szer. (mm)'));
      fireEvent.keyDown(screen.getByLabelText('Szer. (mm)'), { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('the tabs/palette bar is a sibling OUTSIDE the 2-column canvas/table layout, not nested inside it', () => {
      renderCalculator();
      const palette = groupSectionFor(KITCHEN_BOTTOM);
      const layout = document.querySelector('[class*="calculatorLayout"]');
      expect(layout).toBeTruthy();
      expect(layout.contains(palette)).toBe(false);
    });

    it('module names that used to truncate render in full inside the (now wider) table column', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z szufladami');
      expect(moduleCardTitle('Z szufladami')).toBeInTheDocument();
    });

    it('hovering a table row highlights it (rowHovered); clicking it highlights it persistently (rowHighlighted)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const row = moduleCardTitle('Z drzwiami').closest('tr');

      fireEvent.mouseEnter(row);
      expect(row.className).toMatch(/rowHovered/);
      fireEvent.mouseLeave(row);
      expect(row.className).not.toMatch(/rowHovered/);

      fireEvent.click(row);
      expect(row.className).toMatch(/rowHighlighted/);
    });

    it('hovering/clicking a cabinet on the canvas highlights the matching table row (rysunek -> tabela)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const cabinet = within(canvas).getByRole('button', { name: /Z drzwiami/ });
      const row = moduleCardTitle('Z drzwiami').closest('tr');

      fireEvent.mouseEnter(cabinet);
      expect(row.className).toMatch(/rowHovered/);
      fireEvent.mouseLeave(cabinet);
      expect(row.className).not.toMatch(/rowHovered/);

      fireEvent.click(cabinet);
      expect(row.className).toMatch(/rowHighlighted/);
    });

    it('hovering a table row highlights the matching cabinet on the canvas (tabela -> rysunek)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const cabinet = within(canvas).getByRole('button', { name: /Z drzwiami/ });
      const row = moduleCardTitle('Z drzwiami').closest('tr');

      fireEvent.mouseEnter(row);
      expect(cabinet.getAttribute('class')).toMatch(/cabinetHovered/);
      fireEvent.mouseLeave(row);
      expect(cabinet.getAttribute('class')).not.toMatch(/cabinetHovered/);
    });
  });

  // Etap U, krok 1 — tabela po prawej ZAWSZE pokazuje wszystkie podrozdziały naraz (zgrupowane per
  // jarus: Pas dolny i słupki / Szafki górne / Antresole / Blat), zakładki u góry tylko PODŚWIETLAJĄ
  // swoją grupę i przełączają się po kliku w dowolny wiersz innej grupy.
  describe('tabela ZAWSZE pokazuje wszystkie podrozdziały razem, z podświetleniem aktywnej grupy (Etap U, krok 1)', () => {
    it('shows rows from Dolne, Górne, Antresole and Słupki all at once, regardless of which tab is active', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      addModuleInGroup(KITCHEN_MEZZANINE, 'Klapa pod sufit');
      addModuleInGroup(KITCHEN_TALL, 'Z półkami');

      fireEvent.click(screen.getByRole('tab', { name: /Górne/ }));

      expect(moduleCardTitle('Z drzwiami')).toBeInTheDocument();
      expect(moduleCardTitle('Klasyczna (z drzwiami)')).toBeInTheDocument();
      expect(moduleCardTitle('Klapa pod sufit')).toBeInTheDocument();
      expect(moduleCardTitle('Z półkami')).toBeInTheDocument();
    });

    it('Dolne + Słupki share ONE combined "Pas dolny i słupki" section — not two separate tier headers', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_TALL, 'Z półkami');
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      addModuleInGroup(KITCHEN_MEZZANINE, 'Klapa pod sufit');

      // Scope do samej tabeli (nie ekranu) — "⬆️ Szafki górne" to TAKŻE pełna etykieta grupy w
      // nagłówku palety (BOARD_GROUPS.kitchen_top.label), osobny, oczekiwany byt.
      const moduleTable = within(kitchenModuleTable());
      expect(moduleTable.getAllByText(/⬇️ Pas dolny i słupki/)).toHaveLength(1);
      expect(moduleTable.getAllByText(/⬆️ Szafki górne/)).toHaveLength(1);
      expect(moduleTable.getAllByText(/⏫ Antresole \(pod sufit\)/)).toHaveLength(1);
    });

    it('clicking the "Dolne" tab highlights only Dolne rows (rowActiveGroup); switching to "Górne" moves the highlight', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      const bottomRow = moduleCardTitle('Z drzwiami').closest('tr');
      const topRow = moduleCardTitle('Klasyczna (z drzwiami)').closest('tr');

      expect(bottomRow.className).toMatch(/rowActiveGroup/); // Dolne to domyślna aktywna zakładka
      expect(topRow.className).not.toMatch(/rowActiveGroup/);

      fireEvent.click(screen.getByRole('tab', { name: /Górne/ }));
      expect(bottomRow.className).not.toMatch(/rowActiveGroup/);
      expect(topRow.className).toMatch(/rowActiveGroup/);
    });

    it('clicking a row from a different group switches the active tab to that row\'s group', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      expect(screen.getByRole('tab', { name: /Dolne/ })).toHaveAttribute('aria-selected', 'true');

      fireEvent.click(moduleCardTitle('Klasyczna (z drzwiami)').closest('tr'));

      expect(screen.getByRole('tab', { name: /Górne/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: /Dolne/ })).toHaveAttribute('aria-selected', 'false');
    });

    // Etap AB, krok 4 — zgłoszenie: modal stracił "◀ Przesuń w lewo"/"Przesuń w prawo ▶"
    // (nieużywane) — przestawianie Słupka względem Dolnych w tym samym rzędzie żyje teraz TYLKO
    // przez drag&drop na rysunku, nietestowalne w jsdom. Realny test UI (z recompute leftTallOffset
    // i przesunięciem Szafek górnych na rysunku) żyje w e2e: "dragging a cabinet with the mouse
    // inside the canvas reorders it within its row, and the table reflects the new order"
    // (cabinet-calculator-elevation-canvas.spec.js); leftTallOffsetMm ma własne testy jednostkowe
    // w cabinetCalculator.test.js, niezależne od tego, PRZEZ JAKI mechanizm UI doszło do przestawienia.

    it('Antresole stand in their OWN independent row from X=0 — do NOT sum with Szafki górne on the drawing', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      addModuleInGroup(KITCHEN_MEZZANINE, 'Klapa pod sufit');

      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const mezzanineRect = within(canvas).getByRole('button', { name: /Klapa pod sufit/ }).querySelector('rect');
      expect(mezzanineRect).toHaveAttribute('x', '0');
    });
  });

  // Etap V, krok 1 — zgłoszenie: Widok z góry rysował Szafki górne PO PRAWEJ za Dolnymi (osobna,
  // niezależna kumulacja od zera), zamiast na ich REALNYCH X — rozjazd z Widokiem X. Fix: oba widoki
  // wołają TĘ SAMĄ funkcję jądra (layoutUpperRow/layoutFloorBand), więc muszą dawać identyczny X.
  describe('Widok z góry — te same X co Widok X, bez nakładających się podpisów (Etap V, krok 1/2)', () => {
    it('Szafki górne stoją na Widoku z góry na DOKŁADNIE tym samym X co na Widoku X (nie "po prawej za Dolnymi")', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Z półkami'); // 600mm, na początku wspólnego rzędu
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami'); // 600mm
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)'); // 600mm

      const elevationCanvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const topRectElevation = within(elevationCanvas).getByRole('button', { name: /Klasyczna \(z drzwiami\)/ }).querySelector('rect');
      expect(topRectElevation).toHaveAttribute('x', '600'); // za wiodącym słupkiem (leftTallOffset)

      fireEvent.click(screen.getByRole('button', { name: /Widok z góry/ }));
      const planCanvas = screen.getByRole('img', { name: /Widok z góry/ });
      const topRectPlan = within(planCanvas).getByRole('button', { name: /Klasyczna \(z drzwiami\)/ }).querySelector('rect');
      // Dawny bug: wychodziłoby "x=1200" (0..600 Dolne, POTEM 600..1200 Górne, "po prawej za Dolnymi").
      expect(topRectPlan).toHaveAttribute('x', '600');
    });

    it('etykiety "600×520" (Dolne) i "600×320" (Górne) na tym samym X nie nakładają się (różne pasy głębokości)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_TOP, 'Klasyczna (z drzwiami)');
      fireEvent.click(screen.getByRole('button', { name: /Widok z góry/ }));

      const planCanvas = screen.getByRole('img', { name: /Widok z góry/ });
      const bottomText = within(planCanvas).getByText('600×520');
      const topText = within(planCanvas).getByText('600×320');
      expect(bottomText.getAttribute('y')).not.toBe(topText.getAttribute('y'));
    });
  });

  // Etap V, krok 2 — nowy moduł "Pod lodówkę" w podrozdziale Słupki, z wyborem standardu
  // wbudowanej lodówki (178/194/194 XXL cm) za "⚙️".
  describe('"Pod lodówkę" (fridge_tall_cabinet) — Etap V, krok 2', () => {
    it('adds a fridge-tall cabinet to Słupki, defaulting to the 178cm standard', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Pod lodówkę');

      expect(moduleCardTitle('Pod lodówkę')).toBeInTheDocument();
      const row = moduleCardTitle('Pod lodówkę').closest('tr');
      openRowSettings(row);
      expect(within(settingsModal()).getByLabelText('Standard lodówki do zabudowy')).toHaveValue('standard_178');
      expect(readInlineNumber(row, 'Szer. (mm)')).toMatch(/600/);
    });

    it('switching to the "Szeroka XXL 75 cm / 194 cm" standard changes the cabinet width to 750mm', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Pod lodówkę');
      const row = moduleCardTitle('Pod lodówkę').closest('tr');
      openRowSettings(row);

      fireEvent.change(within(settingsModal()).getByLabelText('Standard lodówki do zabudowy'), { target: { value: 'xxl_75_194' } });

      expect(readInlineNumber(row, 'Szer. (mm)')).toMatch(/750/);
    });

    it('has no "HDF wpuszczany" checkbox (no back panel at all), but still shows an editable "Liczba półek nad lodówką" count (default 1)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Pod lodówkę');
      const row = moduleCardTitle('Pod lodówkę').closest('tr');
      openRowSettings(row);

      const modal = within(settingsModal());
      expect(modal.queryByLabelText('HDF wpuszczany')).not.toBeInTheDocument();
      expect(modal.getByLabelText('Liczba półek nad lodówką')).toHaveValue(1);
    });

    it('the add-module tile and the full-scale drawing render a divider line at bottomHeightMm (jedna linia z Dolnymi)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      addModuleInGroup(KITCHEN_TALL, 'Pod lodówkę');

      const canvas = screen.getByRole('img', { name: /Rysunek 2D elewacji/ });
      const fridgeCabinet = within(canvas).getByRole('button', { name: /Pod lodówkę/ });
      // CabinetFrontDrawing rysuje dedykowaną linię podziału ("fridge-divider") TYLKO dla tego typu.
      expect(fridgeCabinet.querySelectorAll('line').length).toBeGreaterThan(0);
    });
  });

  // Etap W, krok 2/3 — "⚙️" otwiera teraz CabinetSettingsModal: pełnoprawne, wyśrodkowane okno
  // modalne (createPortal do document.body, role="dialog", data-testid="cabinet-settings-modal"),
  // nie wąski popover zaczepiony o wiersz.
  describe('CabinetSettingsModal — wyśrodkowane okno ustawień szafki (Etap W, krok 2)', () => {
    it('clicking "⚙️" opens a centered dialog with the module name in its header, closable via "×"', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));

      const modal = screen.getByTestId('cabinet-settings-modal');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(within(modal).getByText(/Ustawienia szafki: Z drzwiami/)).toBeInTheDocument();

      fireEvent.click(within(modal).getByRole('button', { name: 'Zamknij ustawienia szafki' }));
      expect(screen.queryByTestId('cabinet-settings-modal')).not.toBeInTheDocument();
    });

    it('Escape closes the modal; clicking the backdrop (outside the dialog) also closes it', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      fireEvent.keyDown(screen.getByTestId('cabinet-settings-modal'), { key: 'Escape' });
      expect(screen.queryByTestId('cabinet-settings-modal')).not.toBeInTheDocument();

      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      const modal = screen.getByTestId('cabinet-settings-modal');
      fireEvent.mouseDown(modal.parentElement); // backdrop = rodzic dialogu
      expect(screen.queryByTestId('cabinet-settings-modal')).not.toBeInTheDocument();
    });

    it('Block 1 "Gabaryty i rozmieszczenie" shows Szerokość/Wysokość/Głębokość (mm) inputs', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      const modal = within(screen.getByTestId('cabinet-settings-modal'));

      expect(modal.getByLabelText('Szerokość (mm)')).toHaveValue(600);
      expect(modal.getByLabelText('Wysokość (mm)')).toBeInTheDocument();
      expect(modal.getByLabelText('Głębokość (mm)')).toBeInTheDocument();
    });

    // Etap AD, krok 1 — "Z drzwiami" to kitchen_bottom: "Opuszczany front" zniknęło stąd CAŁKOWICIE
    // (żyje teraz tylko w kitchen_top, patrz opisany wyżej test 'wall_cabinet defaults to...').
    it('a door-bearing module (Z drzwiami) shows "Liczba drzwi"/"Liczba półek" (ale NIE "Opuszczany front"), plus a duplicate button', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      const modal = within(screen.getByTestId('cabinet-settings-modal'));

      expect(modal.getByLabelText('Liczba drzwi')).toBeInTheDocument();
      expect(modal.getByLabelText('Liczba półek')).toBeInTheDocument();
      expect(modal.queryByLabelText('Opuszczany front (+20 mm)')).not.toBeInTheDocument();
      expect(modal.getByLabelText('HDF wpuszczany')).toBeInTheDocument();
      expect(modal.getByRole('button', { name: /^Duplikuj moduł/ })).toBeInTheDocument();
    });

    it('"Narożna zaślepiona" (corner_blind_cabinet) shows "Szerokość frontu (mm)" and "Liczba półek"', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Narożna zaślepiona');
      openRowSettings(moduleCardTitle('Narożna zaślepiona').closest('tr'));
      const modal = within(screen.getByTestId('cabinet-settings-modal'));

      expect(modal.getByLabelText('Szerokość frontu (mm)')).toHaveValue(450);
      expect(modal.getByLabelText('Liczba półek')).toBeInTheDocument();
      expect(modal.queryByLabelText('Liczba drzwi')).not.toBeInTheDocument();
    });

    it('a drawer module (Z szufladami) shows the wide "Układ szuflad zewnętrznych" select and the internal-drawer checkbox with its own counters', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z szufladami');
      openRowSettings(moduleCardTitle('Z szufladami').closest('tr'));
      const modal = within(screen.getByTestId('cabinet-settings-modal'));

      expect(modal.getByLabelText('Układ szuflad zewnętrznych')).toBeInTheDocument();
      expect(modal.getByLabelText('Dodatkowa szuflada wewnętrzna')).toBeInTheDocument();
      fireEvent.click(modal.getByLabelText('Dodatkowa szuflada wewnętrzna'));
      expect(modal.getByLabelText('Wewn. wysokie (szt.)')).toBeInTheDocument();
      expect(modal.getByLabelText('Wewn. niskie (szt.)')).toBeInTheDocument();
    });

    it('"Pod lodówkę" (fridge_tall_cabinet) shows the wide "Standard lodówki do zabudowy" select with all 3 standards', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Pod lodówkę');
      openRowSettings(moduleCardTitle('Pod lodówkę').closest('tr'));
      const modal = within(screen.getByTestId('cabinet-settings-modal'));

      const select = modal.getByLabelText('Standard lodówki do zabudowy');
      expect(select).toBeInTheDocument();
      [/^Standard 178 cm/, /^Wysoka XL 194 cm/, /^Szeroka XXL 75 cm \/ 194 cm/].forEach((name) => {
        expect(within(select).getByRole('option', { name })).toBeInTheDocument();
      });
    });

    // Etap AB, krok 4 — zgłoszenie (zmywarka.jpg): footer stracił "◀ Przesuń w lewo"/"Przesuń w
    // prawo ▶" (nieużywane) — zostają tylko Duplikuj/Usuń (lewa strona) i Gotowe (prawa).
    it('Block 3 shows a readable Korpus/Front/Obrzeże/HDF summary line and the duplicate/remove actions (no Przesuń buttons)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      const modal = within(screen.getByTestId('cabinet-settings-modal'));

      expect(modal.getByText(/Korpus: \d+\.\d{2} m² · Front: \d+\.\d{2} m² · Obrzeże: \d+\.\d{2} mb · HDF: \d+\.\d{2} m²/)).toBeInTheDocument();
      expect(modal.queryByRole('button', { name: /Przesuń w lewo/ })).not.toBeInTheDocument();
      expect(modal.queryByRole('button', { name: /Przesuń w prawo/ })).not.toBeInTheDocument();
      expect(modal.getByRole('button', { name: /^Duplikuj moduł/ })).toBeInTheDocument();
      expect(modal.getByRole('button', { name: /^Usuń moduł/ })).toBeInTheDocument();
      expect(modal.getByRole('button', { name: 'Gotowe' })).toBeInTheDocument();
    });

    // Etap W, krok 1/3 — nazwy modułów i 4-cyfrowe wymiary nie ucinają się ani w wierszu, ani w
    // nagłówku modala (patrz też tabela kolumn i test "m²"/"mb" wyżej).
    it('a long module name (Słupek łazienkowy) and its 4-digit height (1700mm) render in full, uncut', () => {
      renderCalculator();
      switchCategory(BATHROOM_GROUP);
      fireEvent.click(roleButton('Słupek łazienkowy'));

      expect(moduleCardTitle('Słupek łazienkowy')).toHaveTextContent('Słupek łazienkowy');
      const tallRow = moduleCardTitle('Słupek łazienkowy').closest('tr');
      expect(readInlineNumber(tallRow, 'Wys. (mm)')).toContain('1700');
    });

    it('a long module name (Szafka RTV podwieszana) and its 4-digit width (1800mm) render in full, uncut', () => {
      renderCalculator();
      switchCategory(RTV_GROUP);
      fireEvent.click(roleButton('Szafka RTV podwieszana'));

      expect(moduleCardTitle('Szafka RTV podwieszana')).toHaveTextContent('Szafka RTV podwieszana');
      const rtvRow = moduleCardTitle('Szafka RTV podwieszana').closest('tr');
      expect(readInlineNumber(rtvRow, 'Szer. (mm)')).toContain('1800');
    });
  });

  // Etap Y, krok 1 — zgłoszenie (Screenshot_9_3.jpg): "GABARYTY I ROZMIESZCZENIE" i etykiety pól
  // (Szerokość/Wysokość/Głębokość (mm)) były praktycznie nieczytelne (zbyt mały, stłumiony tekst).
  // jsdom (komponentowe testy) NIE ładuje reguł CSS Modułów do obliczania stylu (brak `test.css`
  // w vite.config.js) — `getComputedStyle` tu zwróciłby tylko domyślne style UA, nie realny
  // kontrast/rozmiar czcionki. Realną, pikselową weryfikację koloru/rozmiaru robi test Playwright
  // (e2e/cabinet-calculator-table-layout.spec.js) — tu sprawdzamy tylko, że właściwe etykiety
  // faktycznie istnieją w DOM-ie (sekcja/pola się renderują, jest co kolorować).
  describe('kontrast modala ustawień szafki (Etap Y, krok 1) — struktura', () => {
    it('nagłówek sekcji i etykiety pól gabarytów są obecne w DOM-ie (realny kontrast/rozmiar sprawdza e2e)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      const modal = screen.getByTestId('cabinet-settings-modal');

      expect(within(modal).getByText('Gabaryty i rozmieszczenie')).toBeInTheDocument();
      expect(within(modal).getByText('Szerokość (mm)')).toBeInTheDocument();
      expect(within(modal).getByText('Wysokość (mm)')).toBeInTheDocument();
      expect(within(modal).getByText('Głębokość (mm)')).toBeInTheDocument();
    });
  });

  // Etap Y, krok 2/3/4 — "📋 Formatki i okleinowanie ABS": tabela rozkroju produkcyjnego
  // (computeCabinetParts, cabinetCalculator.js) wewnątrz modala ustawień szafki.
  describe('"📋 Formatki i okleinowanie ABS" (Etap Y, krok 2/3/4)', () => {
    const openPartsSection = (row) => {
      openRowSettings(row);
      const modal = screen.getByTestId('cabinet-settings-modal');
      fireEvent.click(within(modal).getByRole('button', { name: /Formatki i okleinowanie ABS/ }));
      return modal;
    };

    it('sekcja jest zwinięta domyślnie; klik rozwija tabelę formatek', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      openRowSettings(moduleCardTitle('Z drzwiami').closest('tr'));
      const modal = screen.getByTestId('cabinet-settings-modal');
      expect(within(modal).queryByTestId('cabinet-parts-table')).not.toBeInTheDocument();

      fireEvent.click(within(modal).getByRole('button', { name: /Formatki i okleinowanie ABS/ }));
      expect(within(modal).getByTestId('cabinet-parts-table')).toBeInTheDocument();
    });

    it('tabela ma wiersze Bok/Dno/Trawers/Front z dokładnymi wymiarami i oklejką ABS', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const modal = openPartsSection(moduleCardTitle('Z drzwiami').closest('tr'));
      const table = within(modal).getByTestId('cabinet-parts-table');

      const sideRow = within(table).getByText('Bok').closest('tr');
      // H nie jest statycznym "820" z defaults typu — świeżo dodany moduł od razu dostaje ŻYWĄ,
      // reaktywną wysokość z panelu "Wymiary ściany i wysokości" (heightForRole.bottom, domyślnie
      // 757mm dla ustawień Jarvis: 900 blat - 38 grubość - 105 nogi), patrz syncModuleHeights.
      expect(sideRow).toHaveTextContent('757');
      expect(sideRow).toHaveTextContent('520'); // D domyślne
      // Etap Z, krok 1 — Bok kromkowany z 3 stron (przód D1 + góra/dół S1/S2) -> symbol "⊔", nie "─".
      expect(within(sideRow).getByText('⊔')).toBeInTheDocument();
      expect(within(sideRow).getByText('⊔')).toHaveAttribute('title', '3 str. (przód, góra, dół)');

      const frontRow = within(table).getByText('Front (drzwi)').closest('tr');
      expect(within(frontRow).getByText('═')).toBeInTheDocument(); // 4 strony (widoczny front)

      const hdfRow = within(table).getByText('Plecy HDF').closest('tr');
      expect(within(hdfRow).getByText('Brak')).toBeInTheDocument(); // plecy nie są kromkowane
    });

    it('"Pod lodówkę" (brak koncepcji pleców) NIE pokazuje wiersza "Plecy HDF"', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_TALL, 'Pod lodówkę');
      const modal = openPartsSection(moduleCardTitle('Pod lodówkę').closest('tr'));
      const table = within(modal).getByTestId('cabinet-parts-table');
      expect(within(table).queryByText('Plecy HDF')).not.toBeInTheDocument();
      expect(within(table).getByText('Front (dolny)')).toBeInTheDocument();
      expect(within(table).getByText('Front (górny)')).toBeInTheDocument();
    });

    it('najechanie na wiersz tabeli podświetla go (hoveredPartIndex)', () => {
      renderCalculator();
      addModuleInGroup(KITCHEN_BOTTOM, 'Z drzwiami');
      const modal = openPartsSection(moduleCardTitle('Z drzwiami').closest('tr'));
      const table = within(modal).getByTestId('cabinet-parts-table');
      const sideRow = within(table).getByText('Bok').closest('tr');

      expect(sideRow.className).not.toMatch(/partsTableRowActive/);
      fireEvent.mouseEnter(sideRow);
      expect(sideRow.className).toMatch(/partsTableRowActive/);
      fireEvent.mouseLeave(sideRow);
      expect(sideRow.className).not.toMatch(/partsTableRowActive/);
    });
  });
});
