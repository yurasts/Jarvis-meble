import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CabinetCalculator from './CabinetCalculator';

const materials = [
  { id: 'm-body', name: 'PL W960 SM Biały', category: 'Płyta', price: 180, is_favorite: true },
  { id: 'm-front', name: 'U702 ST9 Kaszmir', category: 'Płyta', price: 220 },
  { id: 'm-edge-body', name: 'ABS W960 SM Biały', category: 'Obrzeże', price: 1.13 },
  { id: 'm-edge-front', name: 'ABS U702 ST9 Kaszmir', category: 'Obrzeże', price: 4.2 },
  { id: 'm-hinge', name: 'BLUM Zawias 110°', category: 'Zawiasy', price: 6 },
  { id: 'm-runner', name: 'Blum Tandem L-500', category: 'Prowadnice', price: 45 },
  { id: 'm-top', name: 'Blat laminowany', category: 'Inne', price: 150 },
  { id: 'm-leg-front', name: 'Nogi zwykłe', category: 'Akcesoria', price: 1 },
  { id: 'm-leg-axilo', name: 'Nóżka Axilo HAFELE H-100 mm', category: 'Akcesoria', price: 4.19 },
  { id: 'm-hdf', name: 'HDF BIAŁY 2850x2070x3mm', category: 'HDF', price: 56.73 },
  { id: 'm-hanger', name: 'ZAWIESZKA CAMAR 806 KPL', category: 'Akcesoria', price: 8 },
  { id: 'm-tipon', name: 'TIP-ON STRONG IF BIAŁY MAGNES MOCNY', category: 'Akcesoria', price: 14.19 },
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

describe('CabinetCalculator', () => {
  it('shows a placeholder until the first module is added', () => {
    renderCalculator();
    expect(screen.getByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ })).toBeDisabled();
  });

  it('adds a module in 1 click and shows its per-row summary and the Podsumowanie', async () => {
    renderCalculator();
    fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));

    expect(screen.getByText('🚪 Szafka dolna z drzwiami')).toBeInTheDocument();
    expect(screen.getByText(/↳ Korpus:.*Front:.*Obrzeże:.*Zawiasy:/)).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'Korpus: 1.72 m² → 1 ark.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ })).not.toBeDisabled();
  });

  it('recomputes areas, sheets and the hinge count live when a module dimension changes', () => {
    renderCalculator();
    fireEvent.click(screen.getByRole('button', { name: '+ ⬆️ Szafka górna' }));

    expect(screen.getByText(/Zawiasy: 2 szt\./)).toBeInTheDocument();

    const heightInput = screen.getByLabelText('Wys. (mm)');
    fireEvent.change(heightInput, { target: { value: '2400' } });

    expect(screen.getByText(/Zawiasy: 5 szt\./)).toBeInTheDocument();
  });

  it('removes a module and resets to the empty state', () => {
    renderCalculator();
    fireEvent.click(screen.getByRole('button', { name: '+ 🪵 Blat' }));
    expect(screen.queryByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Usuń moduł/ }));
    expect(screen.getByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).toBeInTheDocument();
  });

  it('adds the calculated lines to the project, including the newly priced HDF/nogi (front+Axilo)', () => {
    const { onAddToProject } = renderCalculator();
    fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));

    fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

    expect(onAddToProject).toHaveBeenCalledTimes(1);
    const { materialLines, serviceLines } = onAddToProject.mock.calls[0][0];
    const byId = id => materialLines.find(line => line.item.id === id);

    expect(byId('m-body')).toMatchObject({ quantity: 1 });
    expect(byId('m-front')).toMatchObject({ quantity: 1 });
    expect(byId('m-hinge')).toMatchObject({ quantity: 2 });
    expect(byId('m-runner')).toBeUndefined(); // base_doors nie ma szuflad
    expect(byId('m-hdf')).toMatchObject({ quantity: 1 });
    expect(byId('m-leg-front')).toMatchObject({ quantity: 2 }); // 600mm <= 900mm -> 2+2
    expect(byId('m-leg-axilo')).toMatchObject({ quantity: 2 });
    expect(byId('m-hanger')).toBeUndefined(); // base_doors nie ma zawieszek (tylko wall_cabinet)
    expect(byId('m-tipon')).toBeUndefined(); // TIP-ON nie włączony
    expect(serviceLines.find(line => line.item.id === 's-cut')).toBeTruthy();
    expect(serviceLines.find(line => line.item.id === 's-edge')).toBeTruthy();
  });

  it('flashes a confirmation after adding to the project', async () => {
    renderCalculator();
    fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));
    fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

    expect(await screen.findByRole('button', { name: '✓ Dodano!' })).toBeInTheDocument();
  });

  describe('autozapis stanu kalkulatora (projects.calculator_state)', () => {
    it('initializes modules/selection/settings from initialState', () => {
      renderCalculator({
        initialState: {
          modules: [{ id: 'restored-1', type: 'base_doors', W: 777, H: 820, D: 520, doors: 1, shelves: 1, qty: 1 }],
          selection: {},
          settings: { bodyFromFrontBoard: true },
        },
      });
      expect(screen.getByText('🚪 Szafka dolna z drzwiami')).toBeInTheDocument();
      expect(screen.getByLabelText('Szer. (mm)')).toHaveValue(777);
      // Korpus z płyty frontowej był zapisany jako true -> select Płyta korpusu jest ukryty.
      expect(screen.queryByLabelText('Płyta korpusu')).not.toBeInTheDocument();
    });

    it('falls back to empty defaults when initialState is {} (nowy projekt)', () => {
      renderCalculator({ initialState: {} });
      expect(screen.getByText('Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.')).toBeInTheDocument();
      expect(screen.getByLabelText('Płyta korpusu')).toBeInTheDocument();
    });

    it('calls onStateChange with the latest modules/selection/settings after a change, but not on initial mount', () => {
      const { onStateChange } = renderCalculator();
      expect(onStateChange).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));
      expect(onStateChange).toHaveBeenCalled();
      const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
      expect(lastCall.modules).toHaveLength(1);
      expect(lastCall.modules[0].type).toBe('base_doors');
      expect(lastCall.settings).toMatchObject({ bodyFromFrontBoard: false });
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

  describe('🔍 Szczegóły wyceny', () => {
    const open = () => {
      renderCalculator();
      fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));
      fireEvent.click(screen.getByRole('button', { name: '🔍 Szczegóły wyceny' }));
      return within(screen.getByRole('dialog', { name: 'Szczegółowa kalkulacja wyceny' }));
    };

    it('is disabled until there is at least one module', () => {
      renderCalculator();
      expect(screen.getByRole('button', { name: '🔍 Szczegóły wyceny' })).toBeDisabled();
    });

    it('lists every Blok 1 material row with the selected name, quantity, unit price and value', () => {
      const dialog = open();

      const bodyRow = dialog.getByText('PL W960 SM Biały').closest('tr');
      expect(bodyRow).toHaveTextContent('Płyta korpusu');
      expect(bodyRow).toHaveTextContent('1 ark. (1.72 m²)');
      expect(bodyRow).toHaveTextContent('180.00');

      const hingeRow = dialog.getByText('BLUM Zawias 110°').closest('tr');
      expect(hingeRow).toHaveTextContent('2 szt.');
      expect(hingeRow).toHaveTextContent('12.00'); // 2 x 6 zł

      // base_doors nie ma szuflad — wiersz Szuflada zewn./wewn. jest całkowicie pominięty (qty=0).
      expect(dialog.queryByText('Szuflada zewn.', { selector: 'td' })).not.toBeInTheDocument();
      expect(dialog.queryByText('Szuflada wewn.', { selector: 'td' })).not.toBeInTheDocument();
    });

    it('HDF/Nogi przednie/Nogi Axilo are real priced rows now (Etap B), not an "informacyjnie" badge', () => {
      const dialog = open();
      expect(dialog.queryByText(/informacyjnie/)).not.toBeInTheDocument();

      const hdfRow = dialog.getByText('HDF BIAŁY 2850x2070x3mm').closest('tr');
      expect(hdfRow).toHaveTextContent('HDF');
      expect(hdfRow).toHaveTextContent('56.73');

      const legFrontRow = dialog.getByText('Nogi zwykłe').closest('tr');
      expect(legFrontRow).toHaveTextContent('Nogi przednie');
      expect(legFrontRow).toHaveTextContent('2 szt.');
      expect(legFrontRow).toHaveTextContent('1.00');

      const legRearRow = dialog.getByText('Nóżka Axilo HAFELE H-100 mm').closest('tr');
      expect(legRearRow).toHaveTextContent('Nogi tylne (Axilo)');
      expect(legRearRow).toHaveTextContent('2 szt.');
      expect(legRearRow).toHaveTextContent('4.19');

      // base_doors nie generuje zawieszek (tylko wall_cabinet) — wiersz Zawieszki pominięty.
      expect(dialog.queryByText('ZAWIESZKA CAMAR 806 KPL')).not.toBeInTheDocument();
    });

    it('never shows a row with zero quantity (np. Blat/TIP-ON, gdy nie są użyte w projekcie)', () => {
      const dialog = open();
      expect(dialog.queryByText('Blat laminowany')).not.toBeInTheDocument();
      expect(dialog.queryByText('TIP-ON STRONG IF BIAŁY MAGNES MOCNY')).not.toBeInTheDocument();
    });

    it('lists the cutting/edging services without the multiplier applied', () => {
      const dialog = open();
      const cuttingRow = dialog.getAllByText('Cięcie płyty')[0].closest('tr');
      expect(cuttingRow).toHaveTextContent('2.00'); // cena jedn.

      const edgingRow = dialog.getAllByText('Oklejanie PCV')[0].closest('tr');
      expect(edgingRow).toHaveTextContent('1.50');
    });

    it('shows totals that reconcile: materials, materials x multiplier, services, and RAZEM', () => {
      const dialog = open();
      expect(dialog.getByText('Suma materiałów (netto/bazowa):')).toBeInTheDocument();
      expect(dialog.getByText('Materiały × współczynnik (×2):')).toBeInTheDocument();
      expect(dialog.getByText('Suma usług:')).toBeInTheDocument();
      const razem = dialog.getByText('RAZEM ORIENTACYJNA WYCENA:').closest('div');
      expect(razem).toHaveTextContent('zł');
    });

    it('the headline Orientacyjna wycena figure is also clickable and opens the same modal', () => {
      renderCalculator();
      fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));
      fireEvent.click(screen.getByText(/^\d+\.\d{2} zł$/));
      expect(screen.getByRole('dialog', { name: 'Szczegółowa kalkulacja wyceny' })).toBeInTheDocument();
    });

    it('closes on the × button', () => {
      const dialog = open();
      fireEvent.click(dialog.getByRole('button', { name: 'Zamknij' }));
      expect(screen.queryByRole('dialog', { name: 'Szczegółowa kalkulacja wyceny' })).not.toBeInTheDocument();
    });
  });

  describe('Lestnicza ustawień (Etap B, progressive disclosure płyt/obrzeża)', () => {
    it('Płyta korpusu is hidden once "Korpus z płyty frontowej" is checked', () => {
      renderCalculator();
      expect(screen.getByLabelText('Płyta korpusu')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Korpus z płyty frontowej'));
      expect(screen.queryByLabelText('Płyta korpusu')).not.toBeInTheDocument();
    });

    it('Płyta frontu (góra) / Obrzeże frontu (góra) only appear once "Osobna płyta..." is checked', () => {
      renderCalculator();
      expect(screen.queryByLabelText('Płyta frontu (góra)')).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Osobna płyta dla frontów górnych (3 rodzaje płyt)'));
      expect(screen.getByLabelText('Płyta frontu (góra)')).toBeInTheDocument();
      expect(screen.getByLabelText('Obrzeże frontu (góra)')).toBeInTheDocument();
    });

    it('shows the Front dół/góra toggle on tall_cabinet only once the 3-plates option is on', () => {
      renderCalculator();
      fireEvent.click(screen.getByRole('button', { name: '+ 📏 Słupek' }));
      expect(screen.queryByRole('button', { name: 'Front góra' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Osobna płyta dla frontów górnych (3 rodzaje płyt)'));
      expect(screen.getByRole('button', { name: 'Front góra' })).toBeInTheDocument();
    });
  });

  describe('Chipy modułu — Korpus=Front, Obrzeże=Front, TIP-ON', () => {
    it('"Korpus = Front" chip on a single module routes just that module\'s body area into Front, live', () => {
      renderCalculator();
      fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));
      const before = screen.getByText((_, node) => /^Front: \d/.test(node?.textContent || '')).textContent;

      fireEvent.click(screen.getByLabelText('Korpus = Front'));

      const after = screen.getByText((_, node) => /^Front: \d/.test(node?.textContent || '')).textContent;
      expect(after).not.toBe(before);
      expect(screen.getByText((_, node) => node?.textContent === 'Korpus: 0.00 m² → 0 ark.')).toBeInTheDocument();
    });

    it('"+ TIP-ON" chip adds 1 TIP-ON per door to the project', () => {
      const { onAddToProject } = renderCalculator();
      fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));
      fireEvent.click(screen.getByLabelText('+ TIP-ON'));
      fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

      const { materialLines } = onAddToProject.mock.calls[0][0];
      expect(materialLines.find(line => line.item.id === 'm-tipon')).toMatchObject({ quantity: 1 });
    });
  });

  describe('Szuflady zewnętrzne/wewnętrzne (MERIVOBOX)', () => {
    // Realny scenariusz: 1 zewnętrzna szuflada z widocznym frontem (MERIVOBOX E) + 1 wewnętrzna,
    // schowana za nim (MERIVOBOX M) — obie w kategorii Prowadnice, bez starego "m-runner".
    const merivoboxMaterials = [
      ...materials.filter(item => item.id !== 'm-runner'),
      { id: 'm-merivobox-e', name: 'MERIVOBOX E wysoka szuflada zewnętrzna', category: 'Prowadnice', price: 300 },
      { id: 'm-merivobox-m', name: 'MERIVOBOX M niska szuflada wewnętrzna', category: 'Prowadnice', price: 210 },
    ];

    it('Blok 1 oferuje dwa osobne selecty — zewn. domyślnie MERIVOBOX E, wewn. domyślnie MERIVOBOX M', () => {
      renderCalculator({ materials: merivoboxMaterials });
      expect(screen.getByLabelText('Szuflada / Prowadnica zewn.')).toHaveValue('m-merivobox-e');
      expect(screen.getByLabelText('Szuflada / Prowadnica wewn.')).toHaveValue('m-merivobox-m');
    });

    it('Szufl. zewn. jest zawsze widoczne; Szufl. wewnętrzna jest za ladder-checkboxem', () => {
      renderCalculator({ materials: merivoboxMaterials });
      fireEvent.click(screen.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }));

      expect(screen.getByLabelText('Szufl. zewn.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Szufl. wewn.')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('+ Szufl. wewnętrzna'));
      expect(screen.getByLabelText('Szufl. wewn.')).toHaveValue(1);

      fireEvent.change(screen.getByLabelText('Szufl. zewn.'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Ilość'), { target: { value: '6' } });
      expect(screen.getByText((_, node) => node?.textContent === 'Szuflady zewn.: 6 kpl.')).toBeInTheDocument();
      expect(screen.getByText((_, node) => node?.textContent === 'Szuflady wewn.: 6 kpl.')).toBeInTheDocument();
    });

    it('Szczegóły wyceny pokazują obie pozycje osobno — 6 × MERIVOBOX E (300) i 6 × MERIVOBOX M (210)', () => {
      renderCalculator({ materials: merivoboxMaterials });
      fireEvent.click(screen.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }));
      fireEvent.click(screen.getByLabelText('+ Szufl. wewnętrzna'));
      fireEvent.change(screen.getByLabelText('Szufl. zewn.'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Ilość'), { target: { value: '6' } });

      fireEvent.click(screen.getByRole('button', { name: '🔍 Szczegóły wyceny' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Szczegółowa kalkulacja wyceny' }));

      const extRow = dialog.getByText('MERIVOBOX E wysoka szuflada zewnętrzna').closest('tr');
      expect(extRow).toHaveTextContent('Szuflada zewn.');
      expect(extRow).toHaveTextContent('6 kpl.');
      expect(extRow).toHaveTextContent('300.00');
      expect(extRow).toHaveTextContent('1800.00');

      const intRow = dialog.getByText('MERIVOBOX M niska szuflada wewnętrzna').closest('tr');
      expect(intRow).toHaveTextContent('Szuflada wewn.');
      expect(intRow).toHaveTextContent('6 kpl.');
      expect(intRow).toHaveTextContent('210.00');
      expect(intRow).toHaveTextContent('1260.00');
    });

    it('a per-module drawer type chip switches just that module to a specific type (e.g. TANDEM)', () => {
      renderCalculator({ materials: merivoboxMaterials });
      fireEvent.click(screen.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }));
      fireEvent.change(screen.getByLabelText('Szufl. zewn.'), { target: { value: '1' } });

      fireEvent.change(screen.getByLabelText('Typ szuflady zewn.'), { target: { value: 'tandem' } });

      fireEvent.click(screen.getByRole('button', { name: '🔍 Szczegóły wyceny' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Szczegółowa kalkulacja wyceny' }));
      expect(dialog.getByText('Szuflada zewn. (TANDEM)')).toBeInTheDocument();
      expect(dialog.queryByText('Szuflada zewn.', { selector: 'td' })).not.toBeInTheDocument();
    });

    it('never offers a kit component (is_kit_component) in the Szuflada selects', () => {
      renderCalculator({
        materials: [
          ...merivoboxMaterials,
          { id: 'm-merivobox-side', name: 'Boki Merivobox M L-500 białe (kpl L+P)', category: 'Prowadnice', price: 12, is_kit_component: true },
        ],
      });
      const externalSelect = screen.getByLabelText('Szuflada / Prowadnica zewn.');
      const internalSelect = screen.getByLabelText('Szuflada / Prowadnica wewn.');
      expect(within(externalSelect).queryByText('Boki Merivobox M L-500 białe (kpl L+P)')).not.toBeInTheDocument();
      expect(within(internalSelect).queryByText('Boki Merivobox M L-500 białe (kpl L+P)')).not.toBeInTheDocument();
    });

    it('Dodaj wyliczone pozycje przenosi obie pozycje do projektu z ilością 6 każda', () => {
      const { onAddToProject } = renderCalculator({ materials: merivoboxMaterials });
      fireEvent.click(screen.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }));
      fireEvent.click(screen.getByLabelText('+ Szufl. wewnętrzna'));
      fireEvent.change(screen.getByLabelText('Szufl. zewn.'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Ilość'), { target: { value: '6' } });

      fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

      const { materialLines } = onAddToProject.mock.calls[0][0];
      const byId = id => materialLines.find(line => line.item.id === id);
      expect(byId('m-merivobox-e')).toMatchObject({ quantity: 6 });
      expect(byId('m-merivobox-m')).toMatchObject({ quantity: 6 });
    });
  });
});
