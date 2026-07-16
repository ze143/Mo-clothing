let isSubmitting = false;
// ============================================================
// 📦 جلب الكمية المتاحة في الفرع
// ============================================================

async function getAvailableStock(productId) {
  try {
    var { data, error } = await supabaseClient
      .from("branch_stock")
      .select("quantity")
      .eq("branch_id", currentBranchId)
      .eq("product_id", productId)
      .maybeSingle();

    if (error) throw error;
    return (data && data.quantity) || 0;
  } catch (error) {
    console.error("❌ خطأ في جلب الكمية المتاحة:", error);
    return 0;
  }
}
// =============================================
// لوحة الفرع - نسخة نهائية
// =============================================

let currentBranchId = null;
let currentBranchName = "";
let todaySales = [];
// التاريخ بالتوقيت المحلي
function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let todayDate = getLocalDate();

// تهيئة الصفحة
document.addEventListener("DOMContentLoaded", async function () {
  const user = await checkAuthAndRedirect();
  if (!user) return;

  if (user.profile.role !== "branch_user") {
    alert("غير مصرح لك بالوصول إلى هذه الصفحة");
    window.location.href = "/pages/login.html";
    return;
  }

  currentBranchId = user.profile.branch_id;

  const avatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const branchName = document.getElementById("branchName");

  avatar.textContent = user.profile.full_name
    ? user.profile.full_name.charAt(0).toUpperCase()
    : "B";
  userName.textContent = user.profile.full_name || "موظف فرع";

  await loadBranchInfo();
  await loadProducts();
  await loadTodaySales();
  await updateStatistics();

  document
    .getElementById("dailySalesForm")
    .addEventListener("submit", handleAddSale);
});

// تحميل معلومات الفرع
async function loadBranchInfo() {
  try {
    const { data, error } = await supabaseClient
      .from("branches")
      .select("name")
      .eq("id", currentBranchId)
      .single();

    if (error) throw error;

    currentBranchName = data.name;
    document.getElementById("branchName").textContent = data.name;
  } catch (error) {
    console.error("Error loading branch info:", error);
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

    const select = document.getElementById("salesProduct");
    select.innerHTML = '<option value="">اختر المنتج</option>';
    data.forEach((product) => {
      select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading products:", error);
    showError("فشل تحميل المنتجات");
  }
}

// تحميل مبيعات اليوم
async function loadTodaySales() {
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

    todaySales = data || [];
    displayTodaySales();
  } catch (error) {
    console.error("Error loading today sales:", error);
    showError("فشل تحميل مبيعات اليوم");
  }
}

// عرض مبيعات اليوم
function displayTodaySales() {
  const tbody = document.getElementById("todaySalesBody");
  const totalElement = document.getElementById("todayTotal");

  if (todaySales.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="text-center text-muted">لا توجد مبيعات اليوم</td></tr>';
    totalElement.textContent = "0";
    return;
  }

  let total = 0;
  tbody.innerHTML = todaySales
    .map((sale) => {
      total += sale.quantity;
      return `
            <tr>
                <td>${sale.products.name}</td>
                <td>${sale.quantity}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteSale('${sale.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    })
    .join("");

  totalElement.textContent = total;
}

// إضافة مبيعات (من غير خصم المخزون)
async function handleAddSale(e) {
  e.preventDefault();
  e.stopPropagation();

  // ✅ منع الدبل كليك
  if (isSubmitting) {
    showSalesMessage("⚠️ يتم معالجة الطلب، انتظر قليلاً", "warning");
    return;
  }

  const productId = document.getElementById("salesProduct").value;
  const quantity = parseInt(document.getElementById("salesQuantity").value);

  if (!productId || !quantity || quantity < 1) {
    showSalesMessage("يرجى اختيار المنتج وإدخال كمية صحيحة", "danger");
    return;
  }

  var available = await getAvailableStock(productId);

  if (available === 0) {
    showSalesMessage("❌ هذا المنتج غير متوفر في الفرع حالياً", "danger");
    return;
  }

  if (quantity > available) {
    showSalesMessage(
      "❌ الكمية المطلوبة (" +
        quantity +
        ") أكبر من المتاحة (" +
        available +
        ")",
      "danger",
    );
    return;
  }

  // ✅ قفل الزر
  isSubmitting = true;
  var btn = document.querySelector('#dailySalesForm button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ جاري الحفظ...";
  }

  try {
    // ✅ إضافة المبيعات مع إقفال فوري
    const { data, error } = await supabaseClient
      .from("daily_sales")
      .insert({
        branch_id: currentBranchId,
        product_id: productId,
        quantity: quantity,
        sale_date: todayDate,
        is_closed: true, // ✅ تقفل فوراً
        closed_at: new Date().toISOString(),
      })
      .select();

    if (error) throw error;

    // ✅ خصم المخزون
    var newQty = available - quantity;
    await supabaseClient
      .from("branch_stock")
      .update({
        quantity: newQty,
        updated_at: new Date().toISOString(),
      })
      .eq("branch_id", currentBranchId)
      .eq("product_id", productId);

    await loadTodaySales();
    await updateStatistics();
    document.getElementById("dailySalesForm").reset();

    showSalesMessage("✅ تم إضافة المبيعات وتقفيلها بنجاح", "success");
  } catch (error) {
    console.error("Error adding sale:", error);
    showSalesMessage("❌ فشل إضافة المبيعات: " + error.message, "danger");
  } finally {
    // ✅ فتح الزر
    isSubmitting = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "إضافة مبيعات";
    }
  }
}

// حذف مبيعات (من غير إرجاع المخزون)
async function deleteSale(saleId) {
  if (!confirm("هل أنت متأكد من حذف هذه المبيعات؟")) return;

  try {
    // جلب بيانات المبيعات قبل الحذف
    const { data: saleData, error: fetchError } = await supabaseClient
      .from("daily_sales")
      .select("product_id, quantity")
      .eq("id", saleId)
      .single();

    if (fetchError) throw fetchError;

    // حذف المبيعات
    const { error: deleteError } = await supabaseClient
      .from("daily_sales")
      .delete()
      .eq("id", saleId);

    if (deleteError) throw deleteError;

    // ✅ إرجاع الكمية للمخزون
    if (saleData) {
      var available = await getAvailableStock(saleData.product_id);
      var newQty = available + saleData.quantity;

      await supabaseClient
        .from("branch_stock")
        .update({
          quantity: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq("branch_id", currentBranchId)
        .eq("product_id", saleData.product_id);
    }

    await loadTodaySales();
    await updateStatistics();

    showSalesMessage("✅ تم حذف المبيعات وإرجاع الكمية للمخزون", "success");
  } catch (error) {
    console.error("Error deleting sale:", error);
    showSalesMessage("❌ فشل حذف المبيعات", "danger");
  }
}

// تحديث الإحصائيات
async function updateStatistics() {
  try {
    const todayTotal = todaySales.reduce((sum, sale) => sum + sale.quantity, 0);
    document.getElementById("branchTodaySales").textContent = todayTotal;
  } catch (error) {
    console.error("Error updating statistics:", error);
  }
}

// عرض رسائل النموذج
function showSalesMessage(message, type) {
  const element = document.getElementById("salesFormMessage");
  element.textContent = message;
  element.className = `alert alert-${type}`;
  element.classList.remove("d-none");

  setTimeout(() => {
    element.classList.add("d-none");
  }, 5000);
}

// الاستماع لتحديث المخزون من الأدمن
window.addEventListener("storage", function (e) {
  if (e.key === "stockUpdated") {
    console.log("🔄 تم تحديث المخزون من الأدمن");
    updateStatistics();
  }
});

// جعل deleteSale متاحاً في النطاق العام
window.deleteSale = deleteSale;
window.getAvailableStock = getAvailableStock;
