// =============================================
// تقرير الفروع
// =============================================

let allBranches = [];
let allStockData = [];
let currentFilters = {
  search: '',
  sort: 'name'
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

  await loadBranchReport();

  // =============================================
  // الفلاتر تطبق أول بأول (بدون زر)
  // =============================================
  document.getElementById('searchBranch').addEventListener('input', function() {
    currentFilters.search = this.value.trim().toLowerCase();
    applyFilters();
  });

  document.getElementById('sortBranches').addEventListener('change', function() {
    currentFilters.sort = this.value;
    applyFilters();
  });
});

// =============================================
// تحميل تقرير الفروع
// =============================================

async function loadBranchReport() {
  try {
    // 1. جلب جميع الفروع
    const { data: branches, error: branchesError } = await supabaseClient
      .from("branches")
      .select("*")
      .order("name");

    if (branchesError) throw branchesError;

    allBranches = branches || [];

    if (allBranches.length === 0) {
      document.getElementById("branchReportContainer").innerHTML = `
        <div class="text-center text-muted py-5">
          <i class="fas fa-store fa-3x mb-3 d-block"></i>
          لا توجد فروع
        </div>
      `;
      return;
    }

    // 2. جلب مخزون الفروع
    const { data: stockData, error: stockError } = await supabaseClient
      .from("branch_stock")
      .select(`
        *,
        branches(name),
        products(name)
      `)
      .order("branches(name)");

    if (stockError) throw stockError;

    allStockData = stockData || [];
    applyFilters();

  } catch (error) {
    console.error("Error loading branch report:", error);
    showError("فشل تحميل تقرير الفروع");
  }
}

// =============================================
// تطبيق الفلاتر
// =============================================

function applyFilters() {
  let filteredBranches = allBranches;

  // فلتر البحث
  if (currentFilters.search) {
    filteredBranches = filteredBranches.filter(branch => 
      branch.name.toLowerCase().includes(currentFilters.search)
    );
  }

  // ترتيب
  if (currentFilters.sort === 'name') {
    filteredBranches.sort((a, b) => a.name.localeCompare(b.name));
  } else if (currentFilters.sort === 'name_desc') {
    filteredBranches.sort((a, b) => b.name.localeCompare(a.name));
  } else if (currentFilters.sort === 'most_items') {
    filteredBranches.sort((a, b) => {
      const aTotal = allStockData.filter(item => item.branch_id === a.id).reduce((sum, i) => sum + (i.quantity || 0), 0);
      const bTotal = allStockData.filter(item => item.branch_id === b.id).reduce((sum, i) => sum + (i.quantity || 0), 0);
      return bTotal - aTotal;
    });
  } else if (currentFilters.sort === 'least_items') {
    filteredBranches.sort((a, b) => {
      const aTotal = allStockData.filter(item => item.branch_id === a.id).reduce((sum, i) => sum + (i.quantity || 0), 0);
      const bTotal = allStockData.filter(item => item.branch_id === b.id).reduce((sum, i) => sum + (i.quantity || 0), 0);
      return aTotal - bTotal;
    });
  }

  displayBranchReport(filteredBranches, allStockData);
  updateStatistics(filteredBranches, allStockData);
}

// =============================================
// عرض تقرير الفروع
// =============================================

function displayBranchReport(branches, stockData) {
  const container = document.getElementById("branchReportContainer");
  
  if (branches.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="fas fa-search fa-3x mb-3 d-block"></i>
        لا توجد فروع تطابق البحث
      </div>
    `;
    return;
  }

  let html = '';

  branches.forEach((branch, index) => {
    const branchStock = stockData.filter(item => item.branch_id === branch.id);
    const totalItems = branchStock.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const productCount = branchStock.length;

    html += `
      <div class="branch-card border-bottom">
        <div class="branch-header p-3 bg-light d-flex justify-content-between align-items-center" 
             onclick="toggleBranch('branch-${branch.id}')" 
             style="cursor: pointer;">
          <div class="d-flex align-items-center gap-3">
            <span class="badge bg-primary rounded-circle p-2" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
              ${index + 1}
            </span>
            <div>
              <h5 class="mb-0">${branch.name}</h5>
              <small class="text-muted">${productCount} منتج • ${totalItems} قطعة</small>
            </div>
          </div>
          <div>
            <span class="badge bg-success">${totalItems} قطعة</span>
            <i class="fas fa-chevron-down ms-2"></i>
          </div>
        </div>
        <div class="branch-body p-3" id="branch-${branch.id}" style="display: none;">
          <div class="table-responsive">
            <table class="table table-sm table-hover">
              <thead class="table-light">
                <tr>
                  <th>#</th>
                  <th>المنتج</th>
                  <th>الكمية</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                ${branchStock.length === 0 ? `
                  <tr>
                    <td colspan="4" class="text-center text-muted">لا توجد منتجات في هذا الفرع</td>
                  </tr>
                ` : branchStock.map((item, idx) => {
                  const quantity = item.quantity || 0;
                  let statusBadge = "";
                  let statusText = "";
                  if (quantity === 0) {
                    statusBadge = "bg-danger";
                    statusText = "نفذ";
                  } else if (quantity <= 10) {
                    statusBadge = "bg-warning";
                    statusText = "منخفض";
                  } else {
                    statusBadge = "bg-success";
                    statusText = "متوفر";
                  }
                  return `
                    <tr>
                      <td>${idx + 1}</td>
                      <td>${item.products?.name || "غير معروف"}</td>
                      <td><span class="badge bg-primary">${quantity}</span></td>
                      <td><span class="badge ${statusBadge}">${statusText}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot class="table-light">
                <tr>
                  <td colspan="3" class="fw-bold">إجمالي القطع</td>
                  <td class="fw-bold">${totalItems}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // فتح أول فرع افتراضياً
  if (branches.length > 0) {
    const firstBranch = document.getElementById(`branch-${branches[0].id}`);
    if (firstBranch) {
      firstBranch.style.display = 'block';
      const icon = firstBranch.parentElement.querySelector('.fa-chevron-down');
      if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
    }
  }
}

// =============================================
// تحديث الإحصائيات
// =============================================

function updateStatistics(branches, stockData) {
  const totalItems = stockData.reduce((sum, item) => sum + (item.quantity || 0), 0);

  document.getElementById("totalBranches").textContent = branches.length;
  document.getElementById("totalItems").textContent = totalItems;
}

// =============================================
// إعادة تعيين الفلاتر
// =============================================

function resetFilters() {
  document.getElementById('searchBranch').value = '';
  document.getElementById('sortBranches').value = 'name';
  currentFilters.search = '';
  currentFilters.sort = 'name';
  applyFilters();
}

// =============================================
// فتح/غلق الفرع
// =============================================

function toggleBranch(branchId) {
  const element = document.getElementById(branchId);
  if (!element) return;

  const icon = element.parentElement.querySelector('.fa-chevron-down, .fa-chevron-up');
  
  if (element.style.display === 'none' || element.style.display === '') {
    element.style.display = 'block';
    if (icon) {
      icon.classList.remove('fa-chevron-down');
      icon.classList.add('fa-chevron-up');
    }
  } else {
    element.style.display = 'none';
    if (icon) {
      icon.classList.remove('fa-chevron-up');
      icon.classList.add('fa-chevron-down');
    }
  }
}

// =============================================
// جعل الدوال متاحة
// =============================================

window.loadBranchReport = loadBranchReport;
window.toggleBranch = toggleBranch;
window.resetFilters = resetFilters;