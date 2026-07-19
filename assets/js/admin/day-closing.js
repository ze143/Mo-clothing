let currentBranchId = null;
let isClosing = false; // ✅ منع التكرار

// التاريخ بالتوقيت المحلي
function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let todayDate = getLocalDate();

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

// ============================================================
// ✅ إقفال اليوم (مع خصم المخزون) - مُعدل لمنع التكرار
// ============================================================

async function closeDayWithStatus(status = "completed") {
  // ✅ منع التكرار (لو في إقفال جاري)
  if (isClosing) {
    alert("⚠️ جاري معالجة إقفال سابق، انتظر قليلاً");
    return;
  }

  // 1️⃣ اتأكد من اختيار الفرع
  currentBranchId = document.getElementById("closeBranch").value;

  if (!currentBranchId) {
    alert("⚠️ يرجى اختيار فرع أولاً");
    return;
  }

  // ✅ التحقق من عدم وجود إقفال مسبق لنفس اليوم
  const { data: existingClosing, error: checkError } = await supabaseClient
    .from("day_closing")
    .select("id")
    .eq("branch_id", currentBranchId)
    .eq("closing_date", todayDate)
    .maybeSingle();

  if (checkError) {
    console.error("❌ خطأ في التحقق من الإقفال:", checkError);
  }

  if (existingClosing) {
    alert(`⚠️ تم إقفال هذا الفرع مسبقاً بتاريخ ${todayDate}`);
    return;
  }

  if (!confirm(`✅ هل أنت متأكد من إقفال اليوم للفرع المحدد؟`)) {
    return;
  }

  // ✅ قفل الإقفال (منع التكرار)
  isClosing = true;

  // ✅ تعطيل الزر
  var btn = document.querySelector('#closingForm button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ جاري الإقفال...";
  }

  try {
    // 2️⃣ جلب المبيعات غير المقفلة
    const { data: salesData, error: salesError } = await supabaseClient
      .from("daily_sales")
      .select(`*, products(price)`)
      .eq("branch_id", currentBranchId)
      .eq("sale_date", todayDate)
      .eq("is_closed", false);

    if (salesError) throw salesError;

    console.log(
      "📋 عدد المبيعات غير المقفلة:",
      salesData ? salesData.length : 0,
    );

    // 3️⃣ لو مفيش مبيعات
    if (!salesData || salesData.length === 0) {
      alert("ℹ️ لا توجد مبيعات غير مقفلة لإقفالها");
      isClosing = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = "إقفال اليوم";
      }
      return;
    }

    // 4️⃣ حساب الإجماليات
    let totalItems = 0;
    salesData.forEach((sale) => {
      totalItems += sale.quantity;
    });

    console.log("📊 إجمالي القطع:", totalItems);

    // ============================================================
    // 5️⃣ ✅ خصم المخزون (باستخدام RPC لتجاوز الـ Trigger)
    // ============================================================
    const { data: deductResult, error: deductError } = await supabaseClient.rpc(
      "deduct_stock_from_closing",
      {
        p_branch_id: currentBranchId,
        p_date: todayDate,
      },
    );

    if (deductError) {
      console.error("❌ خطأ في خصم المخزون:", deductError);

      // ✅ لو فشل RPC، حاول الطريقة المباشرة (مع تعطيل Trigger مؤقتاً)
      console.log("🔄 محاولة الطريقة المباشرة...");

      for (var i = 0; i < salesData.length; i++) {
        var sale = salesData[i];

        var stockResult = await supabaseClient
          .from("branch_stock")
          .select("quantity")
          .eq("branch_id", currentBranchId)
          .eq("product_id", sale.product_id)
          .maybeSingle();

        if (stockResult.error) {
          console.error("❌ خطأ في جلب المخزون:", stockResult.error);
          continue;
        }

        var currentQty = stockResult.data ? stockResult.data.quantity : 0;
        var newQty = Math.max(0, currentQty - sale.quantity);

        var updateResult = await supabaseClient
          .from("branch_stock")
          .update({
            quantity: newQty,
            updated_at: new Date().toISOString(),
          })
          .eq("branch_id", currentBranchId)
          .eq("product_id", sale.product_id);

        if (updateResult.error) {
          console.error("❌ خطأ في تحديث المخزون:", updateResult.error);
        } else {
          console.log(
            `   ✅ تم خصم ${sale.quantity} قطعة من ${sale.product_id}`,
          );
        }
      }
    } else {
      console.log("✅ تم خصم المخزون باستخدام RPC");
      console.table(deductResult);
    }

    // 6️⃣ تحديث المبيعات
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

    // 7️⃣ حفظ تقرير الإقفال
    const { data: userData } = await supabaseClient.auth.getUser();
    var userId = (userData && userData.user && userData.user.id) || null;

    await supabaseClient.from("day_closing").insert({
      branch_id: currentBranchId,
      closing_date: todayDate,
      total_items_sold: totalItems,
      closed_by: userId,
      status: status,
      notes: "إقفال يومي - " + status,
    });

    // 8️⃣ تحديث الصفحة
    localStorage.setItem("stockUpdated", Date.now());
    showSuccess(`✅ تم إقفال اليوم وخصم ${totalItems} قطعة بنجاح`);
    await loadBranchClosingData();

    console.log("✅ تم إقفال اليوم بنجاح");
  } catch (error) {
    console.error("❌ Error closing day:", error);
    alert("❌ فشل إقفال اليوم: " + error.message);
  } finally {
    // ✅ فتح القفل
    isClosing = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "إقفال اليوم";
    }
  }
}

// جعل الدوال متاحة
window.loadBranchClosingData = loadBranchClosingData;
window.closeDayWithStatus = closeDayWithStatus;
