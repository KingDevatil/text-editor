const path = require('node:path');
const { Worker } = require('node:worker_threads');

const activeWorkers = new Map();

function cancelSearch(searchId) {
  if (searchId) {
    const worker = activeWorkers.get(searchId);
    if (worker) {
      activeWorkers.delete(searchId);
      worker.terminate();
    }
    return;
  }

  for (const worker of activeWorkers.values()) {
    worker.terminate();
  }
  activeWorkers.clear();
}

function searchDirectory(dir, options, maxResults = 1000, searchId = `search-${Date.now()}-${Math.random()}`) {
  cancelSearch(searchId);

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'searchWorker.cjs'), {
      workerData: { dir, options, maxResults },
    });
    activeWorkers.set(searchId, worker);

    worker.on('message', (message) => {
      if (message?.type === 'done') {
        activeWorkers.delete(searchId);
        resolve(message.results);
      } else if (message?.type === 'error') {
        activeWorkers.delete(searchId);
        reject(new Error(message.message || 'Search failed'));
      }
    });
    worker.on('error', (error) => {
      activeWorkers.delete(searchId);
      reject(error);
    });
    worker.on('exit', (code) => {
      activeWorkers.delete(searchId);
      if (code !== 0) {
        reject(new Error(`Search worker exited with code ${code}`));
      }
    });
  });
}

module.exports = { cancelSearch, searchDirectory };
