document.addEventListener('DOMContentLoaded', () => {
    const updateOnlineStatus = () => {
        if (navigator.onLine) {
            toast.success('You are back online! Syncing...');
            syncData();
        } else {
            toast.info('You are offline. Changes will be saved locally.');
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Intercept Forms
    // Only target forms specifically marked for offline support
    const forms = document.querySelectorAll('form.offline-form');
    forms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            if (!navigator.onLine) {
                e.preventDefault();

                // Get form data
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                const url = form.action;
                const method = form.method.toUpperCase();

                try {
                    await window.idb.addToSyncQueue(url, method, data);
                    toast.success('Saved offline! Will sync when online.');
                    form.reset();

                    // Optional: Optimistic UI update could go here
                    // For now, we just reset the form
                } catch (err) {
                    console.error(err);
                    toast.error('Error saving offline data.');
                }
            }
        });
    });

    // Sync Data
    const syncData = async () => {
        try {
            const queue = await window.idb.getSyncQueue();
            if (queue.length === 0) return;

            // We'll send all changes in one bulk request if possible, 
            // or iterate. The plan mentioned "Bulk updates" or "Iterate".
            // Let's stick to the existing iteration logic for now, but we can also implement a bulk endpoint.
            // The plan said "Backend Sync: Implement POST /admin/finance/sync for bulk updates".
            // So let's try to send them all at once if we implement that endpoint.

            // For now, let's use the bulk endpoint strategy.
            try {
                const response = await fetch('/admin/finance/sync', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ changes: queue })
                });

                if (response.ok) {
                    await window.idb.clearSyncQueue();
                    toast.success('Sync complete!');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    console.error('Sync failed');
                    toast.error('Sync failed. Please try again.');
                }
            } catch (err) {
                console.error('Network error during sync', err);
                // Don't clear queue if network error
            }
        } catch (err) {
            console.error('Error accessing sync queue', err);
        }
    };

    // Initial check
    if (navigator.onLine) {
        syncData();
    }
});
