let supplierModal = null;

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
    
    supplierModal = new bootstrap.Modal(document.getElementById('supplierModal'));
    await loadSuppliers();
});

async function loadSuppliers() {
    try {
        const { data, error } = await supabaseClient
            .from('suppliers')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const tbody = document.getElementById('suppliersBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">لا توجد موردين</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map((supplier, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${supplier.name}</strong></td>
                <td>${supplier.phone || '-'}</td>
                <td>${supplier.address || '-'}</td>
                <td>${supplier.notes || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-warning me-1" onclick="editSupplier('${supplier.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSupplier('${supplier.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading suppliers:', error);
        showError('فشل تحميل الموردين');
    }
}

async function saveSupplier() {
    const id = document.getElementById('supplierId').value;
    const name = document.getElementById('supplierName').value.trim();
    const phone = document.getElementById('supplierPhone').value.trim();
    const address = document.getElementById('supplierAddress').value.trim();
    const notes = document.getElementById('supplierNotes').value.trim();
    
    if (!name) {
        alert('يرجى إدخال اسم المورد');
        return;
    }
    
    try {
        if (id) {
            const { error } = await supabaseClient
                .from('suppliers')
                .update({ name, phone, address, notes })
                .eq('id', id);
            
            if (error) throw error;
            showSuccess('تم تحديث المورد بنجاح');
            
        } else {
            const { error } = await supabaseClient
                .from('suppliers')
                .insert({ name, phone, address, notes });
            
            if (error) throw error;
            showSuccess('تم إضافة المورد بنجاح');
        }
        
        await loadSuppliers();
        supplierModal.hide();
        resetSupplierForm();
        
    } catch (error) {
        console.error('Error saving supplier:', error);
        alert('فشل حفظ المورد: ' + error.message);
    }
}

function editSupplier(id) {
    document.getElementById('supplierModalTitle').textContent = 'تعديل المورد';
    
    supabaseClient
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
            if (error) throw error;
            
            document.getElementById('supplierId').value = data.id;
            document.getElementById('supplierName').value = data.name;
            document.getElementById('supplierPhone').value = data.phone || '';
            document.getElementById('supplierAddress').value = data.address || '';
            document.getElementById('supplierNotes').value = data.notes || '';
            
            supplierModal.show();
        })
        .catch(error => {
            console.error('Error loading supplier:', error);
            alert('فشل تحميل بيانات المورد');
        });
}

async function deleteSupplier(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
    
    try {
        const { error } = await supabaseClient
            .from('suppliers')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('تم حذف المورد بنجاح');
        await loadSuppliers();
        
    } catch (error) {
        console.error('Error deleting supplier:', error);
        alert('فشل حذف المورد: ' + error.message);
    }
}

function resetSupplierForm() {
    document.getElementById('supplierId').value = '';
    document.getElementById('supplierName').value = '';
    document.getElementById('supplierPhone').value = '';
    document.getElementById('supplierAddress').value = '';
    document.getElementById('supplierNotes').value = '';
    document.getElementById('supplierModalTitle').textContent = 'إضافة مورد جديد';
}

window.editSupplier = editSupplier;
window.deleteSupplier = deleteSupplier;
window.saveSupplier = saveSupplier;