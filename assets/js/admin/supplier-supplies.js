// =============================================
// توريد للمخزن - نسخة بدون موردين
// =============================================

let supplyModal = null;

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

  supplyModal = new bootstrap.Modal(document.getElementById("supplyModal"));

  await loadProducts();
  await loadSupplies();
});

// تحميل المنتجات
async function loadProducts() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("supplyProduct");
    select.innerHTML = '<option value="">اختر المنتج</option>';
    data.forEach((product) => {
      select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading products:", error);
    showError("فشل تحميل المنتجات");
  }
}

// تحميل سجل التوريدات
// تحميل سجل التوريدات
async function loadSupplies() {
  try {
    const { data, error } = await supabaseClient
      .from("supplier_supplies")
      .select(
        `
                *,
                products(name)
            `,
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const tbody = document.getElementById("suppliesBody");
    if (data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">لا توجد توريدات</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map(
        (supply, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${supply.products?.name || "غير معروف"}</td>
                <td>${supply.quantity}</td>
                <td>${supply.notes || "-"}</td>
                <td>${new Date(supply.supply_date).toLocaleDateString("ar")}</td>
            </tr>
        `,
      )
      .join("");
  } catch (error) {
    console.error("Error loading supplies:", error);
    showError("فشل تحميل التوريدات");
  }
}

// حفظ توريد جديد
async function saveSupply() {
  const productId = document.getElementById("supplyProduct").value;
  const quantity = parseInt(document.getElementById("supplyQuantity").value);
  const notes = document.getElementById("supplyNotes").value.trim();

  if (!productId || !quantity || quantity < 1) {
    alert("يرجى اختيار المنتج وإدخال كمية صحيحة");
    return;
  }

  try {
    // 1. تسجيل التوريد
    const { data, error } = await supabaseClient
      .from("supplier_supplies")
      .insert({
        product_id: productId,
        quantity: quantity,
        notes: notes || "توريد مباشر للمخزن",
      })
      .select()
      .single();

    if (error) throw error;

    // 2. تحديث مخزون المستودع
    const { data: warehouseData, error: warehouseError } = await supabaseClient
      .from("warehouse_stock")
      .select("quantity")
      .eq("product_id", productId)
      .single();

    if (warehouseError && warehouseError.code !== "PGRST116") {
      throw warehouseError;
    }

    if (warehouseData) {
      await supabaseClient
        .from("warehouse_stock")
        .update({ quantity: (warehouseData?.quantity || 0) + quantity })
        .eq("product_id", productId);
    } else {
      await supabaseClient.from("warehouse_stock").insert({
        product_id: productId,
        quantity: quantity,
      });
    }

    showSuccess("✅ تم إضافة التوريد بنجاح");
    document.getElementById("supplyForm").reset();
    await loadSupplies();
    supplyModal.hide();
  } catch (error) {
    console.error("Error saving supply:", error);
    alert("فشل تسجيل التوريد: " + error.message);
  }
}

// جعل الدوال متاحة
window.saveSupply = saveSupply;
window.loadSupplies = loadSupplies;
