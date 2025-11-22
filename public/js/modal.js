class Modal {
    constructor() {
        this.overlay = null;
        this.card = null;
        this.init();
    }

    init() {
        // Create modal DOM if not exists
        if (!document.getElementById('premium-modal-overlay')) {
            this.createModalDOM();
        }
        this.overlay = document.getElementById('premium-modal-overlay');
        this.card = document.getElementById('premium-modal-card');
        this.title = document.getElementById('premium-modal-title');
        this.description = document.getElementById('premium-modal-description');
        this.confirmBtn = document.getElementById('premium-modal-confirm');
        this.cancelBtn = document.getElementById('premium-modal-cancel');
        this.iconContainer = document.getElementById('premium-modal-icon');

        // Event Listeners
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        document.getElementById('premium-modal-close').addEventListener('click', () => this.close());
        this.cancelBtn.addEventListener('click', () => this.close());

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) this.close();
        });
    }

    createModalDOM() {
        const div = document.createElement('div');
        div.id = 'premium-modal-overlay';
        div.className = 'fixed inset-0 z-[9999] flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-300';
        div.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        div.style.backdropFilter = 'blur(12px)';

        div.innerHTML = `
            <div id="premium-modal-card" class="bg-white dark:bg-gray-900 w-full max-w-[420px] rounded-2xl p-8 shadow-2xl transform scale-95 opacity-0 transition-all duration-300 relative mx-4">
                <button id="premium-modal-close" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
                    <i class="fas fa-times text-xl"></i>
                </button>
                
                <div class="flex flex-col items-center text-center">
                    <div id="premium-modal-icon" class="mb-4 p-3 rounded-full bg-red-50 text-red-500">
                        <i class="fas fa-trash-alt text-2xl animate-pulse"></i>
                    </div>
                    
                    <h3 id="premium-modal-title" class="text-xl font-bold text-gray-900 mb-2">Delete Item?</h3>
                    <p id="premium-modal-description" class="text-gray-500 text-sm mb-8 leading-relaxed">
                        This action cannot be undone. This will permanently delete the selected item.
                    </p>
                    
                    <div class="flex gap-3 w-full">
                        <button id="premium-modal-cancel" class="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors">
                            Cancel
                        </button>
                        <button id="premium-modal-confirm" class="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 shadow-lg shadow-red-500/30 transition-all hover:-translate-y-0.5">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    open(options = {}) {
        const { title, description, type = 'danger', onConfirm } = options;

        // Update Content
        this.title.textContent = title || 'Are you sure?';
        this.description.textContent = description || 'This action cannot be undone.';

        // Update Style based on type
        if (type === 'danger') {
            this.iconContainer.className = 'mb-4 p-3 rounded-full bg-red-50 text-red-500';
            this.iconContainer.innerHTML = '<i class="fas fa-trash-alt text-2xl animate-pulse"></i>';
            this.confirmBtn.className = 'flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 shadow-lg shadow-red-500/30 transition-all hover:-translate-y-0.5';
            this.confirmBtn.textContent = 'Delete';
        } else if (type === 'info') {
            this.iconContainer.className = 'mb-4 p-3 rounded-full bg-blue-50 text-blue-500';
            this.iconContainer.innerHTML = '<i class="fas fa-info-circle text-2xl"></i>';
            this.confirmBtn.className = 'flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5';
            this.confirmBtn.textContent = 'Confirm';
        }

        // Handle Confirm
        this.confirmBtn.onclick = () => {
            if (onConfirm) onConfirm();
            this.close();
        };

        // Show
        this.overlay.classList.remove('opacity-0', 'pointer-events-none');
        this.card.classList.remove('scale-95', 'opacity-0');
        this.card.classList.add('scale-100', 'opacity-100');
    }

    close() {
        this.overlay.classList.add('opacity-0', 'pointer-events-none');
        this.card.classList.remove('scale-100', 'opacity-100');
        this.card.classList.add('scale-95', 'opacity-0');
    }

    isOpen() {
        return !this.overlay.classList.contains('pointer-events-none');
    }
}

const modal = new Modal();

// Global Delete Interceptor
document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', (e) => {
        // Check if clicked element or parent is a delete button/link
        const trigger = e.target.closest('.delete-btn, a[href*="/delete/"]');

        if (trigger) {
            e.preventDefault();
            const href = trigger.getAttribute('href') || trigger.dataset.href;
            const itemName = trigger.dataset.name || 'this item';

            modal.open({
                title: 'Delete Item?',
                description: `This action cannot be undone. This will permanently delete ${itemName}.`,
                type: 'danger',
                onConfirm: () => {
                    window.location.href = href;
                }
            });
        }
    });
});
