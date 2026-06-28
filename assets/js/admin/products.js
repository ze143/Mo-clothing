// =============================================
// إدارة المنتجات - نسخة بدون أسعار
// =============================================

let productModal = null;

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
    
    productModal = new bootstrap.Modal(document.getElementById('productModal'));
    await loadProducts();
});

async function loadProducts() {
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const tbody = document.getElementById('productsBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">لا توجد منتجات</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map((product, index) => {
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${product.name}</strong></td>
                    <td>${product.description || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-warning me-1" onclick="editProduct('${product.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading products:', error);
        showError('فشل تحميل المنتجات');
    }
}

async function saveProduct() {
    const id = document.getElementById('productId').value;
    const name = document.getElementById('productName').value.trim();
    const description = document.getElementById('productDescription').value.trim();
    
    if (!name) {
        alert('يرجى إدخال اسم المنتج');
        return;
    }
    
    try {
        if (id) {
            const { error } = await supabaseClient
                .from('products')
                .update({ name, description })
                .eq('id', id);
            
            if (error) throw error;
            showSuccess('تم تحديث المنتج بنجاح');
            
        } else {
            const { data, error } = await supabaseClient
                .from('products')
                .insert({ name, description })
                .select()
                .single();
            
            if (error) throw error;
            
            await supabaseClient
                .from('warehouse_stock')
                .insert({
                    product_id: data.id,
                    quantity: 0
                });
            
            showSuccess('تم إضافة المنتج بنجاح');
        }
        
        await loadProducts();
        productModal.hide();
        resetProductForm();
        
    } catch (error) {
        console.error('Error saving product:', error);
        alert('فشل حفظ المنتج: ' + error.message);
    }
}

function editProduct(id) {
    document.getElementById('productModalTitle').textContent = 'تعديل المنتج';
    
    supabaseClient
        .from('products')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
            if (error) throw error;
            
            document.getElementById('productId').value = data.id;
            document.getElementById('productName').value = data.name;
            document.getElementById('productDescription').value = data.description || '';
            
            productModal.show();
        })
        .catch(error => {
            console.error('Error loading product:', error);
            alert('فشل تحميل بيانات المنتج');
        });
}

async function deleteProduct(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    
    try {
        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('تم حذف المنتج بنجاح');
        await loadProducts();
        
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('فشل حذف المنتج: ' + error.message);
    }
}

function resetProductForm() {
    document.getElementById('productId').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productDescription').value = '';
    document.getElementById('productModalTitle').textContent = 'إضافة منتج جديد';
}

window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.saveProduct = saveProduct;