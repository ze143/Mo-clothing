document.addEventListener("DOMContentLoaded", async function() {
    const user = await checkAuthAndRedirect();
    if (!user || user.profile.role !== "admin") {
        window.location.href = "/pages/login.html";
        return;
    }

    document.getElementById("userAvatar").textContent = user.profile.full_name ? user.profile.full_name.charAt(0).toUpperCase() : "A";
    document.getElementById("userName").textContent = user.profile.full_name || "أدمن";

    await loadAudit();
});

async function loadAudit() {
    try {
        const container = document.getElementById("auditResults");

        // 1. جلب الفروع والمنتجات
        const branches = await supabaseClient.from("branches").select("*");
        const products = await supabaseClient.from("products").select("*");
        const transfers = await supabaseClient.from("branch_transfers").select("*");
        const sales = await supabaseClient.from("daily_sales").select("*");
        const stock = await supabaseClient.from("branch_stock").select("*");

        // 2. حساب الفروقات
        let auditData = [];
        let totalErrors = 0;
        let totalMissing = 0;
        let totalExtra = 0;

        for (const branch of branches.data) {
            for (const product of products.data) {
                // إجمالي التوريدات
                const totalSupplied = transfers.data
                    .filter(t => t.to_branch_id === branch.id && t.product_id === product.id && t.transfer_type === 'supply')
                    .reduce((sum, t) => sum + t.quantity, 0);

                // إجمالي المبيعات المقفلة
                const totalSold = sales.data
                    .filter(s => s.branch_id === branch.id && s.product_id === product.id && s.is_closed === true)
                    .reduce((sum, s) => sum + s.quantity, 0);

                // المخزون الفعلي
                const actualStock = stock.data
                    .filter(s => s.branch_id === branch.id && s.product_id === product.id)
                    .reduce((sum, s) => sum + s.quantity, 0);

                const expectedStock = totalSupplied - totalSold;
                const difference = expectedStock - actualStock;

                if (totalSupplied > 0 || totalSold > 0 || actualStock > 0) {
                    auditData.push({
                        branch: branch.name,
                        product: product.name,
                        supplied: totalSupplied,
                        sold: totalSold,
                        expected: expectedStock,
                        actual: actualStock,
                        difference: difference,
                        status: difference === 0 ? '✅ مضبوط' : difference > 0 ? '❌ ناقص' : '⚠️ زائد'
                    });

                    if (difference !== 0) {
                        totalErrors++;
                        if (difference > 0) totalMissing += difference;
                        else totalExtra += Math.abs(difference);
                    }
                }
            }
        }

        // 3. عرض النتيجة
        let html = `
            <div class="row g-4 mb-4">
                <div class="col-md-4">
                    <div class="stats-card danger">
                        <div class="stats-number">${totalErrors}</div>
                        <div class="stats-label">عدد المنتجات بها مشكلة</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="stats-card warning">
                        <div class="stats-number">${totalMissing}</div>
                        <div class="stats-label">إجمالي القطع الناقصة</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="stats-card success">
                        <div class="stats-number">${totalExtra}</div>
                        <div class="stats-label">إجمالي القطع الزائدة</div>
                    </div>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-hover table-striped">
                    <thead class="table-dark">
                        <tr>
                            <th>الفرع</th>
                            <th>المنتج</th>
                            <th>المورد</th>
                            <th>المباع</th>
                            <th>المتوقع</th>
                            <th>الفعلي</th>
                            <th>الفرق</th>
                            <th>الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${auditData.map(item => `
                            <tr class="${item.difference !== 0 ? 'table-danger' : ''}">
                                <td>${item.branch}</td>
                                <td>${item.product}</td>
                                <td>${item.supplied}</td>
                                <td>${item.sold}</td>
                                <td>${item.expected}</td>
                                <td>${item.actual}</td>
                                <td>${item.difference}</td>
                                <td>${item.status}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error("Error loading audit:", error);
        document.getElementById("auditResults").innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                فشل تحميل بيانات التدقيق: ${error.message}
            </div>
        `;
    }
}