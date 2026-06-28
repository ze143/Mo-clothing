// تكوين Supabase
const SUPABASE_CONFIG = {
    url: 'https://lxgnlmdijjruaxxekjan.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4Z25sbWRpampydWF4eGVramFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjIxMTYsImV4cCI6MjA5Nzk5ODExNn0.PH9Ti_po0ZE_G9ln9bNjNDX9_Zcimnw9d3Pu5DVwbYM'
};

// تهيئة عميل Supabase
const supabaseClient = supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);

// التحقق من حالة المصادقة مع معالجة الأخطاء
async function checkAuth() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error || !session) {
            window.location.href = '/pages/login.html';
            return null;
        }
        return session;
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/pages/login.html';
        return null;
    }
}

// الحصول على بيانات المستخدم الحالي مع معالجة الأخطاء
async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error || !user) {
            return null;
        }
        
        // الحصول على بيانات الملف الشخصي
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
        
        if (profileError) {
            console.error('Profile error:', profileError);
            return null;
        }
        
        return { ...user, profile };
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// تسجيل الخروج
async function logout() {
    try {
        await supabaseClient.auth.signOut();
        window.location.href = '/pages/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/pages/login.html';
    }
}

// التحقق من صلاحيات الأدمن
async function requireAdmin() {
    const user = await getCurrentUser();
    if (!user || user.profile?.role !== 'admin') {
        alert('غير مصرح لك بالوصول إلى هذه الصفحة');
        window.location.href = '/pages/login.html';
        return false;
    }
    return user;
}

// التحقق من صلاحيات الفرع
async function requireBranch() {
    const user = await getCurrentUser();
    if (!user || user.profile?.role !== 'branch_user') {
        alert('غير مصرح لك بالوصول إلى هذه الصفحة');
        window.location.href = '/pages/login.html';
        return false;
    }
    return user;
}

// عرض رسائل نجاح
function showSuccess(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success alert-dismissible fade show';
    alertDiv.innerHTML = `
        <i class="fas fa-check-circle me-2"></i>${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.prepend(alertDiv);
    } else {
        document.body.prepend(alertDiv);
    }
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// عرض رسائل خطأ
function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        <i class="fas fa-exclamation-circle me-2"></i>${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.prepend(alertDiv);
    } else {
        document.body.prepend(alertDiv);
    }
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// =============================================
// دوال جديدة للتعامل مع الإعدادات والتنبيهات
// =============================================


// تسجيل نشاط في سجل التدقيق
async function logActivity(action, details = {}) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        
        await supabaseClient
            .from('audit_log')
            .insert({
                user_id: user.id,
                action: action,
                details: details
            });
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// التحقق من نقص المخزون
async function checkLowStock() {
    try {
        const { data, error } = await supabaseClient
            .rpc('check_low_stock');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error checking low stock:', error);
        return [];
    }
}

// عرض تنبيه نقص المخزون
async function showLowStockAlert() {
    const lowStockItems = await checkLowStock();
    if (lowStockItems.length > 0) {
        let message = '⚠️ تنبيه: المخزون منخفض في المنتجات التالية:\n';
        lowStockItems.forEach(item => {
            message += `\n• ${item.branch_name} - ${item.product_name}: ${item.current_quantity} (الحد الأدنى: ${item.threshold})`;
        });
        alert(message);
    }
}

// تصدير الدوال الجديدة
window.logActivity = logActivity;
window.checkLowStock = checkLowStock;
window.showLowStockAlert = showLowStockAlert;

// دالة مساعدة للتحقق من حالة Supabase
async function checkSupabaseConnection() {
    try {
        const { data, error } = await supabaseClient.from('branches').select('count', { count: 'exact', head: true });
        if (error) {
            console.error('Supabase connection error:', error);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Supabase connection error:', error);
        return false;
    }
}

// تصدير الدوال للاستخدام العام
window.checkAuth = checkAuth;
window.getCurrentUser = getCurrentUser;
window.logout = logout;
window.requireAdmin = requireAdmin;
window.requireBranch = requireBranch;
window.showSuccess = showSuccess;
window.showError = showError;
window.checkSupabaseConnection = checkSupabaseConnection;
window.supabaseClient = supabaseClient;