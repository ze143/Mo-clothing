// =============================================
// تقارير الإقفال - نسخة بدون فلوس (معدلة)
// =============================================

document.addEventListener("DOMContentLoaded", async function() {
    const user = await checkAuthAndRedirect();
    if (!user || user.profile.role !== "admin") {
        window.location.href = "/pages/login.html";
        return;
    }

    const avatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    avatar.textContent = user.profile.full_name ?
        user.profile.full_name.charAt(0).toUpperCase() :
        "A";
    userName.textContent = user.profile.full_name || "أدمن";

    await loadBranches();
    await loadReports();
});

// تحميل الفروع للفلتر
async function loadBranches() {
    try {
        const { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");

        if (error) throw error;

        const select = document.getElementById("filterBranch");
        select.innerHTML = '<option value="">جميع الفروع</option>';
        data.forEach(function(branch) {
            select.innerHTML +=
                '<option value="' + branch.id + '">' + branch.name + "</option>";
        });
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

// تحميل التقارير
async function loadReports() {
    try {
        const dateFrom = document.getElementById("filterDateFrom").value;
        const dateTo = document.getElementById("filterDateTo").value;
        const branchId = document.getElementById("filterBranch").value;

        var query = supabaseClient
            .from("day_closing")
            .select(
                `
                *,
                branches(name),
                profiles(full_name)
            `,
            )
            .eq("status", "completed")
            .order("closing_date", { ascending: false });

        if (dateFrom) {
            query = query.gte("closing_date", dateFrom);
        }
        if (dateTo) {
            query = query.lte("closing_date", dateTo);
        }
        if (branchId) {
            query = query.eq("branch_id", branchId);
        }

        var result = await query;
        var data = result.data;
        var error = result.error;

        if (error) throw error;

        displayReports(data);
        updateStatistics(data);
    } catch (error) {
        console.error("Error loading reports:", error);
        showError("فشل تحميل التقارير");
    }
}

// عرض التقارير
function displayReports(data) {
    var tbody = document.getElementById("reportsBody");

    if (data.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="text-center text-muted">لا توجد تقارير إقفال</td></tr>';
        return;
    }

    var html = "";
    for (var i = 0; i < data.length; i++) {
        var report = data[i];
        var statusBadge = "";
        var statusText = "";

        if (report.status === "completed") {
            statusBadge = "bg-success";
            statusText = "مكتمل";
        } else if (report.status === "pending") {
            statusBadge = "bg-warning";
            statusText = "معلق";
        } else {
            statusBadge = "bg-danger";
            statusText = "ملغي";
        }

        var branchName =
            report.branches && report.branches.name ?
            report.branches.name :
            "غير معروف";
        var profileName =
            report.profiles && report.profiles.full_name ?
            report.profiles.full_name :
            "غير معروف";

        html +=
            "<tr>" +
            "<td>" +
            (i + 1) +
            "</td>" +
            "<td>" +
            new Date(report.closing_date).toLocaleDateString("ar") +
            "</td>" +
            "<td>" +
            branchName +
            "</td>" +
            "<td>" +
            (report.total_items_sold || 0) +
            "</td>" +
            '<td><span class="badge ' +
            statusBadge +
            '">' +
            statusText +
            "</span></td>" +
            "<td>" +
            profileName +
            "</td>" +
            '<td><button class="btn btn-sm btn-info" onclick="showClosingDetails(\'' +
            report.id +
            "','" +
            report.branch_id +
            "','" +
            report.closing_date +
            '\')"><i class="fas fa-eye"></i> تفاصيل</button></td>' +
            "</tr>";
    }

    tbody.innerHTML = html;
}

// تحديث الإحصائيات
function updateStatistics(data) {
    if (data.length === 0) {
        document.getElementById("totalItems").textContent = "0";
        document.getElementById("totalDays").textContent = "0";
        document.getElementById("totalBranches").textContent = "0";
        return;
    }

    var totalItems = 0;
    var uniqueBranches = {};

    for (var i = 0; i < data.length; i++) {
        totalItems = totalItems + (data[i].total_items_sold || 0);
        uniqueBranches[data[i].branch_id] = true;
    }

    var branchCount = Object.keys(uniqueBranches).length;

    document.getElementById("totalItems").textContent = totalItems;
    document.getElementById("totalDays").textContent = data.length;
    document.getElementById("totalBranches").textContent = branchCount;
}

// تصدير التقرير
function exportReport() {
    var table = document.getElementById("reportsTable");
    var csv = [];

    var headers = ["التاريخ", "الفرع", "عدد القطع", "الحالة", "المسؤول"];
    csv.push(headers.join(","));

    var rows = document.querySelectorAll("#reportsBody tr");
    for (var i = 0; i < rows.length; i++) {
        var cols = rows[i].querySelectorAll("td");
        if (cols.length > 1) {
            var rowData = [];
            for (var j = 1; j < cols.length; j++) {
                rowData.push(cols[j].textContent.trim());
            }
            csv.push(rowData.join(","));
        }
    }

    var blob = new Blob(["\uFEFF" + csv.join("\n")], {
        type: "text/csv;charset=utf-8;",
    });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
        "تقارير_الإقفال_" + new Date().toISOString().split("T")[0] + ".csv";
    link.click();
}

// =============================================
// عرض تفاصيل الإقفال
// =============================================

async function showClosingDetails(closingId, branchId, closingDate) {
    try {
        var result = await supabaseClient
            .from("daily_sales")
            .select(
                `
                *,
                products(name)
            `,
            )
            .eq("branch_id", branchId)
            .eq("sale_date", closingDate)
            .eq("is_closed", true);

        var data = result.data;
        var error = result.error;

        if (error) throw error;

        var branchResult = await supabaseClient
            .from("branches")
            .select("name")
            .eq("id", branchId)
            .single();

        var branchData = branchResult.data;
        var branchName = (branchData && branchData.name) || "غير معروف";
        var formattedDate = new Date(closingDate).toLocaleDateString("ar");

        var detailsHtml =
            '<div class="mb-3"><h5>' +
            branchName +
            " - " +
            formattedDate +
            "</h5><hr></div>";

        if (data.length === 0) {
            detailsHtml +=
                '<div class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2 d-block"></i>لا توجد مبيعات في هذا اليوم</div>';
        } else {
            var totalItems = 0;
            var itemsHtml = "";

            for (var i = 0; i < data.length; i++) {
                var item = data[i];
                totalItems += item.quantity;
                var productName =
                    item.products && item.products.name ?
                    item.products.name :
                    "غير معروف";
                itemsHtml +=
                    "<tr><td>" +
                    (i + 1) +
                    "</td><td>" +
                    productName +
                    '</td><td><span class="badge bg-primary">' +
                    item.quantity +
                    "</span></td></tr>";
            }

            detailsHtml +=
                '<div class="table-responsive"><table class="table table-sm table-hover"><thead class="table-light"><tr><th>#</th><th>المنتج</th><th>الكمية</th></tr></thead><tbody>' +
                itemsHtml +
                '</tbody><tfoot class="table-light"><tr><td colspan="2" class="fw-bold">إجمالي القطع</td><td class="fw-bold">' +
                totalItems +
                "</td></tr></tfoot></table></div>";
        }

        var modalHtml =
            '<div class="modal fade" id="closingDetailsModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered" style="max-width: 700px; width: 90%;"><div class="modal-content" style="height: 550px; max-height: 80vh;"><div class="modal-header"><h5 class="modal-title"><i class="fas fa-file-alt me-2"></i>تفاصيل الإقفال</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" style="overflow-y: auto; max-height: calc(550px - 120px);">' +
            detailsHtml +
            '</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إغلاق</button></div></div></div></div>';
        var oldModal = document.getElementById("closingDetailsModal");
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML("beforeend", modalHtml);

        var modal = new bootstrap.Modal(
            document.getElementById("closingDetailsModal"),
        );
        modal.show();
    } catch (error) {
        console.error("Error loading closing details:", error);
        showError("فشل تحميل تفاصيل الإقفال");
    }
}

// جعل الدوال متاحة
window.showClosingDetails = showClosingDetails;
window.loadReports = loadReports;
window.exportReport = exportReport;