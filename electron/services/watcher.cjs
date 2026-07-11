const chokidar = require('chokidar');

function shouldSuppressEvent(last, kind, now, windowMs = 500) {
  return last?.kind === kind && now - last.time < windowMs;
}

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
      const emit = (kind) => {
        const now = Date.now();
        const last = lastEvents.get(filePath);
        if (shouldSuppressEvent(last, kind, now)) return;
        lastEvents.set(filePath, { kind, time: now });
        sendChanged({ path: filePath, kind });
      };
      watcher.on('change', () => emit('change'));
      watcher.on('add', () => emit('change'));
      watcher.on('unlink', () => emit('unlink'));
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

module.exports = { createWatcherManager, shouldSuppressEvent };
