declare const __APP_VERSION__: string;

let started = false;
let pendingWrites = 0;

// Hold reloads until an API mutation and its response have finished.
export function holdAppUpdate() {
  pendingWrites++;
  let released = false;
  return () => {
    if (!released) pendingWrites--;
    released = true;
  };
}

function workerVersion(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (version: string | null) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(version);
    };
    const timeout = window.setTimeout(() => finish(null), 2000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) =>
      finish(typeof event.data === 'string' ? event.data : null);
    try {
      worker.postMessage({ type: 'AEGITASKS_VERSION' }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

export function startAppUpdates() {
  if (started || !import.meta.env.PROD) return;
  started = true;
  const supported = 'serviceWorker' in navigator;
  let registration: ServiceWorkerRegistration | undefined;
  let pendingVersion = '';
  let reloading = false;
  let checking = false;
  let lastCheck = 0;
  let reloadTimer: number | undefined;

  function applyUpdate() {
    if (!pendingVersion || reloading || !navigator.onLine || document.visibilityState !== 'visible')
      return;
    // Editors retain their state in memory. Never store private notes or passwords just to reload.
    if (
      pendingWrites ||
      document.querySelector('dialog[open], [role="dialog"], [data-update-blocked="true"]')
    )
      return;
    try {
      const key = 'aegitasks:update-reload';
      const previous = JSON.parse(sessionStorage.getItem(key) || 'null') as {
        from: string;
        at: number;
      } | null;
      // Bound retries if a proxy serves mismatched/old assets during a deployment.
      if (previous?.from === __APP_VERSION__ && Date.now() - previous.at < 60_000) return;
      sessionStorage.setItem(key, JSON.stringify({ from: __APP_VERSION__, at: Date.now() }));
    } catch {
      /* Storage restrictions must not disable updates. */
    }
    reloading = true;
    window.location.reload();
  }

  function updateReady(version: string) {
    if (version === __APP_VERSION__) {
      pendingVersion = '';
      clearInterval(reloadTimer);
      reloadTimer = undefined;
      return;
    }
    pendingVersion = version;
    // Only poll local blockers while an update is pending; this makes no API requests.
    reloadTimer ??= window.setInterval(applyUpdate, 1000);
    applyUpdate();
  }

  async function checkController() {
    const controller = supported ? navigator.serviceWorker.controller : null;
    if (!controller) return;
    const version = await workerVersion(controller);
    // A worker may be replaced again while replying (two deployments in quick succession).
    if (version && navigator.serviceWorker.controller === controller) updateReady(version);
  }

  if (supported)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      void checkController();
    });

  async function check() {
    if (
      checking ||
      !navigator.onLine ||
      document.visibilityState !== 'visible' ||
      Date.now() - lastCheck < 15_000
    )
      return;
    checking = true;
    lastCheck = Date.now();
    let targetVersion = '';
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const data: unknown = await response.json();
        if (
          typeof data === 'object' &&
          data !== null &&
          'version' in data &&
          typeof data.version === 'string'
        )
          targetVersion = data.version;
      }
    } catch {
      /* Offline launches and temporary deploy failures keep the installed app. */
    }
    try {
      if (supported) {
        registration ??= await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        await registration.update();
        await checkController();
      }
    } catch {
      /* Retry on the next foreground, online or periodic check. */
    } finally {
      checking = false;
      // A controlled tab must wait for the new precache, otherwise it reloads the old shell.
      // Browsers without a usable worker can still update from the version endpoint.
      if (targetVersion && (!supported || (!registration && !navigator.serviceWorker.controller)))
        updateReady(targetVersion);
    }
  }

  void check();
  window.addEventListener('online', () => {
    void check();
    applyUpdate();
  });
  window.addEventListener('pageshow', () => {
    void check();
    applyUpdate();
  });
  document.addEventListener('visibilitychange', () => {
    void check();
    applyUpdate();
  });
  window.setInterval(() => {
    void check();
  }, 60_000);
}
