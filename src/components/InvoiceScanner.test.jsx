import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceScanner from './InvoiceScanner';

const { mockInvoke, mockUpdateMaterialPrices } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockUpdateMaterialPrices: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}));

vi.mock('../data/catalogRepository', () => ({
  default: { updateMaterialPrices: mockUpdateMaterialPrices },
}));

const materials = [{
  id: 7,
  name: 'Board',
  category: 'Boards',
  unit: 'm2',
  price: 50,
  price_history: [],
}];

const scanResult = [{
  material_id: 7,
  material_name: 'Board',
  old_price: 50,
  new_price: 75,
}];

const scanInvoice = async (user, container) => {
  await user.click(screen.getByRole('button', { name: /Skanuj/ }));
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, {
    target: { files: [new File(['invoice'], 'invoice.png', { type: 'image/png' })] },
  });
  await user.click(screen.getByRole('button', { name: /Analizuj/ }));
  await screen.findByText(/Znaleziono 1/);
};

describe('InvoiceScanner', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockUpdateMaterialPrices.mockReset();
    mockInvoke.mockResolvedValue({ data: { result: scanResult }, error: null });
    vi.stubGlobal('FileReader', class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,aW52b2ljZQ==';
        this.onload();
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the results open when the atomic price update fails', async () => {
    const user = userEvent.setup();
    const onPricesUpdated = vi.fn();
    mockUpdateMaterialPrices.mockRejectedValue(new Error('Price batch rejected'));
    const { container } = render(
      <InvoiceScanner materials={materials} onPricesUpdated={onPricesUpdated} />,
    );

    await scanInvoice(user, container);
    await user.click(screen.getByRole('button', { name: /Zaktualizuj 1/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Price batch rejected');
    expect(mockUpdateMaterialPrices).toHaveBeenCalledWith([
      { materialId: 7, expectedPrice: 50, newPrice: 75 },
    ]);
    expect(onPricesUpdated).not.toHaveBeenCalled();
    expect(screen.getByText(/Znaleziono 1/)).toBeInTheDocument();
  });

  it('retries only data refresh when prices were already persisted', async () => {
    const user = userEvent.setup();
    const onPricesUpdated = vi.fn()
      .mockRejectedValueOnce(new Error('Refresh failed'))
      .mockResolvedValueOnce();
    mockUpdateMaterialPrices.mockResolvedValue(scanResult);
    const { container } = render(
      <InvoiceScanner materials={materials} onPricesUpdated={onPricesUpdated} />,
    );

    await scanInvoice(user, container);
    await user.click(screen.getByRole('button', { name: /Zaktualizuj 1/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ceny zapisano/);

    await user.click(screen.getByRole('button', { name: /Zaktualizuj 1/ }));
    await waitFor(() => expect(onPricesUpdated).toHaveBeenCalledTimes(2));
    expect(mockUpdateMaterialPrices).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Znaleziono 1/)).not.toBeInTheDocument();
  });
});
