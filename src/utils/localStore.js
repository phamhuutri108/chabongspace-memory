const DB_NAME = 'chabongspace-memory';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';
const QUEUE_STORE = 'uploadQueue';

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('state', 'state', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Cannot open IndexedDB'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

async function transaction(storeName, mode, callback) {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const result = await callback(tx.objectStore(storeName));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
    return result;
  } finally {
    db.close();
  }
}

export async function putLocalPhoto(photo) {
  return transaction(PHOTO_STORE, 'readwrite', (store) => requestToPromise(store.put(photo)));
}

export async function deleteLocalPhoto(id) {
  return transaction(PHOTO_STORE, 'readwrite', (store) => requestToPromise(store.delete(id)));
}

export async function getLocalPhotos() {
  return transaction(PHOTO_STORE, 'readonly', (store) => requestToPromise(store.getAll()));
}

export async function putUploadJob(job) {
  return transaction(QUEUE_STORE, 'readwrite', (store) => requestToPromise(store.put(job)));
}

export async function getUploadJobs() {
  return transaction(QUEUE_STORE, 'readonly', (store) => requestToPromise(store.getAll()));
}

export async function deleteUploadJob(id) {
  return transaction(QUEUE_STORE, 'readwrite', (store) => requestToPromise(store.delete(id)));
}

export async function clearLocalMemory() {
  const db = await openDb();
  try {
    await Promise.all(
      [PHOTO_STORE, QUEUE_STORE].map(
        (storeName) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).clear();
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          })
      )
    );
  } finally {
    db.close();
  }
}

export function isLocalStoreAvailable() {
  return typeof indexedDB !== 'undefined';
}
