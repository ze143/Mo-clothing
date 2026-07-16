let currentBranchId = null;

// التاريخ بالتوقيت المحلي
function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let todayDate = getLocalDate();

// =============================================
// دالة خصم المخزون الموحدة (مرة واحدة فقط)
// =============================================

async function deductStock(branchId, salesData) {
  if (!salesData || salesData.length === 0) return;

  console.log("🔄 بدء خصم المخزون...");

  for (var i = 0; i < salesData.length; i++) {
    var sale = salesData[i];

    // جلب المخزون الحالي
    var stockResult = await supabaseClient
      .from("branch_stock")
      .select("quantity")
      .eq("branch_id", branchId)
      .eq("product_id", sale.product_id)
      .single();

    if (stockResult.error && stockResult.error.code !== "PGRST116") {
      console.error("Error fetching stock:", stockResult.error);
      continue;
    }

    var currentQty = stockResult.data ? stockResult.data.quantity : 0;
    var newQty = Math.max(0, currentQty - sale.quantity);

    // تحديث المخزون
    var updateResult = await supabaseClient
      .from("branch_stock")
      .update({
        quantity: newQty,
        updated_at: new Date().toISOString(),
      })
      .eq("branch_id", branchId)
      .eq("product_id", sale.product_id);

    if (updateResult.error) {
      console.error("Error updating stock:", updateResult.error);
    } else {
      console.log("✅ خصم:", sale.product_id, sale.quantity, "قطعة");
    }
  }
}

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
});

async function loadBranches() {
  try {
    const { data, error } = await supabaseClient
      .from("branches")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("closeBranch");
    select.innerHTML = '<option value="">اختر فرعاً</option>';
    data.forEach((branch) => {
      select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading branches:", error);
    showError("فشل تحميل الفروع");
  }
}

async function loadBranchClosingData() {
  // ✅ خد الـ ID من الـ select
  currentBranchId = document.getElementById("closeBranch").value;

  if (!currentBranchId) {
    document.getElementById("closingData").style.display = "none";
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("daily_sales")
      .select(
        `
                *,
                products(name, price)
            `,
      )
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate)
      .eq("is_closed", false);

    if (error) throw error;

    document.getElementById("closingData").style.display = "block";

    if (data.length === 0) {
      document.getElementById("closingItems").textContent = "0";
      document.getElementById("closingProducts").innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">لا توجد مبيعات</td></tr>';
      return;
    }

    let totalItems = 0;
    let productsHtml = "";

    data.forEach((sale) => {
      totalItems += sale.quantity;

      productsHtml += `
                <tr>
                    <td>${sale.products.name}</td>
                    <td>${sale.quantity}</td>
                </tr>
            `;
    });

    document.getElementById("closingItems").textContent = totalItems;
    document.getElementById("closingProducts").innerHTML = productsHtml;
  } catch (error) {
    console.error("Error loading closing data:", error);
    showError("فشل تحميل بيانات الإقفال");
  }
}

// =============================================
// دوال إقفال اليوم
// =============================================
async function closeDayWithStatus(status = "completed") {
  // ✅ 1. خد الـ ID من الـ select
  currentBranchId = document.getElementById("closeBranch").value;

  if (!currentBranchId) {
    alert("⚠️ يرجى اختيار فرع أولاً");
    return;
  }

  console.log("🔍 Branch ID:", currentBranchId);
  console.log("🔍 Today:", todayDate);

  if (!confirm(`✅ هل أنت متأكد من إقفال اليوم للفرع المحدد؟`)) {
    return;
  }

  try {
    // ✅ 2. جلب المبيعات غير المقفلة
    const { data: salesData, error: salesError } = await supabaseClient
      .from("daily_sales")
      .select(`*, products(price)`)
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate)
      .eq("is_closed", false);

    if (salesError) throw salesError;

    console.log("📋 عدد المبيعات:", salesData ? salesData.length : 0);

    // ✅ 3. لو مفيش مبيعات
    if (!salesData || salesData.length === 0) {
      alert("ℹ️ لا توجد مبيعات غير مقفلة لإقفالها");
      return;
    }

    // ✅ 4. خصم المخزون
    for (var i = 0; i < salesData.length; i++) {
      var sale = salesData[i];

      var stockResult = await supabaseClient
        .from("branch_stock")
        .select("quantity")
        .eq("branch_id", currentBranchId)
        .eq("product_id", sale.product_id)
        .single();

      if (stockResult.error && stockResult.error.code !== "PGRST116") {
        console.error("Error fetching stock:", stockResult.error);
        continue;
      }

      var currentQty = stockResult.data ? stockResult.data.quantity : 0;
      var newQty = Math.max(0, currentQty - sale.quantity);

      await supabaseClient
        .from("branch_stock")
        .update({
          quantity: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq("branch_id", currentBranchId)
        .eq("product_id", sale.product_id);

      console.log(`✅ خصم: ${sale.product_id} (${sale.quantity} قطعة)`);
    }

    // ✅ 5. تحديث المبيعات
    const { error: updateError } = await supabaseClient
      .from("daily_sales")
      .update({
        is_closed: true,
        closed_at: new Date().toISOString(),
      })
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate)
      .eq("is_closed", false);

    if (updateError) throw updateError;

    // ✅ 6. حفظ تقرير الإقفال
    const { data: userData } = await supabaseClient.auth.getUser();
    var userId = (userData && userData.user && userData.user.id) || null;

    await supabaseClient.from("day_closing").insert({
      branch_id: currentBranchId,
      closing_date: todayDate,
      total_items_sold: salesData.reduce(function (sum, sale) {
        return sum + sale.quantity;
      }, 0),
      closed_by: userId,
      status: status,
      notes: "إقفال يومي - " + status,
    });

    // ✅ 7. تحديث الصفحة
    localStorage.setItem("stockUpdated", Date.now());
    showSuccess(`✅ تم إقفال اليوم وخصم المخزون بنجاح`);
    await loadBranchClosingData();
  } catch (error) {
    console.error("❌ Error closing day:", error);
    alert("❌ فشل إقفال اليوم: " + error.message);
  }
}

async function closeDayAndRefresh() {
  // ✅ خد الـ ID من الـ select
  currentBranchId = document.getElementById("closeBranch").value;

  if (!currentBranchId) {
    alert("⚠️ يرجى اختيار فرع أولاً");
    return;
  }

  // ✅ اتأكد إن فيه مبيعات
  const { data: salesData } = await supabaseClient
    .from("daily_sales")
    .select("id")
    .eq("branch_id", currentBranchId)
    .eq("sale_date", todayDate)
    .eq("is_closed", false);

  if (!salesData || salesData.length === 0) {
    alert("ℹ️ لا توجد مبيعات غير مقفلة لإقفالها");
    return;
  }

  // ✅ استخدم closeDayWithStatus مباشرة
  await closeDayWithStatus("completed");

  localStorage.setItem("stockUpdated", Date.now());
  location.reload();
}

// جعل الدوال متاحة
window.loadBranchClosingData = loadBranchClosingData;
