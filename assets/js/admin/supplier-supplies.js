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

  await loadSuppliers();
  await loadProducts();
  await loadSupplies();

  // حساب الإجمالي تلقائياً
  document
    .getElementById("supplyQuantity")
    .addEventListener("input", calculateTotal);
  document
    .getElementById("supplyPrice")
    .addEventListener("input", calculateTotal);
});

function calculateTotal() {
  const quantity =
    parseInt(document.getElementById("supplyQuantity").value) || 0;
  const price = parseFloat(document.getElementById("supplyPrice").value) || 0;
  const total = quantity * price;
  document.getElementById("supplyTotal").textContent = total.toFixed(2);
}

async function loadSuppliers() {
  try {
    const { data, error } = await supabaseClient
      .from("suppliers")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("supplySupplier");
    select.innerHTML = '<option value="">اختر المورد</option>';
    data.forEach((supplier) => {
      select.innerHTML += `<option value="${supplier.id}">${supplier.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading suppliers:", error);
    showError("فشل تحميل الموردين");
  }
}

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

async function loadSupplies() {
  try {
    const { data, error } = await supabaseClient
      .from("supplier_supplies")
      .select(
        `
                *,
                suppliers(name),
                products(name)
            `,
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const tbody = document.getElementById("suppliesBody");
    if (data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted">لا توجد توريدات</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map(
        (supply, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${supply.suppliers?.name || "غير معروف"}</td>
                <td>${supply.products?.name || "غير معروف"}</td>
                <td>${supply.quantity}</td>
                <td>${formatCurrency(supply.price)}</td>
                <td><strong>${formatCurrency(supply.total)}</strong></td>
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

async function saveSupply() {
  const supplierId = document.getElementById("supplySupplier").value;
  const productId = document.getElementById("supplyProduct").value;
  const quantity = parseInt(document.getElementById("supplyQuantity").value);
  const price = parseFloat(document.getElementById("supplyPrice").value);
  const invoiceNumber = document.getElementById("supplyInvoice").value.trim();
  const notes = document.getElementById("supplyNotes").value.trim();

  if (!supplierId || !productId || !quantity || !price) {
    alert("يرجى ملء جميع الحقول المطلوبة");
    return;
  }

  const total = quantity * price;

  try {
    // تسجيل التوريد
    const { data, error } = await supabaseClient
      .from("supplier_supplies")
      .insert({
        supplier_id: supplierId,
        product_id: productId,
        quantity: quantity,
        price: price,
        total: total,
        invoice_number: invoiceNumber,
        notes: notes,
      })
      .select()
      .single();

    if (error) throw error;

    // تحديث مخزون المستودع
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

    showSuccess("تم تسجيل التوريد بنجاح");
    await loadSupplies();
    supplyModal.hide();
    document.getElementById("supplyForm").reset();
    document.getElementById("supplyTotal").textContent = "0";
  } catch (error) {
    console.error("Error saving supply:", error);
    alert("فشل تسجيل التوريد: " + error.message);
  }
}

window.saveSupply = saveSupply;
