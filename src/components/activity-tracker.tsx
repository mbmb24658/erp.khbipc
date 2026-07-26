"use client";

import { useEffect, useRef } from "react";

/**
 * Activity Tracker — sends a heartbeat to /api/users/online every 60 seconds
 * to update the current user's lastActivityAt timestamp. This is used to
 * determine who is "online" (active in the last 5 minutes).
 *
 * Mounted once at the admin layout level. Renders nothing visible.
 */
export function ActivityTracker() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Send an initial heartbeat on mount
    const heartbeat = async () => {
      try {
        await fetch("/api/users/online", { method: "GET" });
      } catch {
        // ignore — non-fatal
      }
    };

    heartbeat();
    intervalRef.current = setInterval(heartbeat, 60_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return null;
}
