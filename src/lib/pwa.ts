function shouldDisableAppWorker() {
  if (!import.meta.env.PROD || window.top !== window.self) return true;
  const host = window.location.hostname;
  return (
    new URLSearchParams(window.location.search).get("sw") === "off" ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

export async function registerOfflineWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (shouldDisableAppWorker()) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => new URL(registration.active?.scriptURL ?? "", location.origin).pathname === "/sw.js")
        .map((registration) => registration.unregister()),
    );
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}