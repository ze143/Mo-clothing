let reportModal = null;

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
    
    reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
    await loadReports();
});

async function loadReports() {
    try {
        const { data, error } = await supabaseClient
            .from('inventory_audits')
            .select(`
                *,
                branches(name),
                profiles(full_name)
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.getElementById('reportsBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">لا توجد تقارير جرد</td></tr>';
            return;
        }
        
        tbody.innerHTML = await Promise.all(data.map(async (report, index) => {
            // حساب عدد المنتجات والفروقات
            const { data: itemsData, error: itemsError } = await supabaseClient
                .from('inventory_audit_items')
                .select('difference')
                .eq('audit_id', report.id);
            
            if (itemsError) throw itemsError;
            
            const totalDifferences = itemsData.reduce((sum, item) => sum + Math.abs(item.difference), 0);
            
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${new Date(report.audit_date).toLocaleDateString('ar')}</td>
                    <td>${report.branches?.name || 'غير معروف'}</td>
                    <td>${report.profiles?.full_name || 'غير معروف'}</td>
                    <td>${itemsData.length}</td>
                    <td>
                        <span class="badge ${totalDifferences === 0 ? 'bg-success' : 'bg-warning'}">
                            ${totalDifferences}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="viewReport('${report.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }));
        
    } catch (error) {
        console.error('Error loading reports:', error);
        showError('فشل تحميل التقارير');
    }
}

async function viewReport(auditId) {
    try {
        // تحميل بيانات الجرد
        const { data: auditData, error: auditError } = await supabaseClient
            .from('inventory_audits')
            .select(`
                *,
                branches(name),
                profiles(full_name)
            `)
            .eq('id', auditId)
            .single();
        
        if (auditError) throw auditError;
        
        // تحميل عناصر الجرد
        const { data: itemsData, error: itemsError } = await supabaseClient
            .from('inventory_audit_items')
            .select(`
                *,
                products(name)
            `)
            .eq('audit_id', auditId);
        
        if (itemsError) throw itemsError;
        
        // عرض التفاصيل
        const details = document.getElementById('reportDetails');
        
        let itemsHtml = '';
        if (itemsData.length === 0) {
            itemsHtml = '<p class="text-muted">لا توجد عناصر في هذا الجرد</p>';
        } else {
            itemsHtml = `
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>المنتج</th>
                                <th>الكمية بالنظام</th>
                                <th>الكمية الفعلية</th>
                                <th>الفروق</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsData.map(item => `
                                <tr>
                                    <td>${item.products?.name || 'غير معروف'}</td>
                                    <td>${item.system_quantity}</td>
                                    <td>${item.actual_quantity}</td>
                                    <td>
                                        <span class="badge ${item.difference === 0 ? 'bg-success' : 'bg-warning'}">
                                            ${item.difference}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        details.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-md-6">
                    <strong>الفرع:</strong> ${auditData.branches?.name || 'غير معروف'}
                </div>
                <div class="col-md-6">
                    <strong>التاريخ:</strong> ${new Date(auditData.audit_date).toLocaleDateString('ar')}
                </div>
                <div class="col-md-6">
                    <strong>المسؤول:</strong> ${auditData.profiles?.full_name || 'غير معروف'}
                </div>
                <div class="col-md-6">
                    <strong>الملاحظات:</strong> ${auditData.notes || 'لا توجد ملاحظات'}
                </div>
            </div>
            <hr>
            <h6>عناصر الجرد:</h6>
            ${itemsHtml}
        `;
        
        reportModal.show();
        
    } catch (error) {
        console.error('Error viewing report:', error);
        alert('فشل تحميل تفاصيل التقرير');
    }
}

window.viewReport = viewReport;