import { hostname } from 'node:os';
import path from 'node:path';
import { DEFAULT_SYNC_ROOT } from './constants.js';

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const readDriveSyncConfig = (environment = globalThis.process.env) => {
  const supabaseUrl = environment.JARVIS_SUPABASE_URL || environment.SUPABASE_URL;
  const serviceRoleKey = environment.JARVIS_SUPABASE_SERVICE_ROLE_KEY || environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Set JARVIS_SUPABASE_URL and JARVIS_SUPABASE_SERVICE_ROLE_KEY in the local agent environment.',
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    root: path.resolve(environment.JARVIS_DRIVE_SYNC_ROOT || DEFAULT_SYNC_ROOT),
    host: String(environment.JARVIS_DRIVE_SYNC_HOST || hostname()).trim(),
    debounceMs: positiveInteger(environment.JARVIS_DRIVE_SYNC_DEBOUNCE_MS, 3000),
    pollMs: positiveInteger(environment.JARVIS_DRIVE_SYNC_POLL_MS, 30000),
    heartbeatMs: positiveInteger(environment.JARVIS_DRIVE_SYNC_HEARTBEAT_MS, 15000),
    leaseSeconds: positiveInteger(environment.JARVIS_DRIVE_SYNC_LEASE_SECONDS, 45),
  };
};
