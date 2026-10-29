import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FilesTab from './FilesTab';

const { mockUseProjectFiles } = vi.hoisted(() => ({
  mockUseProjectFiles: vi.fn(),
}));

vi.mock('./useProjectFiles', () => ({ default: mockUseProjectFiles }));
vi.mock('../supabase', () => ({ supabase: {} }));

const imageFile = {
  id: 'image-1',
  category: 'usterki',
  file_name: 'front.jpg',
  file_path: 'client-1/front.jpg',
  file_url: 'https://files/front.jpg',
  signed_url: 'https://signed/front.jpg',
  file_type: 'image/jpeg',
  comment: '',
};

const documentFile = {
  id: 'document-1',
  category: 'montaz',
  file_name: 'assembly.pdf',
  file_path: 'client-1/assembly.pdf',
  file_url: 'https://files/assembly.pdf',
  signed_url: 'https://signed/assembly.pdf',
  file_type: 'application/pdf',
  comment: 'Instrukcja',
};

const stoFile = {
  id: 'sto-1',
  category: 'sto',
  file_name: 'kitchen.sto',
  file_path: 'client-1/sto/kitchen.sto',
  file_url: 'https://files/kitchen.sto',
  file_type: 'application/octet-stream',
  comment: '',
};

const createHookResult = (overrides = {}) => ({
  files: [imageFile, documentFile, stoFile],
  loading: false,
  uploading: false,
  deletingFileId: null,
  fileActionError: '',
  clearFileActionError: vi.fn(),
  settingCover: false,
  replacingSto: false,
  downloadingSto: false,
  stoError: '',
  uploadFiles: vi.fn(async () => {}),
  replaceSto: vi.fn(async () => true),
  removeFile: vi.fn(async () => true),
  updateComment: vi.fn(async () => true),
  toggleCover: vi.fn(async () => true),
  downloadSto: vi.fn(async () => true),
  ...overrides,
});

const renderFilesTab = (props = {}, hookOverrides = {}) => {
  const hookResult = createHookResult(hookOverrides);
  mockUseProjectFiles.mockReturnValue(hookResult);
  const rendered = render(
    <FilesTab
      clientId="client-1"
      currentProfile={{ id: 'user-1', color: '#123456' }}
      coverUrl={null}
      {...props}
    />,
  );
  return { ...rendered, hookResult };
};

describe('FilesTab', () => {
  beforeEach(() => {
    mockUseProjectFiles.mockReset();
  });

  it('uses one selected category for filtering and uploading', async () => {
    const user = userEvent.setup();
    const { container, hookResult } = renderFilesTab({ variant: 'tab' });

    expect(screen.getByAltText('front.jpg')).toBeInTheDocument();
    expect(screen.queryByText('assembly.pdf')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Folder plików projektu'), 'montaz');
    expect(screen.getByText('assembly.pdf')).toBeInTheDocument();
    expect(screen.queryByAltText('front.jpg')).not.toBeInTheDocument();

    const selectedFile = new File(['photo'], 'after.jpg', { type: 'image/jpeg' });
    const input = container.querySelector('input[type="file"][multiple]');
    fireEvent.change(input, { target: { files: [selectedFile] } });

    await waitFor(() => {
      expect(hookResult.uploadFiles).toHaveBeenCalledWith([selectedFile], 'montaz');
    });
  });

  it('confirms desktop deletion before calling the data layer', async () => {
    const user = userEvent.setup();
    const { hookResult } = renderFilesTab({ variant: 'shelf' });

    await user.click(screen.getByRole('button', { name: 'Usuń plik front.jpg' }));
    expect(screen.getByRole('dialog', { name: 'Usunąć plik front.jpg?' })).toBeInTheDocument();
    expect(hookResult.clearFileActionError).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Tak' }));
    await waitFor(() => expect(hookResult.removeFile).toHaveBeenCalledWith(imageFile));
  });

  it('delegates cover and comment changes from the detailed view', async () => {
    const user = userEvent.setup();
    const { hookResult } = renderFilesTab({ variant: 'tab' });

    await user.click(screen.getByTitle('Ustaw jako okładkę projektu'));
    expect(hookResult.toggleCover).toHaveBeenCalledWith(imageFile);

    await user.click(screen.getByText('+ komentarz'));
    const commentInput = screen.getByLabelText('Komentarz do front.jpg');
    await user.type(commentInput, 'Gotowe');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(hookResult.updateComment).toHaveBeenCalledWith(imageFile, 'Gotowe');
    });
  });

  it('passes a replacement STO file together with the current row', async () => {
    const { container, hookResult } = renderFilesTab({ variant: 'shelf' });
    const replacement = new File(['sto'], 'updated.sto', { type: 'application/octet-stream' });
    const input = container.querySelector('input[accept=".sto"]');

    fireEvent.change(input, { target: { files: [replacement] } });

    await waitFor(() => {
      expect(hookResult.replaceSto).toHaveBeenCalledWith(replacement, stoFile);
    });
  });

  it('shows desktop folders in the order Projekt, Zadanie, Krój, Montaż', () => {
    renderFilesTab({ variant: 'shelf' });

    const labels = ['Projekt', 'Zadanie', 'Krój', 'Montaż'];
    const buttons = screen.getAllByRole('button').filter(button => labels.includes(button.textContent));
    expect(buttons.map(button => button.textContent)).toEqual(labels);
    expect(screen.queryByRole('button', { name: 'Inne' })).not.toBeInTheDocument();
  });

  it('keeps the mobile workspace folders in the same order as desktop', () => {
    // Redesign 2026-10-18: kolumna folderów obok dużej karuzeli jest wąska (54px), więc przyciski
    // pokazują ikonę + skróconą etykietę zamiast samego tekstu jak na desktopie — nazwa folderu
    // nadal jest dostępna przez aria-label (tu porównywane zamiast textContent).
    renderFilesTab({ variant: 'shelf', mobileWorkspaceLayout: true });

    const labels = ['Projekt', 'Zadanie', 'Krój', 'Montaż'];
    const buttons = screen.getAllByRole('button').filter(button => labels.includes(button.getAttribute('aria-label')));
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(labels);
  });

  it('renders the desktop workspace rail on the left and uploads dropped files to the target category', async () => {
    const { hookResult } = renderFilesTab({ variant: 'shelf', desktopWorkspaceLayout: true });

    const rail = screen.getByRole('group', { name: 'Kategorie plików projektu' });
    const tabs = within(rail).getAllByRole('button').slice(0, 4);
    expect(tabs.map(tab => tab.getAttribute('aria-label'))).toEqual(['Projekt', 'Zadanie', 'Krój', 'Montaż']);
    expect(within(rail).getByRole('button', { name: 'Projekt' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(within(rail).getByRole('button', { name: 'Projekt' })).getByText('1')).toBeInTheDocument();
    expect(within(within(rail).getByRole('button', { name: 'Montaż' })).getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj plik lub zdjęcie do folderu Projekt' })).toBeVisible();

    const previewFile = new File(['photo'], 'preview.jpg', { type: 'image/jpeg' });
    const preview = screen.getByTestId('project-files-preview');
    fireEvent.drop(preview, {
      dataTransfer: { files: [previewFile], types: ['Files'] },
    });
    await waitFor(() => {
      expect(hookResult.uploadFiles).toHaveBeenCalledWith([previewFile], 'usterki');
    });

    const cutFile = new File(['cut'], 'cut.pdf', { type: 'application/pdf' });
    const cutTab = within(rail).getByRole('button', { name: 'Krój' });
    fireEvent.drop(cutTab, {
      dataTransfer: { files: [cutFile], types: ['Files'] },
    });
    await waitFor(() => {
      expect(hookResult.uploadFiles).toHaveBeenCalledWith([cutFile], 'inne');
    });
    expect(cutTab).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows only previews in the desktop gallery and keeps size/date in the .sto header', () => {
    const stoTarget = document.createElement('div');
    document.body.appendChild(stoTarget);
    const sizedFiles = [
      { ...imageFile, category: 'usterki', size_bytes: 120 * 1024, uploaded_at: '2026-09-22T18:59:00Z' },
      {
        ...documentFile,
        category: 'usterki',
        file_name: 'bardzo_dlugi_kosztorys_kuchni.pdf',
        size_bytes: 2048,
        uploaded_at: '2026-09-22T18:59:00Z',
      },
      { ...stoFile, file_name: 'Przedpokój_druga_strona_v1.sto', size_bytes: 176 * 1024, uploaded_at: '2026-09-22T18:59:00Z' },
    ];
    const { container } = renderFilesTab(
      { variant: 'shelf', desktopWorkspaceLayout: true, desktopStoTarget: stoTarget },
      { files: sizedFiles },
    );

    expect(container.querySelector('[data-desktop-file-list]')).toBeNull();
    expect(screen.queryByText(/120 KB/)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'front.jpg' })).toBeInTheDocument();

    const documentTile = screen.getByRole('link', { name: /PDF/ });
    expect(documentTile).not.toHaveTextContent('KB');
    expect(documentTile).toHaveTextContent('PDF');

    const stoHeader = stoTarget.querySelector('[data-project-sto-header]');
    expect(stoHeader).toHaveTextContent('Przedpokój_druga_strona_v1.sto · 176 KB · 22.09.2026, 20:59');
    stoTarget.remove();
  });

  it('lets the sidebar control the folder and upload in external-controls mode', async () => {
    const uploadTriggerRef = { current: null };
    const onUploadingChange = vi.fn();
    const { container, hookResult, rerender } = renderFilesTab({
      variant: 'shelf',
      externalFolderControls: true,
      category: 'usterki',
      onCategoryChange: vi.fn(),
      uploadTriggerRef,
      onUploadingChange,
    });

    expect(screen.queryByText('Pliki projektu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Projekt' })).not.toBeInTheDocument();
    expect(screen.getByAltText('front.jpg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pobierz' })).toBeInTheDocument();
    expect(typeof uploadTriggerRef.current).toBe('function');
    expect(onUploadingChange).toHaveBeenCalledWith(false);

    rerender(
      <FilesTab
        clientId="client-1"
        currentProfile={{ id: 'user-1', color: '#123456' }}
        coverUrl={null}
        variant="shelf"
        externalFolderControls
        category="inne"
        onCategoryChange={vi.fn()}
        uploadTriggerRef={uploadTriggerRef}
        onUploadingChange={onUploadingChange}
      />,
    );
    expect(screen.queryByAltText('front.jpg')).not.toBeInTheDocument();
    expect(screen.getByText(/Brak plików w folderze „Krój”/)).toBeInTheDocument();

    const input = container.querySelector('input[type="file"][multiple]');
    const clickSpy = vi.spyOn(input, 'click');
    uploadTriggerRef.current();
    expect(clickSpy).toHaveBeenCalledOnce();

    const selectedFile = new File(['cut'], 'kroj.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [selectedFile] } });
    await waitFor(() => {
      expect(hookResult.uploadFiles).toHaveBeenCalledWith([selectedFile], 'inne');
    });
  });

  it.each([
    ['desktop shelf', { variant: 'shelf' }],
    ['desktop shelf with sidebar folders', { variant: 'shelf', externalFolderControls: true, category: 'usterki' }],
    ['mobile workspace', { variant: 'shelf', mobileWorkspaceLayout: true }],
    ['compact shelf', { variant: 'shelf', mobileLayout: true }],
    ['full tab', { variant: 'tab' }],
  ])('shows file action errors in the %s layout', (_name, props) => {
    const { unmount } = renderFilesTab(props, { fileActionError: 'Operacja nie powiodła się.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Operacja nie powiodła się.');
    unmount();
  });
});
