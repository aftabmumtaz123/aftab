// Dashboard Cache Manager
const dashboardCache = {
    CACHE_KEY: 'dashboard_data',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

    // Save dashboard data to IndexedDB
    async save(data) {
        try {
            const db = await idbUtility.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['cache'], 'readwrite');
                const store = transaction.objectStore('cache');

                const cacheEntry = {
                    key: this.CACHE_KEY,
                    data: data,
                    timestamp: Date.now()
                };

                const request = store.put(cacheEntry);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.error('Failed to save dashboard cache:', err);
        }
    },

    // Get dashboard data from IndexedDB
    async get() {
        try {
            const db = await idbUtility.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['cache'], 'readonly');
                const store = transaction.objectStore('cache');
                const request = store.get(this.CACHE_KEY);

                request.onsuccess = () => {
                    const result = request.result;
                    if (!result) {
                        resolve(null);
                        return;
                    }

                    // Check if cache is still valid
                    const age = Date.now() - result.timestamp;
                    if (age > this.CACHE_DURATION) {
                        resolve(null);
                        return;
                    }

                    resolve(result.data);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.error('Failed to get dashboard cache:', err);
            return null;
        }
    },

    // Clear dashboard cache
    async clear() {
        try {
            const db = await idbUtility.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['cache'], 'readwrite');
                const store = transaction.objectStore('cache');
                const request = store.delete(this.CACHE_KEY);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.error('Failed to clear dashboard cache:', err);
        }
    }
};

// Auto-refresh dashboard data when online
if (typeof window !== 'undefined') {
    window.addEventListener('online', async () => {
        console.log('Back online - refreshing dashboard data...');

        // Clear cache to force fresh data
        await dashboardCache.clear();

        // Reload if we're on the dashboard page
        if (window.location.pathname === '/admin/dashboard') {
            window.location.reload();
        }
    });
}
