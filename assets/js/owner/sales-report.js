// =============================================
// تقارير المبيعات - Owner
// =============================================

let allSalesData = [];
let currentFilters = {
    dateFrom: "",
    dateTo: "",
    branchId: "",
    productId: "",
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

        // تحميل الفلاتر
        await loadBranches();
        await loadProducts();

        // تحميل المبيعات
        await loadSales();
    } catch (error) {
        console.error("Error initializing:", error);
    }
});

// =============================================
// تحميل الفروع للفلتر
// =============================================

async function loadBranches() {
    try {
        const result = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (result.error) throw result.error;

        var select = document.getElementById("filterBranch");
        select.innerHTML = '<option value="">جميع الفروع</option>';
        result.data.forEach(function(branch) {
            select.innerHTML +=
                '<option value="' + branch.id + '">' + branch.name + "</option>";
        });
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

// =============================================
// تحميل المنتجات للفلتر
// =============================================

async function loadProducts() {
    try {
        const result = await supabaseClient
            .from("products")
            .select("*")
            .order("name");
        if (result.error) throw result.error;

        var select = document.getElementById("filterProduct");
        select.innerHTML = '<option value="">جميع المنتجات</option>';
        result.data.forEach(function(product) {
            select.innerHTML +=
                '<option value="' + product.id + '">' + product.name + "</option>";
        });
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

// =============================================
// تحميل المبيعات
// =============================================

async function loadSales() {
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

        var result = await query;
        if (result.error) throw result.error;

        allSalesData = result.data || [];
        displaySales(allSalesData);
        updateStats(allSalesData);
    } catch (error) {
        console.error("Error loading sales:", error);
        showError("فشل تحميل المبيعات");
    }
}

// =============================================
// عرض المبيعات
// =============================================

function displaySales(data) {
    var tbody = document.getElementById("salesBody");
    var countBadge = document.getElementById("salesCount");

    if (!data || data.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="5" class="text-center text-muted py-3">لا توجد مبيعات</td></tr>';
        if (countBadge) countBadge.textContent = "0";
        return;
    }

    if (countBadge) countBadge.textContent = data.length;

    var html = "";
    for (var i = 0; i < data.length; i++) {
        var sale = data[i];
        var date = new Date(sale.sale_date).toLocaleDateString("ar");
        var branchName =
            sale.branches && sale.branches.name ? sale.branches.name : "غير معروف";
        var productName =
            sale.products && sale.products.name ? sale.products.name : "غير معروف";

        html +=
            "<tr>" +
            "<td>" +
            (i + 1) +
            "</td>" +
            "<td>" +
            date +
            "</td>" +
            "<td>" +
            branchName +
            "</td>" +
            "<td>" +
            productName +
            "</td>" +
            '<td><span class="badge bg-primary">' +
            sale.quantity +
            "</span></td>" +
            "</tr>";
    }
    tbody.innerHTML = html;
}

// =============================================
// تحديث الإحصائيات
// =============================================

function updateStats(data) {
    var totalSales = data.length;
    var totalItems = data.reduce(function(sum, item) {
        return sum + item.quantity;
    }, 0);

    var branches = {};
    var products = {};
    data.forEach(function(item) {
        branches[item.branch_id] = true;
        products[item.product_id] = true;
    });

    document.getElementById("totalSalesCount").textContent = totalSales;
    document.getElementById("totalItemsCount").textContent = totalItems;
    document.getElementById("totalBranchesCount").textContent =
        Object.keys(branches).length;
    document.getElementById("totalProductsCount").textContent =
        Object.keys(products).length;
}

// =============================================
// تطبيق الفلاتر
// =============================================

function applyFilters() {
    var dateFrom = document.getElementById("filterDateFrom");
    var dateTo = document.getElementById("filterDateTo");
    var branchId = document.getElementById("filterBranch");
    var productId = document.getElementById("filterProduct");

    currentFilters.dateFrom = dateFrom ? dateFrom.value : "";
    currentFilters.dateTo = dateTo ? dateTo.value : "";
    currentFilters.branchId = branchId ? branchId.value : "";
    currentFilters.productId = productId ? productId.value : "";

    loadSales();
}

// =============================================
// إعادة تعيين الفلاتر
// =============================================

function resetFilters() {
    var dateFrom = document.getElementById("filterDateFrom");
    var dateTo = document.getElementById("filterDateTo");
    var branchId = document.getElementById("filterBranch");
    var productId = document.getElementById("filterProduct");

    if (dateFrom) dateFrom.value = "";
    if (dateTo) dateTo.value = "";
    if (branchId) branchId.value = "";
    if (productId) productId.value = "";

    currentFilters = {
        dateFrom: "",
        dateTo: "",
        branchId: "",
        productId: "",
    };

    loadSales();
}

// =============================================
// تصدير المبيعات
// =============================================

function exportSales() {
    var data = allSalesData;
    if (!data || data.length === 0) {
        alert("لا توجد بيانات للتصدير");
        return;
    }

    var csv = ["#,التاريخ,الفرع,المنتج,الكمية"];
    for (var i = 0; i < data.length; i++) {
        var sale = data[i];
        var date = new Date(sale.sale_date).toLocaleDateString("ar");
        var branchName =
            sale.branches && sale.branches.name ? sale.branches.name : "غير معروف";
        var productName =
            sale.products && sale.products.name ? sale.products.name : "غير معروف";
        csv.push(
            i +
            1 +
            "," +
            date +
            "," +
            branchName +
            "," +
            productName +
            "," +
            sale.quantity,
        );
    }

    var blob = new Blob(["\uFEFF" + csv.join("\n")], {
        type: "text/csv;charset=utf-8;",
    });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
        "تقارير_المبيعات_" + new Date().toISOString().split("T")[0] + ".csv";
    link.click();
}

// =============================================
// جعل الدوال متاحة
// =============================================

window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.exportSales = exportSales;