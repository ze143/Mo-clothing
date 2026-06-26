document.addEventListener('DOMContentLoaded', async function() {
    const user = await checkAuthAndRedirect();
    if (!user || user.profile.role !== 'admin') {
        window.location.href = '/pages/login.html';
        return;
    }
    
    const avatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    avatar.textContent = user.profile.full_name ? user.profile.full_name.charAt(0).toUpperCase() : 'A';
    userName.textContent = user.profile.full_name || 'أدمن';
    
    await loadBranches();
    await loadProducts();
    await loadTransfers();
});

async function loadBranches() {
    try {
        const { data, error } = await supabaseClient
            .from('branches')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const select = document.getElementById('filterBranch');
        select.innerHTML = '<option value="">جميع الفروع</option>';
        data.forEach(branch => {
            select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
        });
        
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

async function loadProducts() {
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const select = document.getElementById('filterProduct');
        select.innerHTML = '<option value="">جميع المنتجات</option>';
        data.forEach(product => {
            select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
        });
        
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

async function loadTransfers() {
    try {
        const dateFrom = document.getElementById('filterDateFrom').value;
        const dateTo = document.getElementById('filterDateTo').value;
        const branchId = document.getElementById('filterBranch').value;
        const productId = document.getElementById('filterProduct').value;
        
        let query = supabaseClient
            .from('branch_transfers')
            .select(`
                *,
                branches(name),
                products(name),
                profiles(full_name)
            `)
            .order('transfer_date', { ascending: false });
        
        if (dateFrom) {
            query = query.gte('transfer_date', dateFrom);
        }
        if (dateTo) {
            query = query.lte('transfer_date', dateTo);
        }
        if (branchId) {
            query = query.eq('branch_id', branchId);
        }
        if (productId) {
            query = query.eq('product_id', productId);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        displayTransfers(data);
        updateStatistics(data);
        
    } catch (error) {
        console.error('Error loading transfers:', error);
        showError('فشل تحميل التوريدات');
    }
}

function displayTransfers(data) {
    const tbody = document.getElementById('transfersBody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">لا توجد توريدات</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map((transfer, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${new Date(transfer.transfer_date).toLocaleDateString('ar')}</td>
            <td>${transfer.branches?.name || 'غير معروف'}</td>
            <td>${transfer.products?.name || 'غير معروف'}</td>
            <td><span class="badge bg-primary">${transfer.quantity}</span></td>
            <td>${transfer.notes || '-'}</td>
            <td>${transfer.profiles?.full_name || 'غير معروف'}</td>
        </tr>
    `).join('');
}

function updateStatistics(data) {
    if (data.length === 0) {
        document.getElementById('totalTransfers').textContent = '0';
        document.getElementById('totalItems').textContent = '0';
        document.getElementById('totalBranches').textContent = '0';
        document.getElementById('totalDays').textContent = '0';
        return;
    }
    
    const totalItems = data.reduce((sum, t) => sum + t.quantity, 0);
    const uniqueBranches = new Set(data.map(t => t.branch_id)).size;
    const uniqueDays = new Set(data.map(t => t.transfer_date)).size;
    
    document.getElementById('totalTransfers').textContent = data.length;
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalBranches').textContent = uniqueBranches;
    document.getElementById('totalDays').textContent = uniqueDays;
}

function resetFilters() {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterBranch').value = '';
    document.getElementById('filterProduct').value = '';
    loadTransfers();
}

function exportTransfers() {
    const table = document.getElementById('transfersTable');
    let csv = [];
    
    const headers = ['التاريخ', 'الفرع', 'المنتج', 'الكمية', 'الملاحظات', 'المسؤول'];
    csv.push(headers.join(','));
    
    const rows = document.querySelectorAll('#transfersBody tr');
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length > 1) {
            const rowData = [];
            for (let i = 1; i < cols.length; i++) {
                rowData.push(cols[i].textContent.trim());
            }
            csv.push(rowData.join(','));
        }
    });
    
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `توريدات_الفروع_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

window.loadTransfers = loadTransfers;
window.resetFilters = resetFilters;
window.exportTransfers = exportTransfers;