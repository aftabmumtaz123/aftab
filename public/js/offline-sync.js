document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'offline-status';
    statusDiv.className = 'fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 transform translate-y-20 opacity-0 z-50';
    document.body.appendChild(statusDiv);

    const showStatus = (message, type = 'info') => {
        statusDiv.textContent = message;
        statusDiv.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 z-50 ${type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-blue-600'}`;
        statusDiv.classList.remove('translate-y-20', 'opacity-0');

        setTimeout(() => {
            statusDiv.classList.add('translate-y-20', 'opacity-0');
        }, 3000);
    };

    const updateOnlineStatus = () => {
        if (navigator.onLine) {
            showStatus('You are back online! Syncing...', 'success');
            syncData();
        } else {
            showStatus('You are offline. Changes will be saved locally.', 'info');
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Intercept Forms
    const forms = document.querySelectorAll('form');
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
                    showStatus('Saved offline! Will sync when online.', 'success');
                    form.reset();
                } catch (err) {
                    console.error(err);
                    showStatus('Error saving offline data.', 'error');
                }
            }
        });
    });

    // Sync Data
    const syncData = async () => {
        try {
            const queue = await window.idb.getSyncQueue();
            if (queue.length === 0) return;

            for (const item of queue) {
                try {
                    const response = await fetch(item.url, {
                        method: item.method,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(item.body)
                    });

                    if (response.ok) {
                        await window.idb.removeFromSyncQueue(item.id);
                    } else {
                        console.error('Sync failed for item', item.id);
                    }
                } catch (err) {
                    console.error('Network error during sync', err);
                }
            }

            // Reload to show new data if we synced something
            if (queue.length > 0) {
                showStatus('Sync complete!', 'success');
                setTimeout(() => window.location.reload(), 1000);
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
