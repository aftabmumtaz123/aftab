const dbName = 'PortfolioDB';
const dbVersion = 2; // Incremented version
const storeName = 'portfolioStore';
const syncStoreName = 'syncQueue';

const idb = {
    openDB: () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(syncStoreName)) {
                    db.createObjectStore(syncStoreName, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject('IndexedDB error: ' + event.target.errorCode);
            };
        });
    },

    // --- General Data Methods ---
    saveData: (id, data) => {
        return idb.openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put({ id, data, timestamp: Date.now() });

                request.onsuccess = () => resolve('Data saved');
                request.onerror = (e) => reject('Error saving data: ' + e.target.error);
            });
        });
    },

    getData: (id) => {
        return idb.openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);

                request.onsuccess = (event) => {
                    resolve(event.target.result ? event.target.result.data : null);
                };
                request.onerror = (e) => reject('Error getting data: ' + e.target.error);
            });
        });
    },

    // --- Sync Queue Methods ---
    addToSyncQueue: (url, method, body) => {
        return idb.openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([syncStoreName], 'readwrite');
                const store = transaction.objectStore(syncStoreName);
                const request = store.add({ url, method, body, timestamp: Date.now() });

                request.onsuccess = () => resolve('Added to sync queue');
                request.onerror = (e) => reject('Error adding to sync queue: ' + e.target.error);
            });
        });
    },

    getSyncQueue: () => {
        return idb.openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([syncStoreName], 'readonly');
                const store = transaction.objectStore(syncStoreName);
                const request = store.getAll();

                request.onsuccess = (event) => {
                    resolve(event.target.result);
                };
                request.onerror = (e) => reject('Error getting sync queue: ' + e.target.error);
            });
        });
    },

    removeFromSyncQueue: (id) => {
        return idb.openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([syncStoreName], 'readwrite');
                const store = transaction.objectStore(syncStoreName);
                const request = store.delete(id);

                request.onsuccess = () => resolve('Removed from sync queue');
                request.onerror = (e) => reject('Error removing from sync queue: ' + e.target.error);
            });
        });
    }
};

// Expose to window
window.idb = idb;
