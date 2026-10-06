// System notifications for alerts: Windows toasts in the app (so an alert still
// reaches you over a fullscreen game or video), the browser's in the preview.

import { IS_TAURI } from "./bridge";

/** Asks for permission. Resolves to whether notifications can be shown. */
export async function enableNotifications(): Promise<boolean> {
  if (IS_TAURI) {
    const n = await import("@tauri-apps/plugin-notification");
    if (await n.isPermissionGranted()) return true;
    return (await n.requestPermission()) === "granted";
  }
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (IS_TAURI) {
      const n = await import("@tauri-apps/plugin-notification");
      if (await n.isPermissionGranted()) n.sendNotification({ title, body });
      return;
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/mascot/still/alert.svg", silent: true });
    }
  } catch {
    /* a notification that cannot be shown must never break an alert */
  }
}
