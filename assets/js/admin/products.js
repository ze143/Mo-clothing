let productModal = null;

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

  productModal = new bootstrap.Modal(document.getElementById("productModal"));
  await loadProducts();
});

async function loadProducts() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select(
        `
                *,
                warehouse_stock(quantity)
            `,
      )
      .order("name");

    if (error) throw error;

    const tbody = document.getElementById("productsBody");
    if (data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">لا توجد منتجات</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map(
        (product, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${product.name}</strong></td>
                <td>${product.description || "-"}</td>
                <td>${formatCurrency(product.price)}</td>
                <td><span class="badge bg-success">${product.warehouse_stock?.[0]?.quantity || 0}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning me-1" onclick="editProduct('${product.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("");
  } catch (error) {
    console.error("Error loading products:", error);
    showError("فشل تحميل المنتجات");
  }
}

async function saveProduct() {
  const id = document.getElementById("productId").value;
  const name = document.getElementById("productName").value.trim();
  const description = document
    .getElementById("productDescription")
    .value.trim();
  const price = parseFloat(document.getElementById("productPrice").value);

  if (!name || !price || price < 0) {
    alert("يرجى إدخال اسم المنتج وسعر صحيح");
    return;
  }

  try {
    if (id) {
      // تحديث منتج
      const { error } = await supabaseClient
        .from("products")
        .update({ name, description, price })
        .eq("id", id);

      if (error) throw error;
      showSuccess("تم تحديث المنتج بنجاح");
    } else {
      // إضافة منتج جديد
      const { data, error } = await supabaseClient
        .from("products")
        .insert({ name, description, price })
        .select()
        .single();

      if (error) throw error;

      // إضافة المنتج إلى مخزون المستودع
      await supabaseClient
        .from("warehouse_stock")
        .insert({ product_id: data.id, quantity: 0 });

      showSuccess("تم إضافة المنتج بنجاح");
    }

    await loadProducts();
    productModal.hide();
    resetProductForm();
  } catch (error) {
    console.error("Error saving product:", error);
    alert("فشل حفظ المنتج: " + error.message);
  }
}

// =============================================
// دوال محسنة للمنتجات مع الباركود
// =============================================

// حفظ المنتج مع الباركود
async function saveProductWithBarcode() {
  const id = document.getElementById("productId").value;
  const name = document.getElementById("productName").value.trim();
  const description = document
    .getElementById("productDescription")
    .value.trim();
  const price = parseFloat(document.getElementById("productPrice").value);
  const barcode =
    document.getElementById("productBarcode")?.value.trim() ||
    generateBarcode();

  if (!name || !price || price < 0) {
    alert("يرجى إدخال اسم المنتج وسعر صحيح");
    return;
  }

  try {
    if (id) {
      const { error } = await supabaseClient
        .from("products")
        .update({ name, description, price, barcode })
        .eq("id", id);

      if (error) throw error;
      showSuccess("تم تحديث المنتج بنجاح");
    } else {
      const { data, error } = await supabaseClient
        .from("products")
        .insert({ name, description, price, barcode })
        .select()
        .single();

      if (error) throw error;

      await supabaseClient
        .from("warehouse_stock")
        .insert({ product_id: data.id, quantity: 0 });

      showSuccess("تم إضافة المنتج بنجاح");
    }

    await loadProducts();
    productModal.hide();
    resetProductForm();
  } catch (error) {
    console.error("Error saving product:", error);
    alert("فشل حفظ المنتج: " + error.message);
  }
}

// توليد باركود عشوائي
function generateBarcode() {
  return "BAR" + Date.now().toString().slice(-10);
}

// استبدال دالة saveProduct القديمة
window.saveProduct = saveProductWithBarcode;

// تحديث نموذج المنتج لإضافة الباركود
function editProductWithBarcode(id) {
  document.getElementById("productModalTitle").textContent = "تعديل المنتج";

  supabaseClient
    .from("products")
    .select("*")
    .eq("id", id)
    .single()
    .then(({ data, error }) => {
      if (error) throw error;

      document.getElementById("productId").value = data.id;
      document.getElementById("productName").value = data.name;
      document.getElementById("productDescription").value =
        data.description || "";
      document.getElementById("productPrice").value = data.price;
      document.getElementById("productBarcode").value = data.barcode || "";

      productModal.show();
    })
    .catch((error) => {
      console.error("Error loading product:", error);
      alert("فشل تحميل بيانات المنتج");
    });
}

// استبدال دالة editProduct القديمة
window.editProduct = editProductWithBarcode;

function editProduct(id) {
  document.getElementById("productModalTitle").textContent = "تعديل المنتج";

  supabaseClient
    .from("products")
    .select("*")
    .eq("id", id)
    .single()
    .then(({ data, error }) => {
      if (error) throw error;

      document.getElementById("productId").value = data.id;
      document.getElementById("productName").value = data.name;
      document.getElementById("productDescription").value =
        data.description || "";
      document.getElementById("productPrice").value = data.price;

      productModal.show();
    })
    .catch((error) => {
      console.error("Error loading product:", error);
      alert("فشل تحميل بيانات المنتج");
    });
}

async function deleteProduct(id) {
  if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;

  try {
    const { error } = await supabaseClient
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;

    showSuccess("تم حذف المنتج بنجاح");
    await loadProducts();
  } catch (error) {
    console.error("Error deleting product:", error);
    alert("فشل حذف المنتج: " + error.message);
  }
}

function resetProductForm() {
  document.getElementById("productId").value = "";
  document.getElementById("productName").value = "";
  document.getElementById("productDescription").value = "";
  document.getElementById("productPrice").value = "";
  document.getElementById("productModalTitle").textContent = "إضافة منتج جديد";
}

window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.saveProduct = saveProduct;
