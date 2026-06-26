// متغيرات عامة
let editingBranchId = null;
let branchModal = null;

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', async function() {
    const user = await checkAuthAndRedirect();
    if (!user) return;
    
    if (user.profile.role !== 'admin') {
        alert('غير مصرح لك بالوصول إلى هذه الصفحة');
        window.location.href = '/pages/login.html';
        return;
    }
    
    // عرض معلومات المستخدم
    const avatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    avatar.textContent = user.profile.full_name ? user.profile.full_name.charAt(0).toUpperCase() : 'A';
    userName.textContent = user.profile.full_name || 'أدمن';
    
    // تهيئة المودال
    branchModal = new bootstrap.Modal(document.getElementById('branchModal'));
    
    // تحميل الفروع
    await loadBranches();
    
    // التعامل مع إظهار/إخفاء حقول المستخدم
    document.getElementById('createUser').addEventListener('change', function() {
        document.getElementById('userFields').style.display = this.checked ? 'block' : 'none';
    });
});

// تحميل الفروع
async function loadBranches() {
    try {
        const { data, error } = await supabaseClient
            .from('branches')
            .select(`
                *,
                profiles(count)
            `)
            .order('name');
        
        if (error) throw error;
        
        const tbody = document.getElementById('branchesBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">لا توجد فروع</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map((branch, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${branch.name}</strong></td>
                <td>${branch.address || '-'}</td>
                <td>${branch.phone || '-'}</td>
                <td><span class="badge bg-primary">${branch.profiles?.[0]?.count || 0}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning me-1" onclick="editBranch('${branch.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBranch('${branch.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading branches:', error);
        showError('فشل تحميل الفروع');
    }
}

// حفظ الفرع
async function saveBranch() {
    const id = document.getElementById('branchId').value;
    const name = document.getElementById('branchName').value.trim();
    const address = document.getElementById('branchAddress').value.trim();
    const phone = document.getElementById('branchPhone').value.trim();
    const createUser = document.getElementById('createUser').checked;
    
    if (!name) {
        alert('يرجى إدخال اسم الفرع');
        return;
    }
    
    try {
        if (id) {
            // تحديث فرع موجود
            const { error } = await supabaseClient
                .from('branches')
                .update({ name, address, phone })
                .eq('id', id);
            
            if (error) throw error;
            showSuccess('تم تحديث الفرع بنجاح');
            
        } else {
            // إضافة فرع جديد
            const { data: branchData, error: branchError } = await supabaseClient
                .from('branches')
                .insert({ name, address, phone })
                .select()
                .single();
            
            if (branchError) throw branchError;
            
            // إنشاء مستخدم للفرع إذا تم الاختيار
            if (createUser) {
                const email = document.getElementById('userEmail').value.trim();
                const password = document.getElementById('userPassword').value;
                const fullName = document.getElementById('userFullName').value.trim();
                
                if (!email || !password) {
                    alert('يرجى إدخال البريد الإلكتروني وكلمة المرور للمستخدم');
                    return;
                }
                
                // إنشاء مستخدم جديد
                const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password
                });
                
                if (authError) throw authError;
                
                // إنشاء ملف شخصي للمستخدم
                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .insert({
                        id: authData.user.id,
                        username: email.split('@')[0],
                        full_name: fullName || name + ' - موظف',
                        role: 'branch_user',
                        branch_id: branchData.id
                    });
                
                if (profileError) throw profileError;
            }
            
            showSuccess('تم إضافة الفرع بنجاح');
        }
        
        // إعادة تحميل البيانات وإغلاق المودال
        await loadBranches();
        branchModal.hide();
        resetBranchForm();
        
    } catch (error) {
        console.error('Error saving branch:', error);
        alert('فشل حفظ الفرع: ' + error.message);
    }
}

// تعديل فرع
function editBranch(id) {
    editingBranchId = id;
    document.getElementById('branchModalTitle').textContent = 'تعديل الفرع';
    
    // تحميل بيانات الفرع
    supabaseClient
        .from('branches')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
            if (error) throw error;
            
            document.getElementById('branchId').value = data.id;
            document.getElementById('branchName').value = data.name;
            document.getElementById('branchAddress').value = data.address || '';
            document.getElementById('branchPhone').value = data.phone || '';
            document.getElementById('createUser').checked = false;
            document.getElementById('userFields').style.display = 'none';
            
            branchModal.show();
        })
        .catch(error => {
            console.error('Error loading branch:', error);
            alert('فشل تحميل بيانات الفرع');
        });
}

// حذف فرع
async function deleteBranch(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الفرع؟ سيتم حذف جميع البيانات المرتبطة به.')) return;
    
    try {
        const { error } = await supabaseClient
            .from('branches')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('تم حذف الفرع بنجاح');
        await loadBranches();
        
    } catch (error) {
        console.error('Error deleting branch:', error);
        alert('فشل حذف الفرع: ' + error.message);
    }
}

// إعادة تعيين نموذج الفرع
function resetBranchForm() {
    document.getElementById('branchId').value = '';
    document.getElementById('branchName').value = '';
    document.getElementById('branchAddress').value = '';
    document.getElementById('branchPhone').value = '';
    document.getElementById('createUser').checked = false;
    document.getElementById('userFields').style.display = 'none';
    document.getElementById('userEmail').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userFullName').value = '';
    document.getElementById('branchModalTitle').textContent = 'إضافة فرع جديد';
}

// جعل الدوال متاحة في النطاق العام
window.editBranch = editBranch;
window.deleteBranch = deleteBranch;
window.saveBranch = saveBranch;