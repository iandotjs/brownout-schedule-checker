// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AccountDeletionModal from '../src/AccountDeletionModal';

const state = vi.hoisted(() => ({ pending: false }));
vi.mock('../src/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'preview-user', email: 'preview@example.test' },
  session: null,
  isDeletingAccount: state.pending,
  reauthenticateForDeletion: vi.fn(),
  deleteAccount: vi.fn(),
}) }));
vi.mock('../src/accountDeletion', () => ({
  clearDeletionIntent: vi.fn(),
  readDeletionIntent: () => null,
  verifyDeletionReadiness: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
});

afterEach(() => {
  cleanup();
  state.pending = false;
  vi.clearAllMocks();
});

describe('account deletion keyboard cancellation', () => {
  it('handles Escape without depending on the browser cancel event', () => {
    const onClose = vi.fn();
    render(<AccountDeletionModal isLightMode={false} returnedFromReauthentication={false} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel account deletion' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not dismiss a pending permanent deletion with Escape', () => {
    state.pending = true;
    const onClose = vi.fn();
    render(<AccountDeletionModal isLightMode returnedFromReauthentication={false} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});