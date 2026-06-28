let currentBranchId = null;
let todayDate = new Date().toISOString().split("T")[0];

document.addEventListener("DOMContentLoaded", async function () {
  const user = await checkAuthAndRedirect();
  if (!user || user.profile.role !== "admin") {
    window.location.href = "/pages/login.html";
    return;
  }

  const avatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  avatar.textContent = user.profile.full_name
    ? user.profile.full_name.charAt(0).toUpperCase()
    : "A";
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
    // تحميل مبيعات اليوم للفرع
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

    // عرض بيانات الإقفال
    document.getElementById("closingData").style.display = "block";

    if (data.length === 0) {
      document.getElementById("closingItems").textContent = "0";
      document.getElementById("closingProducts").innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">لا توجد مبيعات</td></tr>';
      return;
    }

    // حساب الإجماليات
    let totalSales = 0;
    let totalItems = 0;
    let productsHtml = "";

    data.forEach((sale) => {
      const subtotal = sale.quantity * sale.products.price;
      totalSales += subtotal;
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

async function closeDay() {
  if (!currentBranchId) {
    alert("يرجى اختيار فرع");
    return;
  }

  if (
    !confirm(
      `هل أنت متأكد من إقفال اليوم للفرع المحدد؟\nسيتم حفظ التقرير وتصفير المبيعات اليومية.`,
    )
  ) {
    return;
  }

  try {
    // الحصول على بيانات المبيعات
    const { data: salesData, error: salesError } = await supabaseClient
      .from("daily_sales")
      .select(
        `
                *,
                products(price)
            `,
      )
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate);

    if (salesError) throw salesError;

    // حساب الإجماليات
    let totalSales = 0;
    let totalItems = 0;
    salesData.forEach((sale) => {
      totalSales += sale.quantity * sale.products.price;
      totalItems += sale.quantity;
    });

    // حفظ تقرير الإقفال
    const { data: userData } = await supabaseClient.auth.getUser();
    const userId = userData.user?.id;

    const { error: closingError } = await supabaseClient
      .from("day_closing")
      .insert({
        branch_id: currentBranchId,
        closing_date: todayDate,
        total_items_sold: totalItems,
        closed_by: userId,
        notes: "إقفال يومي",
      });

    if (closingError) throw closingError;

    // تصفير المبيعات اليومية
    const { error: deleteError } = await supabaseClient
      .from("daily_sales")
      .delete()
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate);

    if (deleteError) throw deleteError;

    showSuccess("تم إقفال اليوم بنجاح");

    // إعادة تحميل البيانات
    await loadBranchClosingData();
  } catch (error) {
    console.error("Error closing day:", error);
    alert("فشل إقفال اليوم: " + error.message);
  }
}

// =============================================
// دوال محسنة لإقفال اليوم
// =============================================

// إضافة حالة الإقفال
async function closeDayWithStatus(status = "completed") {
  if (!currentBranchId) {
    alert("يرجى اختيار فرع");
    return;
  }

  if (!confirm(`هل أنت متأكد من إقفال اليوم للفرع المحدد؟`)) {
    return;
  }

  try {
    const { data: salesData, error: salesError } = await supabaseClient
      .from("daily_sales")
      .select(
        `
                *,
                products(price)
            `,
      )
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate);

    if (salesError) throw salesError;

    let totalSales = 0;
    let totalItems = 0;
    salesData.forEach((sale) => {
      totalSales += sale.quantity * sale.products.price;
      totalItems += sale.quantity;
    });

    const { data: userData } = await supabaseClient.auth.getUser();
    const userId = userData.user?.id;

    // حفظ مع الحالة
    const { error: closingError } = await supabaseClient
      .from("day_closing")
      .insert({
        branch_id: currentBranchId,
        closing_date: todayDate,
        total_sales: totalSales,
        total_items_sold: totalItems,
        closed_by: userId,
        status: status, // <-- إضافة الحالة
        notes: `إقفال يومي - ${status}`,
      });

    if (closingError) throw closingError;

    // تسجيل النشاط
    await logActivity("day_closing", {
      branch_id: currentBranchId,
      total_sales: totalSales,
      status: status,
    });

    // تصفير المبيعات اليومية
    // تحديث المبيعات بأنها مقفلة
    const { error: updateError } = await supabaseClient
      .from("daily_sales")
      .update({ is_closed: true })
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate);

    if (updateError) throw updateError;

    showSuccess("تم إقفال اليوم بنجاح");
    await loadBranchClosingData();
  } catch (error) {
    console.error("Error closing day:", error);
    alert("فشل إقفال اليوم: " + error.message);
  }
}

// استبدال دالة closeDay القديمة
window.closeDay = closeDayWithStatus;

window.loadBranchClosingData = loadBranchClosingData;
window.closeDay = closeDay;
