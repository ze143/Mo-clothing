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

// =============================================
// تدقيق المخزون - نسخة مُصلحة (تعتمد على الجرد)
// =============================================

async function loadAudit() {
    try {
        const container = document.getElementById("auditResults");

        // 1️⃣ جلب كل الفروع
        const { data: branches, error: bError } = await supabaseClient
            .from("branches")
            .select("*")
            .neq("name", "تجريبي");

        if (bError) throw bError;

        // 2️⃣ جلب كل المنتجات
        const { data: products, error: pError } = await supabaseClient
            .from("products")
            .select("*");

        if (pError) throw pError;

        // 3️⃣ جلب آخر جرد لكل فرع
        const { data: audits, error: aError } = await supabaseClient
            .from("inventory_audit")
            .select("*")
            .order("created_at", { ascending: false });

        if (aError) throw aError;

        // 4️⃣ جلب عناصر الجرد
        const { data: auditItems, error: aiError } = await supabaseClient
            .from("inventory_audit_items")
            .select("*");

        if (aiError) throw aiError;

        // 5️⃣ جلب المخزون الفعلي
        const { data: stock, error: sError } = await supabaseClient
            .from("branch_stock")
            .select("*");

        if (sError) throw sError;

        // 6️⃣ حساب الفروقات بناءً على الجرد
        let results = [];
        let totalErrors = 0;
        let totalMissing = 0;
        let totalExtra = 0;

        for (const branch of branches) {
            // جلب آخر جرد للفرع
            const lastAudit = audits.find((a) => a.branch_id === branch.id);

            for (const product of products) {
                // المخزون الفعلي
                const stockItem = stock.find(
                    (s) => s.branch_id === branch.id && s.product_id === product.id,
                );
                const actualQty = (stockItem && stockItem.quantity) || 0;

                // المخزون من الجرد
                let auditQty = 0;
                if (lastAudit) {
                    const auditItem = auditItems.find(
                        (a) => a.audit_id === lastAudit.id && a.product_id === product.id,
                    );
                    auditQty = (auditItem && auditItem.actual_quantity) || 0;
                }

                // ✅ الفرق = الفعلي - الجرد
                const variance = actualQty - auditQty;

                if (variance !== 0 || actualQty > 0 || auditQty > 0) {
                    const isError = variance !== 0;
                    let statusText = "✅ مضبوط";

                    if (variance > 0) {
                        statusText = "⚠️ زائد";
                        totalErrors++;
                        totalExtra += variance;
                    } else if (variance < 0) {
                        statusText = "❌ ناقص";
                        totalErrors++;
                        totalMissing += Math.abs(variance);
                    }

                    results.push({
                        branch: branch.name,
                        product: product.name,
                        auditQty: auditQty, // من الجرد
                        actualQty: actualQty, // من branch_stock
                        variance: variance,
                        status: statusText,
                        isError: isError,
                    });
                }
            }
        }

        // عرض النتائج
        let html = "";

        if (results.length === 0) {
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
                        <div class="stats-card ${totalErrors > 0 ? "danger" : "success"}">
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
                                <th>من الجرد</th>
                                <th>الفعلي</th>
                                <th>الفرق</th>
                                <th>الحالة</th>
                            </tr>
                        </thead>const expectedStock =

                        <tbody>
                            ${results
                              .map(
                                (item) => `
                                <tr class="${item.isError ? "table-danger" : ""}">
                                    <td>${item.branch}</td>
                                    <td>${item.product}</td>
                                    <td>${item.auditQty}</td>
                                    <td>${item.actualQty}</td>
                                    <td><strong>${item.variance}</strong></td>
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
          item.difference,
        );

        // 3. ✅ تحديث المخزن الرئيسي (عكسياً)
        // لو الفرق موجب (زيادة في الفرع) => نقص من المخزن
        // لو الفرق سالب (نقص في الفرع) => زيادة في المخزن
        const warehouseChange = -item.difference;
        const warehouseResult = await updateWarehouseStock(
          item.product_id,
          warehouseChange,
        );

        updates.push({
          product_id: item.product_id,
          branch_id: item.branch_id,
          branch_change: item.difference,
          warehouse_change: warehouseChange,
          branch_new: branchResult.newQuantity,
          warehouse_new: warehouseResult.newQuantity,
        });
      }
    }

    return {
      success: true,
      updates: updates,
      message: `✅ تم تحديث ${updates.length} منتج`,
    };
  } catch (error) {
    console.error("❌ خطأ في إعادة حساب المخزون:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// تصدير الدالة
window.recalculateStockAfterAudit = recalculateStockAfterAudit;