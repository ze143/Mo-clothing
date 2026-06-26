// متغيرات عامة
let branchSalesChart = null;
let topProductsChart = null;
let currentFilters = {
  dateFrom: "",
  dateTo: "",
  branchId: "",
  productId: "",
};

// تهيئة الصفحة
document.addEventListener("DOMContentLoaded", async function () {
  try {
    const user = await checkAuthAndRedirect();
    if (!user) return;

    // التحقق من صلاحيات الأدمن
    if (user.profile.role !== "admin") {
      alert("غير مصرح لك بالوصول إلى هذه الصفحة");
      window.location.href = "/pages/login.html";
      return;
    }

    // عرض معلومات المستخدم
    const avatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    avatar.textContent = user.profile.full_name
      ? user.profile.full_name.charAt(0).toUpperCase()
      : "A";
    userName.textContent = user.profile.full_name || "أدمن";

    // تحميل البيانات
    await loadDashboardData();
    await loadBranches();
    await loadProducts();
    await loadRecentSales();
    await loadAdditionalStats();

    // تحديث الرسوم البيانية بعد تحميل البيانات
    setTimeout(() => {
      updateCharts();
    }, 1000);
  } catch (error) {
    console.error("Dashboard initialization error:", error);
    showError("حدث خطأ في تحميل لوحة التحكم");
  }
});

async function loadDashboardData() {
  try {
    // 1. الحصول على إجمالي الإيرادات من تقارير الإقفال
    const { data: closingData, error: closingError } = await supabaseClient
      .from("day_closing")
      .select("total_sales, total_items_sold");

    if (closingError) throw closingError;

    // حساب الإجماليات
    let totalRevenue = 0;
    let totalSales = 0;

    closingData.forEach((item) => {
      totalRevenue += item.total_sales || 0;
      totalSales += item.total_items_sold || 0;
    });

    // 2. الحصول على عدد الفروع
    const { count: branchesCount, error: branchesError } = await supabaseClient
      .from("branches")
      .select("*", { count: "exact", head: true });

    if (branchesError) throw branchesError;

    // 3. الحصول على عدد المنتجات
    const { count: productsCount, error: productsError } = await supabaseClient
      .from("products")
      .select("*", { count: "exact", head: true });

    if (productsError) throw productsError;

    // 4. تحديث الإحصائيات
    document.getElementById("totalRevenue").textContent =
      formatCurrency(totalRevenue);
    document.getElementById("totalSales").textContent =
      totalSales.toLocaleString();
    document.getElementById("totalBranches").textContent = branchesCount || 0;
    document.getElementById("totalProducts").textContent = productsCount || 0;
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    showError("فشل تحميل بيانات لوحة التحكم");
  }
}

// تحميل الفروع
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

// تحميل المنتجات
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

// تحميل آخر المبيعات
async function loadRecentSales() {
  try {
    const { data, error } = await supabaseClient
      .from("daily_sales")
      .select(
        `
                *,
                branches(name),
                products(name, price)
            `,
      )
      .eq("is_closed", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const tbody = document.getElementById("recentSalesBody");
    if (data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">لا توجد مبيعات</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map(
        (sale) => `
            <tr>
                <td>${new Date(sale.sale_date).toLocaleDateString("ar")}</td>
                <td>${sale.branches?.name || "غير معروف"}</td>
                <td>${sale.products?.name || "غير معروف"}</td>
                <td>${sale.quantity}</td>
                <td>${formatCurrency(sale.quantity * (sale.products?.price || 0))}</td>
            </tr>
        `,
      )
      .join("");
  } catch (error) {
    console.error("Error loading recent sales:", error);
  }
}

// تحميل إحصائيات إضافية
async function loadAdditionalStats() {
  try {
    // التحقق من نقص المخزون
    await showLowStockAlert();
  } catch (error) {
    console.error("Error loading additional stats:", error);
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

  // تحديث الرسوم البيانية بناءً على الفلاتر
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

  // تحديث الرسوم البيانية
  updateCharts();
}

// تحديث الرسوم البيانية
async function updateCharts() {
  try {
    // بناء استعلام المبيعات
    let query = supabaseClient
      .from("daily_sales")
      .select(
        `
        *,
        branches(name),
        products(name, price)
    `,
      )
      .eq("is_closed", true);

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

    // تحليل البيانات للرسوم البيانية
    const branchSales = {};
    const productSales = {};

    data.forEach((sale) => {
      const branchName = sale.branches?.name || "غير معروف";
      const productName = sale.products?.name || "غير معروف";

      branchSales[branchName] =
        (branchSales[branchName] || 0) +
        sale.quantity * (sale.products?.price || 0);
      productSales[productName] =
        (productSales[productName] || 0) + sale.quantity;
    });

    // تحديث رسم مبيعات الفروع
    createBranchSalesChart(branchSales);

    // تحديث رسم أفضل المنتجات
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
          label: "إجمالي المبيعات",
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
              return formatCurrency(context.parsed.y);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return formatCurrency(value);
            },
          },
        },
      },
    },
  });
}

// إنشاء رسم أفضل المنتجات
function createTopProductsChart(data) {
  // ترتيب المنتجات حسب الكمية
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const labels = sorted.map((item) => item[0]);
  const values = sorted.map((item) => item[1]);

  const ctx = document.getElementById("topProductsChart").getContext("2d");

  if (topProductsChart) {
    topProductsChart.destroy();
  }

  // ألوان مميزة
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
