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

        document.getElementById("userAvatar").textContent = user.profile.full_name ?
            user.profile.full_name.charAt(0).toUpperCase() :
            "O";
        document.getElementById("userName").textContent =
            user.profile.full_name || "مالك";

        await loadStats();
        await loadTopBranches(); // <-- الدالة الجديدة

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