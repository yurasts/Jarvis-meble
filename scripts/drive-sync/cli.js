import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { readDriveSyncConfig } from './config.js';
import { isIgnoredLocalFile } from './pathMapping.js';
import { createDriveSyncRemote } from './remote.js';
import { syncDriveOnce } from './syncEngine.js';

const config = readDriveSyncConfig();
const remote = createDriveSyncRemote(config);
const once = globalThis.process.argv.includes('--once');
let activeSync = null;
let queued = false;
let debounceTimer = null;
let watcher = null;
let shuttingDown = false;

await mkdir(config.root, { recursive: true });

const acquireLease = () => remote.acquireLease({
  host: config.host,
  root: config.root,
  leaseSeconds: config.leaseSeconds,
});

const performSync = async () => {
  if (shuttingDown) return false;
  if (activeSync) {
    queued = true;
    return activeSync;
  }

  activeSync = (async () => {
    let acquired = false;
    let syncHeartbeatTimer = null;
    try {
      acquired = await acquireLease();
      if (!acquired) {
        console.log(`[drive-sync] ${config.host}: waiting for the active leader lease.`);
        return false;
      }
      syncHeartbeatTimer = globalThis.setInterval(() => {
        void acquireLease().catch(error => console.error('[drive-sync] in-progress heartbeat failed:', error));
      }, config.heartbeatMs);

      const summary = await syncDriveOnce({ remote, root: config.root });
      await remote.reportResult({ host: config.host, summary, error: null });
      console.log(`[drive-sync] ${config.host}: synchronized ${summary.projects} projects / ${summary.files} files.`);
      return true;
    } catch (error) {
      console.error('[drive-sync] synchronization failed:', error);
      if (acquired) {
        await remote.reportResult({
          host: config.host,
          summary: null,
          error: error?.message || String(error),
        }).catch(reportError => console.error('[drive-sync] status update failed:', reportError));
      }
      if (once) globalThis.process.exitCode = 1;
      return false;
    } finally {
      if (syncHeartbeatTimer) globalThis.clearInterval(syncHeartbeatTimer);
      activeSync = null;
      if (queued && !shuttingDown) {
        queued = false;
        void performSync();
      }
    }
  })();
  return activeSync;
};

if (once) {
  const acquired = await performSync();
  if (acquired) await remote.releaseLease(config.host);
} else {
  const scheduleSync = () => {
    if (debounceTimer) globalThis.clearTimeout(debounceTimer);
    debounceTimer = globalThis.setTimeout(() => {
      debounceTimer = null;
      void performSync();
    }, config.debounceMs);
  };

  try {
    watcher = watch(config.root, { recursive: true }, (_eventType, filename) => {
      if (filename && !isIgnoredLocalFile(filename)) scheduleSync();
    });
    watcher.on('error', error => console.error('[drive-sync] file watcher failed; polling remains active:', error));
  } catch (error) {
    console.error('[drive-sync] recursive watch unavailable; polling remains active:', error);
  }

  const pollTimer = globalThis.setInterval(() => void performSync(), config.pollMs);
  const heartbeatTimer = globalThis.setInterval(async () => {
    try {
      await acquireLease();
    } catch (error) {
      console.error('[drive-sync] lease heartbeat failed:', error);
    }
  }, config.heartbeatMs);

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[drive-sync] received ${signal}; releasing leader lease.`);
    watcher?.close();
    globalThis.clearInterval(pollTimer);
    globalThis.clearInterval(heartbeatTimer);
    if (debounceTimer) globalThis.clearTimeout(debounceTimer);
    if (activeSync) await activeSync;
    await remote.releaseLease(config.host).catch(error => console.error('[drive-sync] lease release failed:', error));
  };

  globalThis.process.once('SIGINT', () => void shutdown('SIGINT'));
  globalThis.process.once('SIGTERM', () => void shutdown('SIGTERM'));
  await performSync();
}
