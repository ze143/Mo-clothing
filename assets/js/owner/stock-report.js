// =============================================
// تقرير المخزون - Owner
// =============================================

let allStockData = [];
let currentStockFilters = {
    search: "",
    status: "",
};

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

        await loadStock();

        // ===== الفلاتر تطبق أول بأول =====
        document
            .getElementById("searchProduct")
            .addEventListener("input", function() {
                currentStockFilters.search = this.value.trim().toLowerCase();
                applyStockFilters();
            });

        document
            .getElementById("filterStatus")
            .addEventListener("change", function() {
                currentStockFilters.status = this.value;
                applyStockFilters();
            });
    } catch (error) {
        console.error("Error initializing:", error);
    }
});

// =============================================
// تحميل المخزون
// =============================================

async function loadStock() {
    try {
        var result = await supabaseClient
            .from("warehouse_stock")
            .select(
                `
                *,
                products(name)
            `,
            )
            .order("products(name)");

        if (result.error) throw result.error;

        allStockData = result.data || [];
        applyStockFilters();
    } catch (error) {
        console.error("Error loading stock:", error);
        showError("فشل تحميل المخزون");
    }
}

// =============================================
// تطبيق الفلاتر
// =============================================

function applyStockFilters() {
    var filteredData = allStockData;

    // فلتر البحث
    if (currentStockFilters.search) {
        filteredData = filteredData.filter(function(item) {
            var productName =
                item.products && item.products.name ?
                item.products.name.toLowerCase() :
                "";
            return productName.indexOf(currentStockFilters.search) !== -1;
        });
    }

    // فلتر الحالة
    if (currentStockFilters.status) {
        filteredData = filteredData.filter(function(item) {
            var qty = item.quantity || 0;
            if (currentStockFilters.status === "available") return qty > 10;
            if (currentStockFilters.status === "low") return qty > 0 && qty <= 10;
            if (currentStockFilters.status === "empty") return qty === 0;
            return true;
        });
    }

    displayStock(filteredData);
    updateStockStats(filteredData);
}

// =============================================
// عرض المخزون
// =============================================

function displayStock(data) {
    var tbody = document.getElementById("stockBody");
    var countBadge = document.getElementById("stockCount");

    if (!data || data.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="4" class="text-center text-muted py-3">لا توجد منتجات في المخزن</td></tr>';
        if (countBadge) countBadge.textContent = "0";
        return;
    }

    if (countBadge) countBadge.textContent = data.length;

    var html = "";
    for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var qty = item.quantity || 0;
        var productName =
            item.products && item.products.name ? item.products.name : "غير معروف";

        var statusBadge = "";
        var statusText = "";
        if (qty === 0) {
            statusBadge = "bg-danger";
            statusText = "نفذ 🔴";
        } else if (qty <= 10) {
            statusBadge = "bg-warning";
            statusText = "منخفض 🟡";
        } else {
            statusBadge = "bg-success";
            statusText = "متوفر 🟢";
        }

        html +=
            "<tr>" +
            "<td>" +
            (i + 1) +
            "</td>" +
            "<td>" +
            productName +
            "</td>" +
            '<td><span class="badge bg-primary">' +
            qty +
            "</span></td>" +
            '<td><span class="badge ' +
            statusBadge +
            '">' +
            statusText +
            "</span></td>" +
            "</tr>";
    }
    tbody.innerHTML = html;
}

// =============================================
// تحديث الإحصائيات
// =============================================

function updateStockStats(data) {
    var totalProducts = data.length;
    var totalItems = data.reduce(function(sum, item) {
        return sum + (item.quantity || 0);
    }, 0);
    var lowStock = data.filter(function(item) {
        var qty = item.quantity || 0;
        return qty > 0 && qty <= 10;
    }).length;
    var emptyStock = data.filter(function(item) {
        return (item.quantity || 0) === 0;
    }).length;

    document.getElementById("totalProducts").textContent = totalProducts;
    document.getElementById("totalItems").textContent = totalItems;
    document.getElementById("lowStock").textContent = lowStock;
    document.getElementById("emptyStock").textContent = emptyStock;
}

// =============================================
// إعادة تعيين الفلاتر
// =============================================

function resetStockFilters() {
    document.getElementById("searchProduct").value = "";
    document.getElementById("filterStatus").value = "";
    currentStockFilters.search = "";
    currentStockFilters.status = "";
    applyStockFilters();
}

// =============================================
// جعل الدوال متاحة
// =============================================

window.resetStockFilters = resetStockFilters;