async function exportReport(type) {
    const btn = document.getElementById('exportBtn');
    const originalText = btn.innerHTML;

    // Show Loading State
    const loadingModal = document.createElement('div');
    loadingModal.id = 'exportLoadingModal';
    loadingModal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm';
    loadingModal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl transform transition-all scale-100">
            <div class="mb-4 relative">
                <div class="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                <i class="fas fa-file-export absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-blue-600"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">Generating Report</h3>
            <p class="text-gray-500 text-sm">Creating your premium ${type.toUpperCase()} report...</p>
        </div>
    `;
    document.body.appendChild(loadingModal);

    try {
        const response = await fetch(`/admin/finance/reports/export/${type}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Export failed');

        // Handle File Download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Finance_Report_${new Date().toISOString().split('T')[0]}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Success Toast
        toast.success(`${type.toUpperCase()} Report downloaded successfully!`);

    } catch (err) {
        console.error('Export Error:', err);
        toast.error('Failed to generate report. Please try again.');
    } finally {
        // Remove Loading Modal
        const modal = document.getElementById('exportLoadingModal');
        if (modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => document.body.removeChild(modal), 300);
        }
    }
}

// Dropdown Toggle Logic
document.addEventListener('DOMContentLoaded', () => {
    const exportDropdownBtn = document.getElementById('exportDropdownBtn');
    const exportDropdownMenu = document.getElementById('exportDropdownMenu');

    if (exportDropdownBtn && exportDropdownMenu) {
        exportDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdownMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', () => {
            if (!exportDropdownMenu.classList.contains('hidden')) {
                exportDropdownMenu.classList.add('hidden');
            }
        });
    }
});
