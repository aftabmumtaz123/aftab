const publicVapidKey = 'BOQnlh6pSFNPjOTe-hEC8D8e4Lpm16nyqgB4IBRO5HP_0Vp70VozkMIdC0o5Hq7FTONi9YlxuU5rA7e6z_Kl3yk'; // Should match .env

if ('serviceWorker' in navigator) {
    registerServiceWorker().catch(err => console.error(err));
}

async function registerServiceWorker() {
    const register = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
    });

    // Check if push is supported
    if ('PushManager' in window) {
        // Request permission
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await subscribeUser(register);
        }
    }
}

async function subscribeUser(register) {
    const subscription = await register.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
    });

    await fetch('/admin/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: {
            'content-type': 'application/json'
        }
    });
    console.log('Push Subscribed...');
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// --- UI Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const notificationBtn = document.getElementById('notification-btn');
    const dropdown = document.getElementById('notification-dropdown');
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');
    const markReadBtn = document.getElementById('mark-read-btn');

    if (notificationBtn && dropdown) {
        // Toggle Dropdown
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !notificationBtn.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        // Fetch Notifications
        fetchNotifications();

        // Mark all read
        if (markReadBtn) {
            markReadBtn.addEventListener('click', async () => {
                await fetch('/admin/notifications/mark-read', { method: 'POST' });
                badge.classList.add('hidden');
                fetchNotifications(); // Refresh
            });
        }
    }

    async function fetchNotifications() {
        try {
            const res = await fetch('/admin/notifications');
            const notifications = await res.json();

            renderNotifications(notifications);

            const unreadCount = notifications.filter(n => !n.read).length;
            if (unreadCount > 0) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (err) {
            console.error('Error fetching notifications:', err);
        }
    }

    function renderNotifications(notifications) {
        if (!list) return;

        if (notifications.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">No notifications</div>';
            return;
        }

        list.innerHTML = notifications.map(n => `
            <a href="${n.link || '#'}" class="block p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${n.read ? 'opacity-60' : 'bg-blue-50/30'}">
                <div class="flex items-start gap-3">
                    <div class="flex-shrink-0 mt-1">
                        ${getIcon(n.type)}
                    </div>
                    <div class="flex-1">
                        <p class="text-sm font-medium text-gray-800">${n.title}</p>
                        <p class="text-xs text-gray-500 mt-1">${n.message}</p>
                        <p class="text-[10px] text-gray-400 mt-2">${new Date(n.date).toLocaleString()}</p>
                    </div>
                </div>
            </a>
        `).join('');
    }

    function getIcon(type) {
        switch (type) {
            case 'success': return '<i class="fas fa-check-circle text-green-500"></i>';
            case 'warning': return '<i class="fas fa-exclamation-triangle text-yellow-500"></i>';
            case 'error': return '<i class="fas fa-times-circle text-red-500"></i>';
            default: return '<i class="fas fa-info-circle text-blue-500"></i>';
        }
    }
});
