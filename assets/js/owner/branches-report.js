// =============================================
// تقرير الفروع - Owner
// =============================================

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

        await loadBranchesReport();
        await loadTotalProducts();
    } catch (error) {
        console.error("Error initializing:", error);
    }
});

// =============================================
// تحميل تقرير الفروع
// =============================================

async function loadBranchesReport() {
    try {
        // جلب الفروع
        const branchesResult = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (branchesResult.error) throw branchesResult.error;
        const branches = branchesResult.data;

        // جلب المخزون
        const stockResult = await supabaseClient.from("branch_stock").select(`
            *,
            branches(name),
            products(name)
        `);
        if (stockResult.error) throw stockResult.error;
        const stock = stockResult.data;

        // إحصائيات
        let totalItems = 0;
        let totalProducts = 0;
        let emptyBranches = 0;

        const container = document.getElementById("branchesContainer");

        if (!branches || branches.length === 0) {
            container.innerHTML =
                '<div class="text-center text-muted py-4">لا توجد فروع</div>';
            return;
        }

        let html = "";
        for (var i = 0; i < branches.length; i++) {
            var branch = branches[i];
            var branchStock = stock.filter(function(s) {
                return s.branch_id === branch.id;
            });
            var branchTotal = branchStock.reduce(function(sum, s) {
                return sum + (s.quantity || 0);
            }, 0);

            totalItems += branchTotal;
            totalProducts += branchStock.length;
            if (branchTotal === 0) emptyBranches++;

            var itemsHtml = "";
            if (branchStock.length === 0) {
                itemsHtml =
                    '<tr><td colspan="3" class="text-center text-muted">لا توجد منتجات</td></tr>';
            } else {
                for (var j = 0; j < branchStock.length; j++) {
                    var item = branchStock[j];
                    var productName =
                        item.products && item.products.name ?
                        item.products.name :
                        "غير معروف";
                    itemsHtml +=
                        "<tr><td>" +
                        (j + 1) +
                        "</td><td>" +
                        productName +
                        '</td><td><span class="badge bg-primary">' +
                        item.quantity +
                        "</span></td></tr>";
                }
            }

            html += `
                <div class="branch-card">
                    <div class="branch-header" onclick="toggleBranch(this)">
                        <span><strong>${i + 1}. ${branch.name}</strong> <span class="badge bg-primary">${branchTotal} قطعة</span></span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="branch-body">
                        <div class="table-responsive">
                            <table class="table table-sm table-hover mb-0">
                                <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th></tr></thead>
                                <tbody>${itemsHtml}</tbody>
                                <tfoot><tr><td colspan="2" class="fw-bold">الإجمالي</td><td class="fw-bold">${branchTotal}</td></tr></tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // تحديث الإحصائيات
        document.getElementById("totalBranches").textContent = branches.length;
        document.getElementById("totalItems").textContent = totalItems;
        document.getElementById("totalProducts").textContent = totalProducts;
        document.getElementById("emptyBranches").textContent = emptyBranches;
    } catch (error) {
        console.error("Error loading branches report:", error);
        showError("فشل تحميل تقرير الفروع");
    }
}

// =============================================
// فتح/غلق الفرع
// =============================================

function toggleBranch(header) {
    var body = header.nextElementSibling;
    var icon = header.querySelector(".fa-chevron-down, .fa-chevron-up");

    if (body.classList.contains("open")) {
        body.classList.remove("open");
        if (icon) {
            icon.classList.remove("fa-chevron-up");
            icon.classList.add("fa-chevron-down");
        }
    } else {
        body.classList.add("open");
        if (icon) {
            icon.classList.remove("fa-chevron-down");
            icon.classList.add("fa-chevron-up");
        }
    }
}

// =============================================
// تحميل إجمالي المنتجات في جميع الفروع
// =============================================

async function loadTotalProducts() {
    try {
        // جلب جميع مخزون الفروع مع أسماء المنتجات
        const result = await supabaseClient.from("branch_stock").select(`
                quantity,
                products(name)
            `);

        if (result.error) throw result.error;

        var data = result.data;

        // تجميع الكميات حسب المنتج
        var productTotals = {};

        for (var i = 0; i < data.length; i++) {
            var item = data[i];
            var productName =
                item.products && item.products.name ? item.products.name : "غير معروف";
            var quantity = item.quantity || 0;

            if (productTotals[productName]) {
                productTotals[productName] += quantity;
            } else {
                productTotals[productName] = quantity;
            }
        }

        // ترتيب حسب الاسم
        var sortedProducts = Object.keys(productTotals).sort();

        var tbody = document.getElementById("totalProductsBody");

        if (sortedProducts.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="3" class="text-center text-muted py-3">لا توجد منتجات في الفروع</td></tr>';
            return;
        }

        var html = "";
        var grandTotal = 0;

        for (var j = 0; j < sortedProducts.length; j++) {
            var productName = sortedProducts[j];
            var total = productTotals[productName];
            grandTotal += total;

            html +=
                "<tr>" +
                "<td>" +
                (j + 1) +
                "</td>" +
                "<td><strong>" +
                productName +
                "</strong></td>" +
                '<td><span class="badge bg-primary">' +
                total +
                "</span></td>" +
                "</tr>";
        }

        // إضافة صف الإجمالي
        html +=
            '<tfoot class="table-light">' +
            '<tr class="fw-bold">' +
            '<td colspan="2">الإجمالي الكلي</td>' +
            '<td><span class="badge bg-success">' +
            grandTotal +
            "</span></td>" +
            "</tr>" +
            "</tfoot>";

        tbody.innerHTML = html;
    } catch (error) {
        console.error("Error loading total products:", error);
        showError("فشل تحميل إجمالي المنتجات");
    }
}

// =============================================
// جعل الدوال متاحة
// =============================================

window.toggleBranch = toggleBranch;