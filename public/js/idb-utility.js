const DB_NAME = 'portfolio-db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_changes';

const idbUtility = {
    openDB: () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => reject('IndexedDB error: ' + event.target.error);

            request.onsuccess = (event) => resolve(event.target.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create main pending changes store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }

                // Create separate stores for different entity types (v2)
                if (event.oldVersion < 2) {
                    if (!db.objectStoreNames.contains('pending_projects')) {
                        db.createObjectStore('pending_projects', { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains('pending_skills')) {
                        db.createObjectStore('pending_skills', { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains('pending_experience')) {
                        db.createObjectStore('pending_experience', { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains('pending_testimonials')) {
                        db.createObjectStore('pending_testimonials', { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains('pending_config')) {
                        db.createObjectStore('pending_config', { keyPath: 'id', autoIncrement: true });
                    }
                }
            };
        });
    },

    addToSyncQueue: async (url, method, body) => {
        const db = await idbUtility.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add({
                url,
                method,
                body,
                timestamp: Date.now()
            });

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    getSyncQueue: async () => {
        const db = await idbUtility.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    removeFromSyncQueue: async (id) => {
        const db = await idbUtility.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    clearSyncQueue: async () => {
        const db = await idbUtility.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

window.idb = idbUtility;
