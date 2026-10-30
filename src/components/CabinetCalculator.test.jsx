import { fireEvent, render, screen } from '@testing-library/react';
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
});
