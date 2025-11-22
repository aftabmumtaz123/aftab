// Professional Toast Notification System
class Toast {
    constructor() {
        this.container = this.createContainer();
    }

    createContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed top-4 right-4 z-50 space-y-3';
            document.body.appendChild(container);
        }
        return container;
    }

    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast-item transform transition-all duration-300 translate-x-full opacity-0 max-w-md`;

        const icons = {
            success: '<i class="fas fa-check-circle text-green-500"></i>',
            error: '<i class="fas fa-exclamation-circle text-red-500"></i>',
            warning: '<i class="fas fa-exclamation-triangle text-yellow-500"></i>',
            info: '<i class="fas fa-info-circle text-blue-500"></i>'
        };

        const colors = {
            success: 'bg-white border-l-4 border-green-500',
            error: 'bg-white border-l-4 border-red-500',
            warning: 'bg-white border-l-4 border-yellow-500',
            info: 'bg-white border-l-4 border-blue-500'
        };

        toast.innerHTML = `
            <div class="${colors[type]} shadow-xl rounded-r-lg p-4 flex items-center gap-4 min-w-[320px] border border-gray-100">
                <div class="flex-shrink-0 text-xl">
                    ${icons[type]}
                </div>
                <div class="flex-1">
                    <p class="text-gray-800 font-semibold text-sm">${message}</p>
                </div>
                <button class="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-50" onclick="this.closest('.toast-item').remove()">
                    <i class="fas fa-times text-sm"></i>
                </button>
            </div>
        `;

        this.container.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        }, 10);

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                this.remove(toast);
            }, duration);
        }

        return toast;
    }

    remove(toast) {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }

    success(message, duration = 4000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 4000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 4000) {
        return this.show(message, 'info', duration);
    }
}

// Initialize global toast instance
const toast = new Toast();

// Check for flash messages from server
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const successMsg = urlParams.get('success');
    const errorMsg = urlParams.get('error');

    if (successMsg) {
        toast.success(decodeURIComponent(successMsg));
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (errorMsg) {
        toast.error(decodeURIComponent(errorMsg));
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
