let currentBranchId = null;
let auditId = null;

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
    
    // تعيين تاريخ اليوم كقيمة افتراضية
    document.getElementById('inventoryDate').value = new Date().toISOString().split('T')[0];
    
    await loadBranches();
    
    document.getElementById('inventoryForm').addEventListener('submit', startInventory);
    document.getElementById('auditForm').addEventListener('submit', saveAudit);
});

async function loadBranches() {
    try {
        const { data, error } = await supabaseClient
            .from('branches')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const select = document.getElementById('inventoryBranch');
        select.innerHTML = '<option value="">اختر الفرع</option>';
        data.forEach(branch => {
            select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
        });
        
    } catch (error) {
        console.error('Error loading branches:', error);
        showError('فشل تحميل الفروع');
    }
}

async function startInventory(e) {
    e.preventDefault();
    
    const branchId = document.getElementById('inventoryBranch').value;
    const auditDate = document.getElementById('inventoryDate').value;
    
    if (!branchId) {
        alert('يرجى اختيار الفرع');
        return;
    }
    
    currentBranchId = branchId;
    
    try {
        // إنشاء سجل جرد جديد
        const { data: userData } = await supabaseClient.auth.getUser();
        const userId = userData.user?.id;
        
        const { data, error } = await supabaseClient
            .from('inventory_audits')
            .insert({
                branch_id: branchId,
                audit_date: auditDate,
                audited_by: userId
            })
            .select()
            .single();
        
        if (error) throw error;
        
        auditId = data.id;
        document.getElementById('auditId').value = data.id;
        
        // عرض اسم الفرع
        const branchName = document.getElementById('inventoryBranch')
            .options[document.getElementById('inventoryBranch').selectedIndex].text;
        document.getElementById('inventoryBranchName').textContent = branchName;
        
        // تحميل مخزون الفرع
        await loadBranchStockForAudit(branchId);
        
        // عرض محتوى الجرد
        document.getElementById('inventoryContent').style.display = 'block';
        
    } catch (error) {
        console.error('Error starting inventory:', error);
        alert('فشل بدء الجرد: ' + error.message);
    }
}

async function loadBranchStockForAudit(branchId) {
    try {
        const { data, error } = await supabaseClient
            .from('branch_stock')
            .select(`
                *,
                products(id, name)
            `)
            .eq('branch_id', branchId);
        
        if (error) throw error;
        
        const tbody = document.getElementById('auditBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد منتجات في هذا الفرع</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${item.products?.name || 'غير معروف'}</td>
                <td>${item.quantity}</td>
                <td>
                    <input type="number" class="form-control actual-quantity" 
                           data-product-id="${item.product_id}" 
                           value="${item.quantity}" min="0">
                </td>
                <td class="difference-cell">0</td>
            </tr>
        `).join('');
        
        // إضافة أحداث لحساب الفروق تلقائياً
        document.querySelectorAll('.actual-quantity').forEach(input => {
            input.addEventListener('input', function() {
                const systemQuantity = parseInt(this.closest('tr').querySelector('td:nth-child(3)').textContent) || 0;
                const actualQuantity = parseInt(this.value) || 0;
                const difference = actualQuantity - systemQuantity;
                this.closest('tr').querySelector('.difference-cell').textContent = difference;
            });
        });
        
    } catch (error) {
        console.error('Error loading branch stock:', error);
        showError('فشل تحميل مخزون الفرع');
    }
}

async function saveAudit(e) {
    e.preventDefault();
    
    if (!auditId) {
        alert('لا يوجد جرد نشط');
        return;
    }
    
    try {
        // جمع بيانات الجرد
        const rows = document.querySelectorAll('#auditBody tr');
        const auditItems = [];
        let hasErrors = false;
        
        rows.forEach(row => {
            const productId = row.querySelector('.actual-quantity')?.dataset.productId;
            const systemQuantity = parseInt(row.querySelector('td:nth-child(3)')?.textContent) || 0;
            const actualQuantity = parseInt(row.querySelector('.actual-quantity')?.value) || 0;
            const difference = actualQuantity - systemQuantity;
            
            if (productId) {
                auditItems.push({
                    audit_id: auditId,
                    product_id: productId,
                    system_quantity: systemQuantity,
                    actual_quantity: actualQuantity,
                    difference: difference
                });
            }
        });
        
        if (auditItems.length === 0) {
            alert('لا توجد منتجات للجرد');
            return;
        }
        
        // حفظ عناصر الجرد
        const { error } = await supabaseClient
            .from('inventory_audit_items')
            .insert(auditItems);
        
        if (error) throw error;
        
        // تحديث مخزون الفرع بناءً على الجرد
        for (const item of auditItems) {
            await supabaseClient
                .from('branch_stock')
                .update({ quantity: item.actual_quantity })
                .eq('branch_id', currentBranchId)
                .eq('product_id', item.product_id);
        }
        
        showSuccess('تم حفظ الجرد بنجاح');
        
        // إعادة تحميل البيانات
        await loadBranchStockForAudit(currentBranchId);
        
    } catch (error) {
        console.error('Error saving audit:', error);
        alert('فشل حفظ الجرد: ' + error.message);
    }
}