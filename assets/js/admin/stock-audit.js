// =============================================
// تدقيق المخزون - فحص الفروقات (مع كل العمليات)
// =============================================

document.addEventListener("DOMContentLoaded", async function() {
    try {
        const user = await checkAuthAndRedirect();
        if (!user || user.profile.role !== "admin") {
            window.location.href = "/pages/login.html";
            return;
        }

        document.getElementById("userAvatar").textContent = user.profile.full_name ?
            user.profile.full_name.charAt(0).toUpperCase() :
            "A";
        document.getElementById("userName").textContent =
            user.profile.full_name || "أدمن";

        await loadAudit();
    } catch (error) {
        console.error("Error initializing:", error);
        showError("حدث خطأ في تحميل الصفحة");
    }
});

async function loadAudit() {
    try {
        const container = document.getElementById("auditResults");

        // جلب البيانات
        const branches = await supabaseClient.from("branches").select("*");
        const products = await supabaseClient.from("products").select("*");
        const transfers = await supabaseClient.from("branch_transfers").select("*");
        const sales = await supabaseClient.from("daily_sales").select("*");
        const stock = await supabaseClient.from("branch_stock").select("*");

        if (branches.error) throw branches.error;
        if (products.error) throw products.error;
        if (transfers.error) throw transfers.error;
        if (sales.error) throw sales.error;
        if (stock.error) throw stock.error;

        // حساب الفروقات
        let auditData = [];
        let totalErrors = 0;
        let totalMissing = 0;
        let totalExtra = 0;

        for (const branch of branches.data) {
            for (const product of products.data) {
                // 1. إجمالي التوريدات (تزيد المخزون)
                const totalSupplied = transfers.data
                    .filter(
                        (t) =>
                        t.to_branch_id === branch.id &&
                        t.product_id === product.id &&
                        t.transfer_type === "supply",
                    )
                    .reduce((sum, t) => sum + t.quantity, 0);

                // 2. إجمالي المبيعات المقفلة (تقل المخزون)
                const totalSold = sales.data
                    .filter(
                        (s) =>
                        s.branch_id === branch.id &&
                        s.product_id === product.id &&
                        s.is_closed === true,
                    )
                    .reduce((sum, s) => sum + s.quantity, 0);

                // 3. إجمالي المرتجعات للمخزن (تقل المخزون)
                const totalReturned = transfers.data
                    .filter(
                        (t) =>
                        t.from_branch_id === branch.id &&
                        t.product_id === product.id &&
                        t.transfer_type === "return",
                    )
                    .reduce((sum, t) => sum + t.quantity, 0);

                // 4. إجمالي التحويلات من الفرع (تقل المخزون)
                const totalTransferredOut = transfers.data
                    .filter(
                        (t) =>
                        t.from_branch_id === branch.id &&
                        t.product_id === product.id &&
                        t.transfer_type === "transfer",
                    )
                    .reduce((sum, t) => sum + t.quantity, 0);

                // 5. إجمالي التحويلات إلى الفرع (تزيد المخزون)
                const totalTransferredIn = transfers.data
                    .filter(
                        (t) =>
                        t.to_branch_id === branch.id &&
                        t.product_id === product.id &&
                        t.transfer_type === "transfer",
                    )
                    .reduce((sum, t) => sum + t.quantity, 0);

                // ✅ إجمالي مرتجعات العملاء (تزيد المخزون في الفرع)
                const totalCustomerReturn = transfers.data
                    .filter(
                        (t) =>
                        t.to_branch_id === branch.id &&
                        t.product_id === product.id &&
                        t.transfer_type === "customer_return",
                    )
                    .reduce((sum, t) => sum + t.quantity, 0);

                // ✅ إجمالي الاستبدالات (تزيد المخزون في الفرع)
                const totalExchange = transfers.data
                    .filter(
                        (t) =>
                        t.to_branch_id === branch.id &&
                        t.product_id === product.id &&
                        t.transfer_type === "exchange",
                    )
                    .reduce((sum, t) => sum + t.quantity, 0);

                // ✅ المخزون الفعلي
                const actualStock = stock.data
                    .filter(
                        (s) => s.branch_id === branch.id && s.product_id === product.id,
                    )
                    .reduce((sum, s) => sum + s.quantity, 0);

                // 9. المخزون المتوقع (مع كل العمليات)
                const expectedStock =
                    totalSupplied -
                    totalSold -
                    totalReturned -
                    totalTransferredOut +
                    totalTransferredIn +
                    totalCustomerReturn +
                    totalExchange;
                const difference = expectedStock - actualStock;

                if (
                    totalSupplied > 0 ||
                    totalSold > 0 ||
                    totalReturned > 0 ||
                    totalTransferredOut > 0 ||
                    totalTransferredIn > 0 ||
                    totalCustomerReturn > 0 ||
                    totalExchange > 0 ||
                    actualStock > 0
                ) {
                    auditData.push({
                        branch: branch.name,
                        product: product.name,
                        supplied: totalSupplied,
                        sold: totalSold,
                        returned: totalReturned,
                        transferredOut: totalTransferredOut,
                        transferredIn: totalTransferredIn,
                        customerReturn: totalCustomerReturn,
                        exchange: totalExchange,
                        expected: expectedStock,
                        actual: actualStock,
                        difference: difference,
                        status: difference === 0 ?
                            "مضبوط ✅" : difference > 0 ?
                            "ناقص ❌" : "زائد ⚠️",
                        isError: difference !== 0,
                    });

                    if (difference !== 0) {
                        totalErrors++;
                        if (difference > 0) totalMissing += difference;
                        else totalExtra += Math.abs(difference);
                    }
                }
            }
        }

        // عرض النتيجة
        let html = "";

        if (auditData.length === 0) {
            html = `
                <div class="alert alert-success text-center py-5">
                    <i class="fas fa-check-circle fa-3x mb-3 d-block" style="color: #27ae60;"></i>
                    <h4>🎉 جميع المنتجات مضبوطة</h4>
                    <p class="text-muted">لا توجد فروقات في المخزون</p>
                </div>
            `;
        } else {
            html = `
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
                                <th>المرتجع</th>
                                <th>تحويل خارج</th>
                                <th>تحويل داخل</th>
                                <th>مرتجع عميل</th>
                                <th>استبدال</th>
                                <th>المتوقع</th>
                                <th>الفعلي</th>
                                <th>الفرق</th>
                                <th>الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${auditData
                              .map(
                                (item) => `
                                <tr class="${item.isError ? "table-danger" : ""}">
                                    <td>${item.branch}</td>
                                    <td>${item.product}</td>
                                    <td>${item.supplied}</td>
                                    <td>${item.sold}</td>
                                    <td>${item.returned}</td>
                                    <td>${item.transferredOut}</td>
                                    <td>${item.transferredIn}</td>
                                    <td>${item.customerReturn}</td>
                                    <td>${item.exchange}</td>
                                    <td>${item.expected}</td>
                                    <td>${item.actual}</td>
                                    <td><strong>${item.difference}</strong></td>
                                    <td>${item.status}</td>
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            `;
    }

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

// ============================================================
// ✅ دالة إعادة حساب المخزون بعد الجرد
// ============================================================

async function recalculateStockAfterAudit(auditId) {
    try {
        // 1. جلب عناصر الجرد
        const { data: items, error } = await supabaseClient
            .from("inventory_audit_items")
            .select("*")
            .eq("audit_id", auditId);

        if (error) throw error;

        let updates = [];
        for (const item of items) {
            if (item.difference !== 0) {
                // 2. تحديث مخزون الفرع
                const branchResult = await updateBranchStock(
                    item.branch_id,
                    item.product_id,
                    item.difference
                );
                
                // 3. ✅ تحديث المخزن الرئيسي (عكسياً)
                // لو الفرق موجب (زيادة في الفرع) => نقص من المخزن
                // لو الفرق سالب (نقص في الفرع) => زيادة في المخزن
                const warehouseChange = -item.difference;
                const warehouseResult = await updateWarehouseStock(
                    item.product_id,
                    warehouseChange
                );
                
                updates.push({
                    product_id: item.product_id,
                    branch_id: item.branch_id,
                    branch_change: item.difference,
                    warehouse_change: warehouseChange,
                    branch_new: branchResult.newQuantity,
                    warehouse_new: warehouseResult.newQuantity
                });
            }
        }

        return {
            success: true,
            updates: updates,
            message: `✅ تم تحديث ${updates.length} منتج`
        };

    } catch (error) {
        console.error("❌ خطأ في إعادة حساب المخزون:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// تصدير الدالة
window.recalculateStockAfterAudit = recalculateStockAfterAudit;