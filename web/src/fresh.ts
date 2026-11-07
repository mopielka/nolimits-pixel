/**
 * GitHub Pages lets browsers cache index.html for 10 minutes, so right after a deploy the old
 * page (and the old script it points to) can keep loading. Compare the script this page runs
 * with the one the server's index.html points to now, and reload once if they differ.
 */
export async function reloadIfStale(): Promise<void> {
  if (import.meta.env.DEV) return;
  const running = document.querySelector<HTMLScriptElement>('script[type=module][src]')?.src;
  if (!running) return;
  try {
    const html = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const latest = new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLScriptElement>('script[type=module][src]');
    if (!latest) return;
    const latestUrl = new URL(latest.getAttribute('src')!, location.href).href;
    const key = 'pixel-player-reloaded-for';
    if (latestUrl !== running && sessionStorage.getItem(key) !== latestUrl) {
      sessionStorage.setItem(key, latestUrl);
      location.reload();
    }
  } catch {
    // Offline or storage blocked – keep running what we have.
  }
}
