document.addEventListener('DOMContentLoaded', () => {
    // Create Offline Badge
    const createOfflineBadge = () => {
        const badge = document.createElement('div');
        badge.id = 'offline-badge';
        badge.className = 'fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-full shadow-lg z-50 transform translate-y-20 transition-transform duration-300 flex items-center hidden';
        badge.innerHTML = '<i class="fas fa-wifi-slash mr-2"></i> <span>You are offline</span>';
        document.body.appendChild(badge);
        return badge;
    };

    const offlineBadge = createOfflineBadge();

    const updateOnlineStatus = () => {
        if (navigator.onLine) {
            offlineBadge.classList.add('translate-y-20');
            setTimeout(() => offlineBadge.classList.add('hidden'), 300);
            toast.success('You are back online! Syncing...');
            syncData();
        } else {
            offlineBadge.classList.remove('hidden');
            // Small delay to allow display:block to apply before transform
            setTimeout(() => offlineBadge.classList.remove('translate-y-20'), 10);
            toast.info('You are offline. Changes will be saved locally.');
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initial check
    if (!navigator.onLine) {
        updateOnlineStatus();
    }

    // Intercept Forms
    // Target all forms that modify data (POST methods)
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        // Skip search forms or GET forms
        if (form.method.toUpperCase() === 'GET') return;

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

                    // If it's a modal form, close it (heuristic: check for close button or parent modal)
                    const modal = form.closest('.fixed'); // Simple check for tailwind modal
                    if (modal) {
                        // Try to find a cancel/close button and click it, or hide it directly
                        // This is specific to how modals are implemented, assuming standard behavior
                        // For now, just let the user close it manually or redirect if needed
                    }

                    // If it was a redirect-after-post, we might want to simulate that or just stay put
                    // For now, staying put with a toast is good.
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

            // Determine which sync endpoint to use based on the changes
            const hasFinanceChanges = queue.some(item => item.url.includes('/finance'));
            const hasAdminChanges = queue.some(item => !item.url.includes('/finance'));

            // Sync finance changes
            if (hasFinanceChanges) {
                const financeChanges = queue.filter(item => item.url.includes('/finance'));
                const response = await fetch('/admin/finance/sync', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ changes: financeChanges })
                });

                if (!response.ok) {
                    console.error('Finance sync failed');
                    toast.error('Finance sync failed. Please try again.');
                    return;
                }
            }

            // Sync admin changes
            if (hasAdminChanges) {
                const adminChanges = queue.filter(item => !item.url.includes('/finance'));
                const response = await fetch('/admin/sync', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ changes: adminChanges })
                });

                if (!response.ok) {
                    console.error('Admin sync failed');
                    toast.error('Admin sync failed. Please try again.');
                    return;
                }
            }

            // Clear queue if all syncs successful
            await window.idb.clearSyncQueue();
            toast.success('Sync complete!');
            setTimeout(() => window.location.reload(), 1000);

        } catch (err) {
            console.error('Error accessing sync queue', err);
        }
    };
});
