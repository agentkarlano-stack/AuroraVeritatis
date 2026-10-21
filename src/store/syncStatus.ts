import { create } from 'zustand';

export interface SyncStatus {
  state: 'off' | 'syncing' | 'synced' | 'skipped' | 'error';
  /** ISO time of the last successful sync. */
  at?: string;
  message?: string;
}

/** In-memory status of cloud preference sync, shown on the Account page. */
export const useSyncStatus = create<SyncStatus>(() => ({ state: 'off' }));
