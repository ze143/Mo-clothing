let currentBranchId = null;
let todayDate = new Date().toISOString().split("T")[0];

// =============================================
// دالة خصم المخزون الموحدة (مرة واحدة فقط)
// =============================================

async function deductStock(branchId, salesData) {
    if (!salesData || salesData.length === 0) return;

    console.log("🔄 بدء خصم المخزون...");

    for (var i = 0; i < salesData.length; i++) {
        var sale = salesData[i];

        // جلب المخزون الحالي
        var stockResult = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", sale.product_id)
            .single();

        if (stockResult.error && stockResult.error.code !== "PGRST116") {
            console.error("Error fetching stock:", stockResult.error);
            continue;
        }

        var currentQty = stockResult.data ? stockResult.data.quantity : 0;
        var newQty = Math.max(0, currentQty - sale.quantity);

        // تحديث المخزون
        var updateResult = await supabaseClient
            .from("branch_stock")
            .update({
                quantity: newQty,
                updated_at: new Date().toISOString(),
            })
            .eq("branch_id", branchId)
            .eq("product_id", sale.product_id);

        if (updateResult.error) {
            console.error("Error updating stock:", updateResult.error);
        } else {
            console.log("✅ خصم:", sale.product_id, sale.quantity, "قطعة");
        }
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    const user = await checkAuthAndRedirect();
    if (!user || user.profile.role !== "admin") {
        window.location.href = "/pages/login.html";
        return;
    }

    const avatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    avatar.textContent = user.profile.full_name ?
        user.profile.full_name.charAt(0).toUpperCase() :
        "A";
    userName.textContent = user.profile.full_name || "أدمن";

    await loadBranches();
});

async function loadBranches() {
    try {
        const { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");

        if (error) throw error;

        const select = document.getElementById("closeBranch");
        select.innerHTML = '<option value="">اختر فرعاً</option>';
        data.forEach((branch) => {
            select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
        });
    } catch (error) {
        console.error("Error loading branches:", error);
        showError("فشل تحميل الفروع");
    }
}

async function loadBranchClosingData() {
    currentBranchId = document.getElementById("closeBranch").value;

    if (!currentBranchId) {
        document.getElementById("closingData").style.display = "none";
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from("daily_sales")
            .select(
                `
                *,
                products(name, price)
            `,
            )
            .eq("branch_id", currentBranchId)
            .eq("sale_date", todayDate)
            .eq("is_closed", false);

        if (error) throw error;

        document.getElementById("closingData").style.display = "block";

        if (data.length === 0) {
            document.getElementById("closingItems").textContent = "0";
            document.getElementById("closingProducts").innerHTML =
                '<tr><td colspan="4" class="text-center text-muted">لا توجد مبيعات</td></tr>';
            return;
        }

        let totalItems = 0;
        let productsHtml = "";

        data.forEach((sale) => {
            totalItems += sale.quantity;

            productsHtml += `
                <tr>
                    <td>${sale.products.name}</td>
                    <td>${sale.quantity}</td>
                </tr>
            `;
        });

        document.getElementById("closingItems").textContent = totalItems;
        document.getElementById("closingProducts").innerHTML = productsHtml;
    } catch (error) {
        console.error("Error loading closing data:", error);
        showError("فشل تحميل بيانات الإقفال");
    }
}

// =============================================
// دوال إقفال اليوم
// =============================================
async function closeDayWithStatus(status = "completed") {
    if (!currentBranchId) {
        alert("يرجى اختيار فرع");
        return;
    }

    if (!confirm(`هل أنت متأكد من إقفال اليوم للفرع المحدد؟`)) {
        return;
    }

    try {
        // 1. جلب المبيعات غير المقفلة
        const { data: salesData, error: salesError } = await supabaseClient
            .from("daily_sales")
            .select(`*`)
            .eq("branch_id", currentBranchId)
            .eq("sale_date", todayDate)
            .eq("is_closed", false);

        if (salesError) throw salesError;

        // 2. حساب الإجماليات
        let totalItems = 0;
        salesData.forEach((sale) => {
            totalItems += sale.quantity;
        });

        // 3. حفظ تقرير الإقفال
        const { data: userData } = await supabaseClient.auth.getUser();
        var userId = (userData && userData.user && userData.user.id) || null;

        const { error: closingError } = await supabaseClient
            .from("day_closing")
            .insert({
                branch_id: currentBranchId,
                closing_date: todayDate,
                total_items_sold: totalItems,
                closed_by: userId,
                status: status,
                notes: "إقفال يومي - " + status,
            });

        if (closingError) throw closingError;

        // =============================================
        // 4. ✅ فقط تحديث حالة المبيعات (دون تعديل المخزون)
        // =============================================
        const { error: updateError } = await supabaseClient
            .from("daily_sales")
            .update({ is_closed: true })
            .eq("branch_id", currentBranchId)
            .eq("sale_date", todayDate)
            .eq("is_closed", false);

        if (updateError) throw updateError;

        // 5. تحديث جميع الصفحات المفتوحة
        localStorage.setItem("stockUpdated", Date.now());

        showSuccess("✅ تم إقفال اليوم بنجاح (المخزون تم خصمه مسبقاً)");
        await loadBranchClosingData();
    } catch (error) {
        console.error("Error closing day:", error);
        alert("فشل إقفال اليوم: " + error.message);
    }
}

async function closeDayAndRefresh() {
    await closeDay();

    // ✅ تحديث جميع الصفحات المفتوحة
    // إرسال رسالة للتحديث
    localStorage.setItem("stockUpdated", Date.now());

    // تحديث الصفحة الحالية
    location.reload();
}

// جعل الدوال متاحة
window.closeDay = closeDayWithStatus;
window.loadBranchClosingData = loadBranchClosingData;