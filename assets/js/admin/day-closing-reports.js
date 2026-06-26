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
    data.forEach((branch) => {
      select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
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

    let query = supabaseClient
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

    const { data, error } = await query;

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
  const tbody = document.getElementById("reportsBody");

  if (data.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center text-muted">لا توجد تقارير إقفال</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (report, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${new Date(report.closing_date).toLocaleDateString("ar")}</td>
            <td>${report.branches?.name || "غير معروف"}</td>
            <td>${formatCurrency(report.total_sales)}</td>
            <td>${report.total_items_sold}</td>
            <td>
                <span class="badge ${report.status === "completed" ? "bg-success" : report.status === "pending" ? "bg-warning" : "bg-danger"}">
                    ${report.status === "completed" ? "مكتمل" : report.status === "pending" ? "معلق" : "ملغي"}
                </span>
            </td>
            <td>${report.profiles?.full_name || "غير معروف"}</td>
        </tr>
    `,
    )
    .join("");
}

// تحديث الإحصائيات
function updateStatistics(data) {
  if (data.length === 0) {
    document.getElementById("totalRevenue").textContent = "0 ج.م";
    document.getElementById("totalItems").textContent = "0";
    document.getElementById("totalDays").textContent = "0";
    document.getElementById("totalBranches").textContent = "0";
    return;
  }

  const totalRevenue = data.reduce((sum, r) => sum + (r.total_sales || 0), 0);
  const totalItems = data.reduce(
    (sum, r) => sum + (r.total_items_sold || 0),
    0,
  );
  const uniqueBranches = new Set(data.map((r) => r.branch_id)).size;

  document.getElementById("totalRevenue").textContent =
    formatCurrency(totalRevenue);
  document.getElementById("totalItems").textContent = totalItems;
  document.getElementById("totalDays").textContent = data.length;
  document.getElementById("totalBranches").textContent = uniqueBranches;
}

// تصدير التقرير
function exportReport() {
  const table = document.getElementById("reportsTable");
  let csv = [];

  // رأس CSV
  const headers = [
    "التاريخ",
    "الفرع",
    "إجمالي المبيعات",
    "عدد القطع",
    "الحالة",
    "المسؤول",
  ];
  csv.push(headers.join(","));

  // البيانات
  const rows = document.querySelectorAll("#reportsBody tr");
  rows.forEach((row) => {
    const cols = row.querySelectorAll("td");
    if (cols.length > 1) {
      const rowData = [];
      for (let i = 1; i < cols.length; i++) {
        rowData.push(cols[i].textContent.trim());
      }
      csv.push(rowData.join(","));
    }
  });

  // تحميل الملف
  const blob = new Blob(["\uFEFF" + csv.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `تقارير_الإقفال_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
}

// جعل الدوال متاحة
window.loadReports = loadReports;
window.exportReport = exportReport;
