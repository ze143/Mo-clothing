// =============================================
// لوحة المالك - Dashboard
// =============================================

let branchSalesChart = null;
let topProductsChart = null;

document.addEventListener("DOMContentLoaded", async function() {
    try {
        const user = await checkAuthAndRedirect();
        if (!user || user.profile.role !== "owner") {
            window.location.href = "/pages/login.html";
            return;
        }

        document.getElementById("userAvatar").textContent = user.profile.full_name ? user.profile.full_name.charAt(0).toUpperCase() : "O";
        document.getElementById("userName").textContent = user.profile.full_name || "مالك";

        // تحميل الفلاتر
        await loadDashboardFilters();

        // تحميل البيانات
        await loadStats();
        await loadTopBranches();

        setTimeout(function() {
            updateCharts();
        }, 1000);

    } catch (error) {
        console.error("Error initializing owner dashboard:", error);
    }
});

// =============================================
// تحميل الإحصائيات
// =============================================

async function loadStats() {
    try {
        const branchesResult = await supabaseClient
            .from("branches")
            .select("*", { count: "exact", head: true });
        const branchesCount = branchesResult.count || 0;

        const productsResult = await supabaseClient
            .from("products")
            .select("*", { count: "exact", head: true });
        const productsCount = productsResult.count || 0;

        const salesResult = await supabaseClient
            .from("daily_sales")
            .select("quantity, is_closed");
        let totalSales = 0;
        if (!salesResult.error && salesResult.data) {
            totalSales = salesResult.data.reduce(function(sum, item) {
                return sum + (item.is_closed ? item.quantity : 0);
            }, 0);
        }

        const itemsResult = await supabaseClient
            .from("branch_stock")
            .select("quantity");
        let totalItems = 0;
        if (!itemsResult.error && itemsResult.data) {
            totalItems = itemsResult.data.reduce(function(sum, item) {
                return sum + (item.quantity || 0);
            }, 0);
        }

        document.getElementById("totalBranches").textContent = branchesCount;
        document.getElementById("totalProducts").textContent = productsCount;
        document.getElementById("totalSales").textContent = totalSales;
        document.getElementById("totalItems").textContent = totalItems;
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

// =============================================
// تحميل أفضل الفروع أداءً
// =============================================

async function loadTopBranches() {
    try {
        // جلب جميع الفروع
        const branchesResult = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (branchesResult.error) throw branchesResult.error;
        var branches = branchesResult.data;

        // جلب المبيعات
        const salesResult = await supabaseClient
            .from("daily_sales")
            .select(
                `
                *,
                branches(name)
            `,
            )
            .eq("is_closed", true);

        if (salesResult.error) throw salesResult.error;
        var sales = salesResult.data;

        // جلب المخزون
        const stockResult = await supabaseClient.from("branch_stock").select(`
                *,
                branches(name)
            `);

        if (stockResult.error) throw stockResult.error;
        var stock = stockResult.data;

        var tbody = document.getElementById("topBranchesBody");
        var countBadge = document.getElementById("topBranchesCount");

        if (!branches || branches.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" class="text-center text-muted py-3">لا توجد فروع</td></tr>';
            if (countBadge) countBadge.textContent = "0";
            return;
        }

        // حساب إحصائيات كل فرع
        var branchStats = [];
        for (var i = 0; i < branches.length; i++) {
            var branch = branches[i];

            // حساب مبيعات الفرع
            var branchSales = sales.filter(function(s) {
                return s.branch_id === branch.id;
            });
            var totalSales = branchSales.length;
            var totalItems = branchSales.reduce(function(sum, s) {
                return sum + s.quantity;
            }, 0);

            // حساب مخزون الفرع
            var branchStock = stock.filter(function(s) {
                return s.branch_id === branch.id;
            });
            var totalStock = branchStock.reduce(function(sum, s) {
                return sum + (s.quantity || 0);
            }, 0);

            branchStats.push({
                id: branch.id,
                name: branch.name,
                totalSales: totalSales,
                totalItems: totalItems,
                totalStock: totalStock,
            });
        }

        // ترتيب حسب إجمالي المبيعات (الأعلى أولاً)
        branchStats.sort(function(a, b) {
            return b.totalSales - a.totalSales;
        });

        // أخذ أفضل 5 فروع
        var topBranches = branchStats.slice(0, 5);

        if (countBadge) countBadge.textContent = topBranches.length;

        if (topBranches.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" class="text-center text-muted py-3">لا توجد مبيعات</td></tr>';
            return;
        }

        var html = "";
        for (var j = 0; j < topBranches.length; j++) {
            var b = topBranches[j];

            // تحديد الميدالية
            var medal = "";
            if (j === 0) medal = "🥇";
            else if (j === 1) medal = "🥈";
            else if (j === 2) medal = "🥉";
            else medal = j + 1;

            html +=
                "<tr>" +
                "<td>" +
                medal +
                "</td>" +
                "<td><strong>" +
                b.name +
                "</strong></td>" +
                '<td><span class="badge bg-primary">' +
                b.totalSales +
                "</span></td>" +
                "<td>" +
                b.totalItems +
                "</td>" +
                "<td>" +
                b.totalStock +
                "</td>" +
                "</tr>";
        }
        tbody.innerHTML = html;
    } catch (error) {
        console.error("Error loading top branches:", error);
        showError("فشل تحميل أفضل الفروع");
    }
}

// =============================================
// تحديث الرسوم البيانية
// =============================================

async function updateCharts() {
    try {
        var result = await supabaseClient
            .from("daily_sales")
            .select(
                `
                *,
                branches(name),
                products(name)
            `,
            )
            .eq("is_closed", true);

        if (result.error || !result.data) return;

        var data = result.data;
        var branchSales = {};
        var productSales = {};

        for (var i = 0; i < data.length; i++) {
            var sale = data[i];
            var branchName =
                sale.branches && sale.branches.name ? sale.branches.name : "غير معروف";
            var productName =
                sale.products && sale.products.name ? sale.products.name : "غير معروف";

            branchSales[branchName] = (branchSales[branchName] || 0) + sale.quantity;
            productSales[productName] =
                (productSales[productName] || 0) + sale.quantity;
        }

        createBranchSalesChart(branchSales);
        createTopProductsChart(productSales);
    } catch (error) {
        console.error("Error updating charts:", error);
    }
}

function createBranchSalesChart(data) {
    var ctx = document.getElementById("branchSalesChart");
    if (!ctx) return;

    var labels = Object.keys(data);
    var values = Object.values(data);

    if (branchSalesChart) branchSalesChart.destroy();

    branchSalesChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "عدد القطع المباعة",
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
            }, ],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, position: "top" },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            return c.parsed.y + " قطعة";
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(v) {
                            return v;
                        },
                    },
                },
            },
        },
    });
}

function createTopProductsChart(data) {
    var ctx = document.getElementById("topProductsChart");
    if (!ctx) return;

    var sorted = Object.entries(data)
        .sort(function(a, b) {
            return b[1] - a[1];
        })
        .slice(0, 5);
    var labels = sorted.map(function(item) {
        return item[0];
    });
    var values = sorted.map(function(item) {
        return item[1];
    });

    if (topProductsChart) topProductsChart.destroy();

    topProductsChart = new Chart(ctx, {
        type: "pie",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    "rgba(231,76,60,0.8)",
                    "rgba(52,152,219,0.8)",
                    "rgba(39,174,96,0.8)",
                    "rgba(243,156,18,0.8)",
                    "rgba(155,89,182,0.8)",
                ],
                borderColor: [
                    "rgba(231,76,60,1)",
                    "rgba(52,152,219,1)",
                    "rgba(39,174,96,1)",
                    "rgba(243,156,18,1)",
                    "rgba(155,89,182,1)",
                ],
                borderWidth: 2,
            }, ],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, position: "bottom" },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            return c.label + ": " + c.parsed + " قطعة";
                        },
                    },
                },
            },
        },
    });
}
// =============================================
// دوال الفلاتر للوحة القيادة
// =============================================

let dashboardFilters = {
    dateFrom: "",
    dateTo: "",
    branchId: "",
    productId: "",
};

// تحميل الفروع والمنتجات للفلاتر
async function loadDashboardFilters() {
    try {
        // تحميل الفروع
        const branchesResult = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (!branchesResult.error) {
            var branchSelect = document.getElementById("filterBranch");
            if (branchSelect) {
                branchSelect.innerHTML = '<option value="">جميع الفروع</option>';
                branchesResult.data.forEach(function(branch) {
                    branchSelect.innerHTML +=
                        '<option value="' + branch.id + '">' + branch.name + "</option>";
                });
            }
        }

        // تحميل المنتجات
        const productsResult = await supabaseClient
            .from("products")
            .select("*")
            .order("name");
        if (!productsResult.error) {
            var productSelect = document.getElementById("filterProduct");
            if (productSelect) {
                productSelect.innerHTML = '<option value="">جميع المنتجات</option>';
                productsResult.data.forEach(function(product) {
                    productSelect.innerHTML +=
                        '<option value="' + product.id + '">' + product.name + "</option>";
                });
            }
        }
    } catch (error) {
        console.error("Error loading filters:", error);
    }
}

// تطبيق الفلاتر
function applyDashboardFilters() {
    var dateFrom = document.getElementById("filterDateFrom");
    var dateTo = document.getElementById("filterDateTo");
    var branchId = document.getElementById("filterBranch");
    var productId = document.getElementById("filterProduct");

    dashboardFilters.dateFrom = dateFrom ? dateFrom.value : "";
    dashboardFilters.dateTo = dateTo ? dateTo.value : "";
    dashboardFilters.branchId = branchId ? branchId.value : "";
    dashboardFilters.productId = productId ? productId.value : "";

    // إعادة تحميل البيانات مع الفلاتر
    loadStatsWithFilters();
    updateChartsWithFilters();
    loadTopBranchesWithFilters();
}

// إعادة تعيين الفلاتر
function resetDashboardFilters() {
    var dateFrom = document.getElementById("filterDateFrom");
    var dateTo = document.getElementById("filterDateTo");
    var branchId = document.getElementById("filterBranch");
    var productId = document.getElementById("filterProduct");

    if (dateFrom) dateFrom.value = "";
    if (dateTo) dateTo.value = "";
    if (branchId) branchId.value = "";
    if (productId) productId.value = "";

    dashboardFilters = {
        dateFrom: "",
        dateTo: "",
        branchId: "",
        productId: "",
    };

    loadStats();
    updateCharts();
    loadTopBranches();
}

// =============================================
// تحميل الإحصائيات مع الفلاتر
// =============================================

async function loadStatsWithFilters() {
    try {
        // عدد الفروع (دائماً نفس الرقم)
        const branchesResult = await supabaseClient
            .from("branches")
            .select("*", { count: "exact", head: true });
        document.getElementById("totalBranches").textContent =
            branchesResult.count || 0;

        // عدد المنتجات (دائماً نفس الرقم)
        const productsResult = await supabaseClient
            .from("products")
            .select("*", { count: "exact", head: true });
        document.getElementById("totalProducts").textContent =
            productsResult.count || 0;

        // بناء استعلام المبيعات مع الفلاتر
        let salesQuery = supabaseClient
            .from("daily_sales")
            .select("quantity, is_closed");

        if (dashboardFilters.dateFrom) {
            salesQuery = salesQuery.gte("sale_date", dashboardFilters.dateFrom);
        }
        if (dashboardFilters.dateTo) {
            salesQuery = salesQuery.lte("sale_date", dashboardFilters.dateTo);
        }
        if (dashboardFilters.branchId) {
            salesQuery = salesQuery.eq("branch_id", dashboardFilters.branchId);
        }
        if (dashboardFilters.productId) {
            salesQuery = salesQuery.eq("product_id", dashboardFilters.productId);
        }

        const salesResult = await salesQuery;
        let totalSales = 0;
        if (!salesResult.error && salesResult.data) {
            totalSales = salesResult.data.reduce(function(sum, item) {
                return sum + (item.is_closed ? item.quantity : 0);
            }, 0);
        }
        document.getElementById("totalSales").textContent = totalSales;

        // بناء استعلام مخزون الفروع مع الفلاتر (الفرع فقط)
        let stockQuery = supabaseClient.from("branch_stock").select("quantity");
        if (dashboardFilters.branchId) {
            stockQuery = stockQuery.eq("branch_id", dashboardFilters.branchId);
        }
        const stockResult = await stockQuery;
        let totalItems = 0;
        if (!stockResult.error && stockResult.data) {
            totalItems = stockResult.data.reduce(function(sum, item) {
                return sum + (item.quantity || 0);
            }, 0);
        }
        document.getElementById("totalItems").textContent = totalItems;
    } catch (error) {
        console.error("Error loading stats with filters:", error);
    }
}

// =============================================
// تحديث الرسوم البيانية مع الفلاتر
// =============================================

async function updateChartsWithFilters() {
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

        if (dashboardFilters.dateFrom) {
            query = query.gte("sale_date", dashboardFilters.dateFrom);
        }
        if (dashboardFilters.dateTo) {
            query = query.lte("sale_date", dashboardFilters.dateTo);
        }
        if (dashboardFilters.branchId) {
            query = query.eq("branch_id", dashboardFilters.branchId);
        }
        if (dashboardFilters.productId) {
            query = query.eq("product_id", dashboardFilters.productId);
        }

        const result = await query;
        if (result.error || !result.data) return;

        var data = result.data;
        var branchSales = {};
        var productSales = {};

        for (var i = 0; i < data.length; i++) {
            var sale = data[i];
            var branchName =
                sale.branches && sale.branches.name ? sale.branches.name : "غير معروف";
            var productName =
                sale.products && sale.products.name ? sale.products.name : "غير معروف";

            branchSales[branchName] = (branchSales[branchName] || 0) + sale.quantity;
            productSales[productName] =
                (productSales[productName] || 0) + sale.quantity;
        }

        createBranchSalesChart(branchSales);
        createTopProductsChart(productSales);
    } catch (error) {
        console.error("Error updating charts with filters:", error);
    }
}

// =============================================
// تحميل أفضل الفروع مع الفلاتر
// =============================================

async function loadTopBranchesWithFilters() {
    try {
        const branchesResult = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (branchesResult.error) throw branchesResult.error;
        var branches = branchesResult.data;

        let salesQuery = supabaseClient
            .from("daily_sales")
            .select(
                `
                *,
                branches(name)
            `,
            )
            .eq("is_closed", true);

        if (dashboardFilters.dateFrom) {
            salesQuery = salesQuery.gte("sale_date", dashboardFilters.dateFrom);
        }
        if (dashboardFilters.dateTo) {
            salesQuery = salesQuery.lte("sale_date", dashboardFilters.dateTo);
        }
        if (dashboardFilters.branchId) {
            salesQuery = salesQuery.eq("branch_id", dashboardFilters.branchId);
        }

        const salesResult = await salesQuery;
        if (salesResult.error) throw salesResult.error;
        var sales = salesResult.data;

        let stockQuery = supabaseClient.from("branch_stock").select(`
            *,
            branches(name)
        `);
        if (dashboardFilters.branchId) {
            stockQuery = stockQuery.eq("branch_id", dashboardFilters.branchId);
        }
        const stockResult = await stockQuery;
        if (stockResult.error) throw stockResult.error;
        var stock = stockResult.data;

        var tbody = document.getElementById("topBranchesBody");
        var countBadge = document.getElementById("topBranchesCount");

        if (!branches || branches.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" class="text-center text-muted py-3">لا توجد فروع</td></tr>';
            if (countBadge) countBadge.textContent = "0";
            return;
        }

        var branchStats = [];
        for (var i = 0; i < branches.length; i++) {
            var branch = branches[i];

            var branchSales = sales.filter(function(s) {
                return s.branch_id === branch.id;
            });
            var totalSales = branchSales.length;
            var totalItems = branchSales.reduce(function(sum, s) {
                return sum + s.quantity;
            }, 0);

            var branchStock = stock.filter(function(s) {
                return s.branch_id === branch.id;
            });
            var totalStock = branchStock.reduce(function(sum, s) {
                return sum + (s.quantity || 0);
            }, 0);

            branchStats.push({
                id: branch.id,
                name: branch.name,
                totalSales: totalSales,
                totalItems: totalItems,
                totalStock: totalStock,
            });
        }

        branchStats.sort(function(a, b) {
            return b.totalSales - a.totalSales;
        });

        var topBranches = branchStats.slice(0, 5);

        if (countBadge) countBadge.textContent = topBranches.length;

        if (topBranches.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" class="text-center text-muted py-3">لا توجد مبيعات</td></tr>';
            return;
        }

        var html = "";
        for (var j = 0; j < topBranches.length; j++) {
            var b = topBranches[j];
            var medal = "";
            if (j === 0) medal = "🥇";
            else if (j === 1) medal = "🥈";
            else if (j === 2) medal = "🥉";
            else medal = j + 1;

            html +=
                "<tr>" +
                "<td>" +
                medal +
                "</td>" +
                "<td><strong>" +
                b.name +
                "</strong></td>" +
                '<td><span class="badge bg-primary">' +
                b.totalSales +
                "</span></td>" +
                "<td>" +
                b.totalItems +
                "</td>" +
                "<td>" +
                b.totalStock +
                "</td>" +
                "</tr>";
        }
        tbody.innerHTML = html;
    } catch (error) {
        console.error("Error loading top branches with filters:", error);
        showError("فشل تحميل أفضل الفروع");
    }
}   }
    tbody.innerHTML = html;
  } catch (error) {
    console.error("Error loading top branches with filters:", error);
    showError("فشل تحميل أفضل الفروع");
  }
}
