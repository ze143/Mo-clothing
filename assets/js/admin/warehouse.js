// =============================================
// ملف إدارة المخزن - نسخة مبسطة ونظيفة
// =============================================

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

  await loadWarehouseStock();
});

// =============================================
// تحميل مخزون المستودع مع إحصائيات
// =============================================

async function loadWarehouseStock() {
  try {
    const { data, error } = await supabaseClient
      .from("warehouse_stock")
      .select(`
                *,
                products(name)
            `)
      .order("products(name)");

    if (error) throw error;

    const tbody = document.getElementById("warehouseBody");
    if (!tbody) {
      console.error("Element warehouseBody not found");
      return;
    }

    if (data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">لا توجد منتجات في المخزن</td></tr>';
      return;
    }

    // حساب الإحصائيات
    let totalItems = 0;
    let lowStockCount = 0;
    let emptyStockCount = 0;
    const lowStockThreshold = 10;

    data.forEach(item => {
      totalItems += item.quantity;
      if (item.quantity === 0) emptyStockCount++;
      else if (item.quantity <= lowStockThreshold) lowStockCount++;
    });

    // تحديث الإحصائيات
    const totalProductsEl = document.getElementById("totalProducts");
    const totalItemsEl = document.getElementById("totalItems");
    const lowStockEl = document.getElementById("lowStock");
    const emptyStockEl = document.getElementById("emptyStock");

    if (totalProductsEl) totalProductsEl.textContent = data.length;
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (lowStockEl) lowStockEl.textContent = lowStockCount;
    if (emptyStockEl) emptyStockEl.textContent = emptyStockCount;

    // عرض الجدول
    tbody.innerHTML = data
      .map((item, index) => {
        let statusBadge = "";
        if (item.quantity === 0) {
          statusBadge = '<span class="badge bg-danger">نفذ</span>';
        } else if (item.quantity <= lowStockThreshold) {
          statusBadge = '<span class="badge bg-warning">منخفض</span>';
        } else {
          statusBadge = '<span class="badge bg-success">متوفر</span>';
        }

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${item.products?.name || "غير معروف"}</td>
                <td><span class="badge bg-primary">${item.quantity}</span></td>
                <td>${statusBadge}</td>
            </tr>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading warehouse stock:", error);
    showError("فشل تحميل مخزون المستودع");
  }
}

// جعل الدالة متاحة للتحديث اليدوي
window.loadWarehouseStock = loadWarehouseStock;