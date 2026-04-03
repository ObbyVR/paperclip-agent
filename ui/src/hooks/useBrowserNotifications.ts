import { useEffect, useRef } from "react";
import type { InboxBadgeData } from "../lib/inbox";

const PERMISSION_KEY = "paperclip:notifications:asked";

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
    }

    // New failed runs
    if (badge.failedRuns > prev.failedRuns) {
      sendNotification(
        "Run fallito",
        "Un agente ha avuto un errore durante l'esecuzione",
      );
    }
  }, [badge]);
}
