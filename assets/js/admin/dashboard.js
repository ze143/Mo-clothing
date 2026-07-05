// متغيرات عامة
let branchSalesChart = null;
let topProductsChart = null;
let currentFilters = {
  dateFrom: "",
  dateTo: "",
  branchId: "",
  productId: "",
};
let allSalesData = []; // تخزين كل المبيعات

// تهيئة الصفحة
document.addEventListener("DOMContentLoaded", async function () {
  try {
    const user = await checkAuthAndRedirect();
    if (!user) return;

    if (user.profile.role !== "admin") {
      alert("غير مصرح لك بالوصول إلى هذه الصفحة");
      window.location.href = "/pages/login.html";
      return;
    }

    const avatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    avatar.textContent = user.profile.full_name
      ? user.profile.full_name.charAt(0).toUpperCase()
      : "A";
    userName.textContent = user.profile.full_name || "أدمن";

    await loadDashboardData();
    await loadBranches();
    await loadProducts();
    await loadAllSales(); // تحميل كل المبيعات
    await loadAdditionalStats();

    setTimeout(() => {
      updateCharts();
    }, 1000);
  } catch (error) {
    console.error("Dashboard initialization error:", error);
    showError("حدث خطأ في تحميل لوحة التحكم");
  }
});

// تحميل كل المبيعات (بدون حد)
async function loadAllSales() {
  try {
    let query = supabaseClient
      .from("daily_sales")
      .select(
        `
        *,
        branches(name),
        products(name)
      `,
      )
      .eq("is_closed", true)
      .order("created_at", { ascending: false });

    // تطبيق الفلاتر
    if (currentFilters.dateFrom) {
      query = query.gte("sale_date", currentFilters.dateFrom);
    }
    if (currentFilters.dateTo) {
      query = query.lte("sale_date", currentFilters.dateTo);
    }
    if (currentFilters.branchId) {
      query = query.eq("branch_id", currentFilters.branchId);
    }
    if (currentFilters.productId) {
      query = query.eq("product_id", currentFilters.productId);
    }

    const { data, error } = await query;
    if (error) throw error;

    allSalesData = data || [];
    displaySales(allSalesData);
    updateSalesCount(allSalesData.length);
  } catch (error) {
    console.error("Error loading sales:", error);
    showError("فشل تحميل سجل المبيعات");
  }
}

// عرض المبيعات في الجدول
function displaySales(data) {
  const tbody = document.getElementById("recentSalesBody");

  if (data.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center text-muted py-4">لا توجد مبيعات</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (sale) => `
        <tr>
            <td>${new Date(sale.sale_date).toLocaleDateString("ar")}</td>
            <td>${sale.branches?.name || "غير معروف"}</td>
            <td>${sale.products?.name || "غير معروف"}</td>
            <td><span class="badge bg-primary">${sale.quantity}</span></td>
        </tr>
      `,
    )
    .join("");
}

// تحديث عدد المبيعات
function updateSalesCount(count) {
  const badge = document.getElementById("salesCount");
  if (badge) {
    badge.textContent = count;
  }
}

// تحميل الفروع (للفلاتر)
async function loadBranches() {
  try {
    const { data, error } = await supabaseClient
      .from("branches")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("filterBranch");
    select.innerHTML = '<option value="">جميع الفروع</option>';
    data.forEach((branch) => {
      select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading branches:", error);
  }
}

// تحميل المنتجات (للفلاتر)
async function loadProducts() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("filterProduct");
    select.innerHTML = '<option value="">جميع المنتجات</option>';
    data.forEach((product) => {
      select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

// تطبيق الفلاتر
function applyFilters() {
  currentFilters = {
    dateFrom: document.getElementById("filterDateFrom").value,
    dateTo: document.getElementById("filterDateTo").value,
    branchId: document.getElementById("filterBranch").value,
    productId: document.getElementById("filterProduct").value,
  };

  // تحديث سجل المبيعات
  loadAllSales();
  // تحديث الرسوم البيانية
  updateCharts();
}

// إعادة تعيين الفلاتر
function resetFilters() {
  document.getElementById("filterDateFrom").value = "";
  document.getElementById("filterDateTo").value = "";
  document.getElementById("filterBranch").value = "";
  document.getElementById("filterProduct").value = "";
  currentFilters = {
    dateFrom: "",
    dateTo: "",
    branchId: "",
    productId: "",
  };

  loadAllSales();
  updateCharts();
}

// تحميل بيانات لوحة التحكم
async function loadDashboardData() {
  try {
    const { count: branchesCount, error: branchesError } = await supabaseClient
      .from("branches")
      .select("*", { count: "exact", head: true });

    if (branchesError) throw branchesError;

    const { count: productsCount, error: productsError } = await supabaseClient
      .from("products")
      .select("*", { count: "exact", head: true });

    if (productsError) throw productsError;

    document.getElementById("totalBranches").textContent = branchesCount || 0;
    document.getElementById("totalProducts").textContent = productsCount || 0;
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    showError("فشل تحميل بيانات لوحة التحكم");
  }
}

// تحميل إحصائيات إضافية
async function loadAdditionalStats() {
  try {
    await showLowStockAlert();
  } catch (error) {
    console.error("Error loading additional stats:", error);
  }
}

// تحديث الرسوم البيانية
async function updateCharts() {
  try {
    let query = supabaseClient
      .from("daily_sales")
      .select(
        `
        *,
        branches(name),
        products(name)
    `,
      )
      .eq("is_closed", true);

    if (currentFilters.dateFrom) {
      query = query.gte("sale_date", currentFilters.dateFrom);
    }
    if (currentFilters.dateTo) {
      query = query.lte("sale_date", currentFilters.dateTo);
    }
    if (currentFilters.branchId) {
      query = query.eq("branch_id", currentFilters.branchId);
    }
    if (currentFilters.productId) {
      query = query.eq("product_id", currentFilters.productId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const branchSales = {};
    const productSales = {};

    data.forEach((sale) => {
      const branchName = sale.branches?.name || "غير معروف";
      const productName = sale.products?.name || "غير معروف";

      branchSales[branchName] = (branchSales[branchName] || 0) + sale.quantity;
      productSales[productName] =
        (productSales[productName] || 0) + sale.quantity;
    });

    createBranchSalesChart(branchSales);
    createTopProductsChart(productSales);
  } catch (error) {
    console.error("Error updating charts:", error);
  }
}

// إنشاء رسم مبيعات الفروع
function createBranchSalesChart(data) {
  const labels = Object.keys(data);
  const values = Object.values(data);

  const ctx = document.getElementById("branchSalesChart").getContext("2d");

  if (branchSalesChart) {
    branchSalesChart.destroy();
  }

  branchSalesChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "عدد المبيعات",
          data: values,
          backgroundColor: [
            "rgba(44,62,80,0.8)",
            "rgba(231,76,60,0.8)",
            "rgba(52,152,219,0.8)",
            "rgba(39,174,96,0.8)",
            "rgba(243,156,18,0.8)",
          ],
          borderColor: [
            "rgba(44,62,80,1)",
            "rgba(231,76,60,1)",
            "rgba(52,152,219,1)",
            "rgba(39,174,96,1)",
            "rgba(243,156,18,1)",
          ],
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "top",
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return context.parsed.y + " قطعة";
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "عدد القطع",
          },
          ticks: {
            callback: function (value) {
              return value;
            },
          },
        },
      },
    },
  });
}

// إنشاء رسم أفضل المنتجات
function createTopProductsChart(data) {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const labels = sorted.map((item) => item[0]);
  const values = sorted.map((item) => item[1]);

  const ctx = document.getElementById("topProductsChart").getContext("2d");

  if (topProductsChart) {
    topProductsChart.destroy();
  }

  const colors = [
    "rgba(231,76,60,0.8)",
    "rgba(52,152,219,0.8)",
    "rgba(39,174,96,0.8)",
    "rgba(243,156,18,0.8)",
    "rgba(155,89,182,0.8)",
  ];

  topProductsChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: colors.map((c) => c.replace("0.8", "1")),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return context.label + ": " + context.parsed + " قطعة";
            },
          },
        },
      },
    },
  });
}

// جعل الدوال متاحة في النطاق العام
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.updateCharts = updateCharts;
window.loadAllSales = loadAllSales;
