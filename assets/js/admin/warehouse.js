// =============================================
// ملف إدارة المخزن - مع فلاتر وإحصائيات
// =============================================

let allStockData = [];
let currentFilters = {
  search: '',
  status: ''
};

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

  // =============================================
  // الفلاتر تطبق أول بأول (بدون زر)
  // =============================================
  document.getElementById('searchProduct').addEventListener('input', function() {
    currentFilters.search = this.value.trim().toLowerCase();
    applyFilters();
  });

  document.getElementById('filterStatus').addEventListener('change', function() {
    currentFilters.status = this.value;
    applyFilters();
  });
});

// =============================================
// تحميل مخزون المستودع
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

    allStockData = data || [];
    applyFilters();
    updateStatistics();

  } catch (error) {
    console.error("Error loading warehouse stock:", error);
    showError("فشل تحميل مخزون المستودع");
  }
}

// =============================================
// تطبيق الفلاتر
// =============================================

function applyFilters() {
  const search = currentFilters.search;
  const status = currentFilters.status;

  let filteredData = allStockData;

  // فلتر البحث
  if (search) {
    filteredData = filteredData.filter(item => 
      item.products?.name?.toLowerCase().includes(search)
    );
  }

  // فلتر الحالة
  if (status) {
    filteredData = filteredData.filter(item => {
      const quantity = item.quantity || 0;
      if (status === 'available') return quantity > 10;
      if (status === 'low') return quantity > 0 && quantity <= 10;
      if (status === 'empty') return quantity === 0;
      return true;
    });
  }

  displayWarehouseStock(filteredData);
}

// =============================================
// عرض مخزون المستودع
// =============================================

function displayWarehouseStock(data) {
  const tbody = document.getElementById("warehouseBody");
  const lowStockThreshold = 10;

  if (!data || data.length === 0) {
    tbody.innerHTML = 
      '<tr><td colspan="4" class="text-center text-muted py-4">لا توجد منتجات في المخزن</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map((item, index) => {
      const quantity = item.quantity || 0;
      let statusBadge = "";
      let statusText = "";

      if (quantity === 0) {
        statusBadge = "bg-danger";
        statusText = "نفذ";
      } else if (quantity <= lowStockThreshold) {
        statusBadge = "bg-warning";
        statusText = "منخفض";
      } else {
        statusBadge = "bg-success";
        statusText = "متوفر";
      }

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${item.products?.name || "غير معروف"}</td>
          <td><span class="badge bg-primary">${quantity}</span></td>
          <td><span class="badge ${statusBadge}">${statusText}</span></td>
        </tr>
      `;
    })
    .join("");
}

// =============================================
// تحديث الإحصائيات
// =============================================

function updateStatistics() {
  const totalProducts = allStockData.length;
  const totalItems = allStockData.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const lowStock = allStockData.filter(item => (item.quantity || 0) > 0 && (item.quantity || 0) <= 10).length;
  const emptyStock = allStockData.filter(item => (item.quantity || 0) === 0).length;

  document.getElementById("totalProducts").textContent = totalProducts;
  document.getElementById("totalItems").textContent = totalItems;
  document.getElementById("lowStock").textContent = lowStock;
  document.getElementById("emptyStock").textContent = emptyStock;
}

// =============================================
// إعادة تعيين الفلاتر
// =============================================

function resetFilters() {
  document.getElementById('searchProduct').value = '';
  document.getElementById('filterStatus').value = '';
  currentFilters.search = '';
  currentFilters.status = '';
  applyFilters();
}

// =============================================
// جعل الدوال متاحة
// =============================================

window.loadWarehouseStock = loadWarehouseStock;
window.resetFilters = resetFilters;