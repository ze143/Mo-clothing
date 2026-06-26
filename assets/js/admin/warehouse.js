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
    await loadWarehouseStock();
    
    document.getElementById('supplyForm').addEventListener('submit', handleSupply);
    document.getElementById('supplyProduct').addEventListener('change', updateWarehouseInfo);
});

async function loadBranches() {
    try {
        const { data, error } = await supabaseClient
            .from('branches')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const select = document.getElementById('supplyBranch');
        select.innerHTML = '<option value="">اختر الفرع</option>';
        data.forEach(branch => {
            select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
        });
        
    } catch (error) {
        console.error('Error loading branches:', error);
        showError('فشل تحميل الفروع');
    }
}

async function loadProducts() {
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const select = document.getElementById('supplyProduct');
        select.innerHTML = '<option value="">اختر المنتج</option>';
        data.forEach(product => {
            select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
        });
        
    } catch (error) {
        console.error('Error loading products:', error);
        showError('فشل تحميل المنتجات');
    }
}

async function updateWarehouseInfo() {
    const productId = document.getElementById('supplyProduct').value;
    const info = document.getElementById('warehouseStockInfo');
    
    if (!productId) {
        info.textContent = '';
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('warehouse_stock')
            .select('quantity')
            .eq('product_id', productId)
            .single();
        
        if (error) throw error;
        
        info.textContent = `الكمية المتاحة في المخزن: ${data?.quantity || 0}`;
        
    } catch (error) {
        console.error('Error loading warehouse info:', error);
    }
}

async function handleSupply(e) {
    e.preventDefault();
    
    const branchId = document.getElementById('supplyBranch').value;
    const productId = document.getElementById('supplyProduct').value;
    const quantity = parseInt(document.getElementById('supplyQuantity').value);
    
    if (!branchId || !productId || !quantity || quantity < 1) {
        alert('يرجى ملء جميع الحقول بشكل صحيح');
        return;
    }
    
    try {
        // التحقق من الكمية في المخزن
        const { data: warehouseData, error: warehouseError } = await supabaseClient
            .from('warehouse_stock')
            .select('quantity')
            .eq('product_id', productId)
            .single();
        
        if (warehouseError) throw warehouseError;
        
        if ((warehouseData?.quantity || 0) < quantity) {
            alert(`الكمية المتاحة (${warehouseData?.quantity || 0}) أقل من الكمية المطلوبة (${quantity})`);
            return;
        }
        
        // بدء المعاملة
        // 1. تحديث مخزون المستودع
        await supabaseClient
            .from('warehouse_stock')
            .update({ quantity: (warehouseData?.quantity || 0) - quantity })
            .eq('product_id', productId);
        
        // 2. تحديث مخزون الفرع
        const { data: branchStockData, error: branchStockError } = await supabaseClient
            .from('branch_stock')
            .select('quantity')
            .eq('branch_id', branchId)
            .eq('product_id', productId)
            .single();
        
        if (branchStockError && branchStockError.code !== 'PGRST116') {
            throw branchStockError;
        }
        
        if (branchStockData) {
            // تحديث الكمية الموجودة
            await supabaseClient
                .from('branch_stock')
                .update({ quantity: (branchStockData?.quantity || 0) + quantity })
                .eq('branch_id', branchId)
                .eq('product_id', productId);
        } else {
            // إضافة سجل جديد
            await supabaseClient
                .from('branch_stock')
                .insert({
                    branch_id: branchId,
                    product_id: productId,
                    quantity: quantity
                });
        }
        
        showSuccess('تم التوريد بنجاح');
        document.getElementById('supplyForm').reset();
        await loadWarehouseStock();
        updateWarehouseInfo();
        
    } catch (error) {
        console.error('Error handling supply:', error);
        alert('فشل التوريد: ' + error.message);
    }
}

async function loadWarehouseStock() {
    try {
        const { data, error } = await supabaseClient
            .from('warehouse_stock')
            .select(`
                *,
                products(name)
            `)
            .order('products(name)');
        
        if (error) throw error;
        
        const tbody = document.getElementById('warehouseBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">لا توجد منتجات في المخزن</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${item.products?.name || 'غير معروف'}</td>
                <td><span class="badge bg-primary">${item.quantity}</span></td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading warehouse stock:', error);
        showError('فشل تحميل مخزون المستودع');
    }
}

// =============================================
// دوال محسنة للمخزن
// =============================================

// استخدام View branch_stock_view للعرض المحسن
async function loadEnhancedWarehouseView() {
    try {
        const { data, error } = await supabaseClient
            .from('branch_stock_view')
            .select('*')
            .order('branch_name');
        
        if (error) throw error;
        
        const container = document.getElementById('enhancedStockView');
        if (!container) return;
        
        if (data.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">لا توجد بيانات</p>';
            return;
        }
        
        container.innerHTML = data.map(item => `
            <tr>
                <td>${item.branch_name}</td>
                <td>${item.product_name}</td>
                <td>${item.quantity}</td>
                <td>${item.warehouse_quantity}</td>
                <td>${item.available_for_transfer}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading enhanced view:', error);
    }
}

// تحديث دالة التحميل الرئيسية
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
    await loadWarehouseStock();
    await loadEnhancedWarehouseView(); // <-- إضافة جديدة
    
    document.getElementById('supplyForm').addEventListener('submit', handleSupply);
    document.getElementById('supplyProduct').addEventListener('change', updateWarehouseInfo);
});