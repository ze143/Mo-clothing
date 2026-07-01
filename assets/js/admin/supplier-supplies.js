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
        '<tr><td colspan="6" class="text-center text-muted">لا توجد توريدات</td></tr>';
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
                        <td>
                            <button class="btn btn-sm btn-warning me-1" onclick="editSupply('${supply.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteSupply('${supply.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
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
        notes: notes || "توريد للمخزن",
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

    const currentQuantity = warehouseData?.quantity || 0;
    const newQuantity = currentQuantity + quantity;

    if (warehouseData) {
      await supabaseClient
        .from("warehouse_stock")
        .update({ quantity: newQuantity })
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

// =============================================
// تعديل وحذف التوريدات
// =============================================

async function editSupply(id) {
  try {
    const { data: supply, error } = await supabaseClient
      .from("supplier_supplies")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // إعادة تحميل المنتجات قبل عرض المودال
    await loadEditProducts();

    document.getElementById("editSupplyId").value = supply.id;
    document.getElementById("editProduct").value = supply.product_id;
    document.getElementById("editQuantity").value = supply.quantity;
    document.getElementById("editNotes").value = supply.notes || "";

    const editModal = new bootstrap.Modal(
      document.getElementById("editSupplyModal"),
    );
    editModal.show();
  } catch (error) {
    console.error("Error loading supply:", error);
    alert("فشل تحميل بيانات التوريد");
  }
}
// حفظ التعديل
async function updateSupply() {
  const id = document.getElementById("editSupplyId").value;
  const productId = document.getElementById("editProduct").value;
  const quantity = parseInt(document.getElementById("editQuantity").value);
  const notes = document.getElementById("editNotes").value.trim();

  if (!productId || !quantity || quantity < 1) {
    alert("يرجى اختيار المنتج وإدخال كمية صحيحة");
    return;
  }

  try {
    // جلب الكمية القديمة
    const { data: oldSupply, error: oldError } = await supabaseClient
      .from("supplier_supplies")
      .select("quantity, product_id")
      .eq("id", id)
      .single();

    if (oldError) throw oldError;

    // 1. تحديث التوريد
    const { error: updateError } = await supabaseClient
      .from("supplier_supplies")
      .update({
        product_id: productId,
        quantity: quantity,
        notes: notes,
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // 2. تحديث مخزون المستودع
    // إذا تغير المنتج، نحتاج نعدل المخزون
    if (oldSupply.product_id !== productId) {
      // شيل من المنتج القديم
      const { data: oldStock, error: oldStockError } = await supabaseClient
        .from("warehouse_stock")
        .select("quantity")
        .eq("product_id", oldSupply.product_id)
        .single();

      if (!oldStockError && oldStock) {
        await supabaseClient
          .from("warehouse_stock")
          .update({ quantity: (oldStock.quantity || 0) - oldSupply.quantity })
          .eq("product_id", oldSupply.product_id);
      }

      // ضيف للمنتج الجديد
      const { data: newStock, error: newStockError } = await supabaseClient
        .from("warehouse_stock")
        .select("quantity")
        .eq("product_id", productId)
        .single();

      if (newStockError && newStockError.code !== "PGRST116") {
        throw newStockError;
      }

      if (newStock) {
        await supabaseClient
          .from("warehouse_stock")
          .update({ quantity: (newStock.quantity || 0) + quantity })
          .eq("product_id", productId);
      } else {
        await supabaseClient.from("warehouse_stock").insert({
          product_id: productId,
          quantity: quantity,
        });
      }
    } else {
      // نفس المنتج - نعدل الكمية
      const { data: stockData, error: stockError } = await supabaseClient
        .from("warehouse_stock")
        .select("quantity")
        .eq("product_id", productId)
        .single();

      if (!stockError && stockData) {
        const diff = quantity - oldSupply.quantity;
        await supabaseClient
          .from("warehouse_stock")
          .update({ quantity: (stockData.quantity || 0) + diff })
          .eq("product_id", productId);
      }
    }

    showSuccess("✅ تم تحديث التوريد بنجاح");

    // إغلاق المودال
    const editModal = bootstrap.Modal.getInstance(
      document.getElementById("editSupplyModal"),
    );
    if (editModal) editModal.hide();

    // إعادة تحميل البيانات
    await loadSupplies();
  } catch (error) {
    console.error("Error updating supply:", error);
    alert("فشل تحديث التوريد: " + error.message);
  }
}

// حذف توريد
async function deleteSupply(id) {
  if (!confirm("هل أنت متأكد من حذف هذا التوريد؟")) return;

  try {
    // جلب بيانات التوريد قبل الحذف
    const { data: supply, error: fetchError } = await supabaseClient
      .from("supplier_supplies")
      .select("product_id, quantity")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    // حذف التوريد
    const { error: deleteError } = await supabaseClient
      .from("supplier_supplies")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // تحديث مخزون المستودع (شيل الكمية)
    const { data: stockData, error: stockError } = await supabaseClient
      .from("warehouse_stock")
      .select("quantity")
      .eq("product_id", supply.product_id)
      .single();

    if (!stockError && stockData) {
      await supabaseClient
        .from("warehouse_stock")
        .update({
          quantity: Math.max(0, (stockData.quantity || 0) - supply.quantity),
        })
        .eq("product_id", supply.product_id);
    }

    showSuccess("✅ تم حذف التوريد بنجاح");
    await loadSupplies();
  } catch (error) {
    console.error("Error deleting supply:", error);
    alert("فشل حذف التوريد: " + error.message);
  }
}

// تعبئة قائمة المنتجات في مودال التعديل
async function loadEditProducts() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("editProduct");
    if (select) {
      select.innerHTML = '<option value="">اختر المنتج</option>';
      data.forEach((product) => {
        select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
      });
    }
  } catch (error) {
    console.error("Error loading products for edit:", error);
  }
}

// جعل الدوال متاحة
window.editSupply = editSupply;
window.updateSupply = updateSupply;
window.deleteSupply = deleteSupply;

// جعل الدوال متاحة
window.saveSupply = saveSupply;
window.loadSupplies = loadSupplies;
