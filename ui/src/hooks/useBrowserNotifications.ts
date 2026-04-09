import { useEffect, useRef } from "react";
import type { InboxBadgeData } from "../lib/inbox";

const PERMISSION_KEY = "paperclip:notifications:asked";
const SOUND_PREF_KEY = "paperclip:notifications:sound";

/**
 * Play a subtle notification beep using AudioContext.
 * No audio file needed — synthesized on the fly.
 * `urgency` controls pitch: "critical" = higher pitch double beep,
 * "high" = single mid beep.
 */
function playNotificationSound(urgency: "critical" | "high" = "high") {
  if (localStorage.getItem(SOUND_PREF_KEY) === "off") return;
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);

    if (urgency === "critical") {
      // Double beep (higher pitch)
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.18);
        osc.connect(gain);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.1);
      }
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.4);
      setTimeout(() => ctx.close(), 500);
    } else {
      // Single soft beep
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.15);
      setTimeout(() => ctx.close(), 300);
    }
  } catch {
    // AudioContext not available
  }
}

function canNotify(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function sendNotification(title: string, body: string) {
  if (!canNotify() || !document.hidden) return;
  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `paperclip-${title}`,
    });
  } catch {
    // Notification constructor can throw in some environments
  }
}

export function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  if (sessionStorage.getItem(PERMISSION_KEY)) return;

  sessionStorage.setItem(PERMISSION_KEY, "1");
  Notification.requestPermission();
}

export function useBrowserNotifications(badge: InboxBadgeData | null) {
  const prevRef = useRef<InboxBadgeData | null>(null);

  // Request permission on first render
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!badge) return;
    const prev = prevRef.current;
    prevRef.current = badge;

    // Skip first render (no previous data to compare)
    if (!prev) return;

    // New approvals pending
    if (badge.approvals > prev.approvals) {
      const diff = badge.approvals - prev.approvals;
      sendNotification(
        "Nuova approvazione",
        diff === 1
          ? "Hai 1 nuova approvazione da gestire"
          : `Hai ${diff} nuove approvazioni da gestire`,
      );
      playNotificationSound("critical");
    }

    // New unread issues (comments)
    if (badge.mineIssues > prev.mineIssues) {
      const diff = badge.mineIssues - prev.mineIssues;
      sendNotification(
        "Nuovi commenti",
        diff === 1
          ? "Hai 1 issue con nuovi commenti"
          : `Hai ${diff} issue con nuovi commenti`,
      );
      playNotificationSound("high");
    }

    // New failed runs
    if (badge.failedRuns > prev.failedRuns) {
      sendNotification(
        "Run fallito",
        "Un agente ha avuto un errore durante l'esecuzione",
      );
      playNotificationSound("critical");
    }
  }, [badge]);
}
