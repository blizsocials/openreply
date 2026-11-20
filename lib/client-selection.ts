"use client";

/**
 * Blizsocials: the client (Instagram account) chosen in the sidebar switcher.
 * Shared across pages through localStorage and a window event so every page
 * follows the same client.
 */

const KEY = "bliz.client";
const EVENT = "bliz-client-change";

export function readClient(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeClient(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the change still applies to this page view.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

export function onClientChange(handler: (id: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
