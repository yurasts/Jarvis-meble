import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import userActivityRepository from '../data/userActivityRepository';
import { detectDeviceType, summarizeUserAgent } from '../utils/userActivity';

export const ACTIVITY_HEARTBEAT_MS = 5 * 60 * 1000;

export default function useActivityTracker({
  session,
  client = supabase,
  repository = userActivityRepository,
  heartbeatMs = ACTIVITY_HEARTBEAT_MS,
} = {}) {
  const startedUserRef = useRef(null);

  const sendActivity = useCallback(async (eventType) => {
    try {
      await repository.record({
        eventType,
        deviceType: detectDeviceType(),
        userAgent: summarizeUserAgent(),
      });
    } catch {
      // Activity telemetry is best-effort and must never interrupt application work.
    }
  }, [repository]);

  useEffect(() => {
    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN' && nextSession?.user?.id) {
        // The parent auth listener will expose this same session on the next render.
        // Mark it as started now so a real login creates one sign_in row, not an
        // immediate sign_in + session_start pair.
        startedUserRef.current = nextSession.user.id;
        void sendActivity('sign_in');
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [client, sendActivity]);

  const sessionUserId = session?.user?.id || null;

  useEffect(() => {
    if (!sessionUserId) {
      startedUserRef.current = null;
      return undefined;
    }

    if (startedUserRef.current !== sessionUserId) {
      startedUserRef.current = sessionUserId;
      void sendActivity('session_start');
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sendActivity('session_start');
      }
    }, heartbeatMs);

    return () => window.clearInterval(timer);
  }, [heartbeatMs, sendActivity, sessionUserId]);
}
