import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CabinetCalculator from './CabinetCalculator';

const materials = [
  { id: 'm-body', name: 'PL W960 SM Biały', category: 'Płyta', price: 180, is_favorite: true },
  { id: 'm-front', name: 'U702 ST9 Kaszmir', category: 'Płyta', price: 220 },
  { id: 'm-edge', name: 'ABS 2mm Biały', category: 'Obrzeże', price: 3.5 },
  { id: 'm-hinge', name: 'BLUM Zawias 110°', category: 'Zawiasy', price: 6 },
  { id: 'm-runner', name: 'Blum Tandem L-500', category: 'Prowadnice', price: 45 },
  { id: 'm-top', name: 'Blat laminowany', category: 'Inne', price: 150 },
];
const servicesList = [
  { id: 's-cut', name: 'Cięcie płyty', price: 2 },
  { id: 's-edge', name: 'Oklejanie PCV', price: 1.5 },
];

const renderCalculator = (props = {}) => {
  const onAddToProject = vi.fn();
  render(
    <CabinetCalculator
      materials={materials}
      servicesList={servicesList}
      projectMultiplier={2}
      onAddToProject={onAddToProject}
      {...props}
    />,
  );
  return { onAddToProject };
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

  it('adds the calculated lines to the project using the selected catalog materials/services', () => {
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
    expect(serviceLines.find(line => line.item.id === 's-cut')).toBeTruthy();
    expect(serviceLines.find(line => line.item.id === 's-edge')).toBeTruthy();
  });

  it('flashes a confirmation after adding to the project', async () => {
    renderCalculator();
    fireEvent.click(screen.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }));
    fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

    expect(await screen.findByRole('button', { name: '✓ Dodano!' })).toBeInTheDocument();
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

      // Dla base_doors domyślnej wielkości: 1 arkusz korpusu i frontu, 2 zawiasy, brak prowadnic/blatu.
      const bodyRow = dialog.getByText('PL W960 SM Biały').closest('tr');
      expect(bodyRow).toHaveTextContent('Płyta korpusu');
      expect(bodyRow).toHaveTextContent('1 ark. (1.72 m²)');
      expect(bodyRow).toHaveTextContent('180.00');

      const hingeRow = dialog.getByText('BLUM Zawias 110°').closest('tr');
      expect(hingeRow).toHaveTextContent('2 szt.');
      expect(hingeRow).toHaveTextContent('12.00'); // 2 x 6 zł

      // base_doors nie ma szuflad — Szuflada zewn. ma wybrany materiał, ale ilość/wartość = 0;
      // wiersz Szuflada wewn. jest całkowicie pominięty (internalDrawerSets=0).
      const runnerRow = dialog.getByText('Szuflada zewn.', { selector: 'td' }).closest('tr');
      expect(runnerRow).toHaveTextContent('Blum Tandem L-500');
      expect(runnerRow).toHaveTextContent('0 kpl.');
      expect(dialog.queryByText('Szuflada wewn.', { selector: 'td' })).not.toBeInTheDocument();
    });

    it('marks HDF/Nogi/Zawieszki as informacyjnie (0.00 zł) — computed but not priced', () => {
      const dialog = open();
      ['HDF', 'Nogi', 'Zawieszki'].forEach((label) => {
        const row = dialog.getByText(label, { selector: 'td' }).closest('tr');
        expect(row).toHaveTextContent('informacyjnie (0.00 zł)');
      });
    });

    it('lists the cutting/edging services without the multiplier applied', () => {
      const dialog = open();
      // Etykieta wiersza i nazwa wybranej usługi w katalogu brzmią tu identycznie
      // ("Cięcie płyty" / "Oklejanie PCV"), stąd getAllByText — pierwszy trafiony węzeł
      // leży i tak w tym samym <tr>, więc closest('tr') daje ten sam wiersz.
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

    it('moduł ma dwa pola — Szufl. zewn. i Szufl. wewn. — i liczy je osobno na żywo', () => {
      renderCalculator({ materials: merivoboxMaterials });
      fireEvent.click(screen.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }));

      fireEvent.change(screen.getByLabelText('Szufl. zewn.'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Szufl. wewn.'), { target: { value: '1' } });
      expect(screen.getByText(/Szufl\. zewn\.: 1 kpl\..*Szufl\. wewn\.: 1 kpl\./)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Ilość'), { target: { value: '6' } });
      expect(screen.getByText((_, node) => node?.textContent === 'Szuflady zewn.: 6 kpl.')).toBeInTheDocument();
      expect(screen.getByText((_, node) => node?.textContent === 'Szuflady wewn.: 6 kpl.')).toBeInTheDocument();
    });

    it('Szczegóły wyceny pokazują obie pozycje osobno — 6 × MERIVOBOX E (300) i 6 × MERIVOBOX M (210)', () => {
      renderCalculator({ materials: merivoboxMaterials });
      fireEvent.click(screen.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }));
      fireEvent.change(screen.getByLabelText('Szufl. zewn.'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Szufl. wewn.'), { target: { value: '1' } });
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
      fireEvent.change(screen.getByLabelText('Szufl. zewn.'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Szufl. wewn.'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Ilość'), { target: { value: '6' } });

      fireEvent.click(screen.getByRole('button', { name: /Dodaj wyliczone pozycje/ }));

      const { materialLines } = onAddToProject.mock.calls[0][0];
      const byId = id => materialLines.find(line => line.item.id === id);
      expect(byId('m-merivobox-e')).toMatchObject({ quantity: 6 });
      expect(byId('m-merivobox-m')).toMatchObject({ quantity: 6 });
    });
  });
});
