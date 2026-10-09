import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it.each([
    ['desktop shelf', { variant: 'shelf' }],
    ['mobile workspace', { variant: 'shelf', mobileWorkspaceLayout: true }],
    ['compact shelf', { variant: 'shelf', mobileLayout: true }],
    ['full tab', { variant: 'tab' }],
  ])('shows file action errors in the %s layout', (_name, props) => {
    const { unmount } = renderFilesTab(props, { fileActionError: 'Operacja nie powiodła się.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Operacja nie powiodła się.');
    unmount();
  });
});
