const chokidar = require('chokidar');

function createWatcherManager(sendChanged) {
  const watchers = new Map();
  const lastEvents = new Map();

  return {
    watch(filePath) {
      if (watchers.has(filePath)) return;
      const watcher = chokidar.watch(filePath, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });
      watcher.on('change', () => {
        const now = Date.now();
        const last = lastEvents.get(filePath) ?? 0;
        if (now - last < 500) return;
        lastEvents.set(filePath, now);
        sendChanged(filePath);
      });
      watcher.on('unlink', () => {
        lastEvents.set(filePath, Date.now());
        sendChanged(filePath);
      });
      watcher.on('error', (error) => {
        console.error('[Watcher] failed:', filePath, error);
      });
      watchers.set(filePath, watcher);
    },
    async unwatch(filePath) {
      const watcher = watchers.get(filePath);
      if (!watcher) return;
      watchers.delete(filePath);
      lastEvents.delete(filePath);
      await watcher.close();
    },
    async closeAll() {
      const closing = Array.from(watchers.values()).map((watcher) => watcher.close());
      watchers.clear();
      lastEvents.clear();
      await Promise.allSettled(closing);
    },
  };
}

module.exports = { createWatcherManager };
