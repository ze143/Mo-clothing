// =============================================
// سجل سجل التوريدات - نسخة مبسطة
// =============================================

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
  await loadProducts();
  await loadTransfers();
});

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

async function loadProducts() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("filterProduct");
    select.innerHTML = '<option value="">جميع المنتجات</option>';
    data.forEach((product) => {
      select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

async function loadTransfers() {
  try {
    const dateFrom = document.getElementById("filterDateFrom").value;
    const dateTo = document.getElementById("filterDateTo").value;
    const branchId = document.getElementById("filterBranch").value;
    const productId = document.getElementById("filterProduct").value;

    // استخدام View بدلاً من الجدول مباشرة
    let query = supabaseClient.from("branch_transfers_view").select("*");

    if (dateFrom) {
      query = query.gte("transfer_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("transfer_date", dateTo);
    }
    if (branchId) {
      query = query.eq("to_branch_id", branchId);
    }
    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;

    if (error) throw error;

    displayTransfers(data);
    updateStatistics(data);
  } catch (error) {
    console.error("Error loading transfers:", error);
    showError("فشل تحميل التوريدات");
  }
}

function displayTransfers(data) {
  const tbody = document.getElementById("transfersBody");

  if (data.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center text-muted">لا توجد توريدات</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map((transfer, index) => {
      // تحديد نوع العملية بالعربي
      const typeNames = {
        supply: "توريد",
        transfer: "تحويل",
        return: "مرتجع",
      };
      const typeColors = {
        supply: "primary",
        transfer: "success",
        return: "warning",
      };

      const typeName =
        typeNames[transfer.transfer_type] || transfer.transfer_type;
      const typeColor = typeColors[transfer.transfer_type] || "secondary";

      return `
            <tr>
                <td>${index + 1}</td>
                <td>${new Date(transfer.transfer_date).toLocaleDateString("ar")}</td>
                <td><span class="badge bg-${typeColor}">${typeName}</span></td>
                <td>${transfer.from_branch_name || "المخزن"}</td>
                <td>${transfer.to_branch_name || "المخزن"}</td>
                <td>${transfer.product_name || "غير معروف"}</td>
                <td><span class="badge bg-primary">${transfer.quantity}</span></td>
                <td>${transfer.notes || "-"}</td>
            </tr>
        `;
    })
    .join("");
}

function updateStatistics(data) {
  if (data.length === 0) {
    document.getElementById("totalTransfers").textContent = "0";
    document.getElementById("totalItems").textContent = "0";
    document.getElementById("totalBranches").textContent = "0";
    document.getElementById("totalDays").textContent = "0";
    return;
  }

  const totalItems = data.reduce((sum, t) => sum + (t.quantity || 0), 0);
  const uniqueBranches = new Set(data.map((t) => t.to_branch_id)).size;
  const uniqueDays = new Set(data.map((t) => t.transfer_date)).size;

  document.getElementById("totalTransfers").textContent = data.length;
  document.getElementById("totalItems").textContent = totalItems;
  document.getElementById("totalBranches").textContent = uniqueBranches;
  document.getElementById("totalDays").textContent = uniqueDays;
}

function resetFilters() {
  document.getElementById("filterDateFrom").value = "";
  document.getElementById("filterDateTo").value = "";
  document.getElementById("filterBranch").value = "";
  document.getElementById("filterProduct").value = "";
  loadTransfers();
}

function exportTransfers() {
  const table = document.getElementById("transfersTable");
  let csv = [];

  const headers = [
    "التاريخ",
    "النوع",
    "من",
    "إلى",
    "المنتج",
    "الكمية",
    "الملاحظات",
  ];
  csv.push(headers.join(","));

  const rows = document.querySelectorAll("#transfersBody tr");
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

  const blob = new Blob(["\uFEFF" + csv.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `توريدات_الفروع_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
}

// =============================================
// دوال التحويلات والمرتجعات
// =============================================

let supplyModal = null;
let transferModal = null;
let returnModal = null;

// عرض مودال التوريد
function showSupplyModal() {
  window.location.href = "warehouse.html";
}

// عرض مودال التحويل
function showTransferModal() {
  // إنشاء مودال ديناميكي
  const modalHtml = `
        <div class="modal fade" id="transferModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-exchange-alt me-2"></i>تحويل بين الفروع</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="transferMessage" class="alert d-none"></div>
                        <form id="transferForm">
                            <div class="mb-3">
                                <label class="form-label">من فرع *</label>
                                <select class="form-select" id="transferFromBranch" required>
                                    <option value="">اختر الفرع المصدر</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">إلى فرع *</label>
                                <select class="form-select" id="transferToBranch" required>
                                    <option value="">اختر الفرع الوجهة</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">المنتج *</label>
                                <select class="form-select" id="transferProduct" required>
                                    <option value="">اختر المنتج</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الكمية المتاحة</label>
                                <input type="text" class="form-control" id="transferAvailableStock" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الكمية *</label>
                                <input type="number" class="form-control" id="transferQuantity" min="1" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الملاحظات</label>
                                <textarea class="form-control" id="transferNotes" rows="2" placeholder="سبب التحويل..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-success" onclick="executeTransfer()">
                            <i class="fas fa-exchange-alt me-2"></i>تنفيذ التحويل
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

  // إزالة المودال القديم إن وجد
  const oldModal = document.getElementById("transferModal");
  if (oldModal) oldModal.remove();

  // إضافة المودال الجديد
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // تهيئة المودال
  transferModal = new bootstrap.Modal(document.getElementById("transferModal"));

  // تحميل البيانات
  loadBranchesForTransfer();
  loadProductsForTransfer();

  // أحداث
  document
    .getElementById("transferProduct")
    .addEventListener("change", function () {
      updateAvailableStockForTransfer();
    });
  document
    .getElementById("transferFromBranch")
    .addEventListener("change", function () {
      updateAvailableStockForTransfer();
    });

  transferModal.show();
}

// عرض مودال المرتجع
function showReturnModal() {
  const modalHtml = `
        <div class="modal fade" id="returnModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-undo me-2"></i>مرتجع للمخزن</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="returnMessage" class="alert d-none"></div>
                        <form id="returnForm">
                            <div class="mb-3">
                                <label class="form-label">من فرع *</label>
                                <select class="form-select" id="returnBranch" required>
                                    <option value="">اختر الفرع</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">المنتج *</label>
                                <select class="form-select" id="returnProduct" required>
                                    <option value="">اختر المنتج</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الكمية المتاحة</label>
                                <input type="text" class="form-control" id="returnAvailableStock" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الكمية *</label>
                                <input type="number" class="form-control" id="returnQuantity" min="1" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">سبب المرتجع</label>
                                <textarea class="form-control" id="returnNotes" rows="2" placeholder="سبب الإرجاع..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-warning" onclick="executeReturn()">
                            <i class="fas fa-undo me-2"></i>تنفيذ المرتجع
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

  const oldModal = document.getElementById("returnModal");
  if (oldModal) oldModal.remove();

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  returnModal = new bootstrap.Modal(document.getElementById("returnModal"));

  loadBranchesForReturn();
  loadProductsForReturn();

  document
    .getElementById("returnProduct")
    .addEventListener("change", function () {
      updateAvailableStockForReturn();
    });
  document
    .getElementById("returnBranch")
    .addEventListener("change", function () {
      updateAvailableStockForReturn();
    });

  returnModal.show();
}

// =============================================
// دوال مساعدة للتحويل
// =============================================

async function loadBranchesForTransfer() {
  try {
    const { data, error } = await supabaseClient
      .from("branches")
      .select("*")
      .order("name");

    if (error) throw error;

    const selects = ["transferFromBranch", "transferToBranch"];
    selects.forEach((id) => {
      const select = document.getElementById(id);
      if (select) {
        select.innerHTML = '<option value="">اختر الفرع</option>';
        data.forEach((branch) => {
          select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
        });
      }
    });
  } catch (error) {
    console.error("Error loading branches:", error);
  }
}

async function loadProductsForTransfer() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("transferProduct");
    if (select) {
      select.innerHTML = '<option value="">اختر المنتج</option>';
      data.forEach((product) => {
        select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
      });
    }
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

async function updateAvailableStockForTransfer() {
  const branchId = document.getElementById("transferFromBranch").value;
  const productId = document.getElementById("transferProduct").value;
  const stockElement = document.getElementById("transferAvailableStock");

  if (!branchId || !productId) {
    stockElement.value = "اختر الفرع والمنتج أولاً";
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("branch_stock")
      .select("quantity")
      .eq("branch_id", branchId)
      .eq("product_id", productId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    stockElement.value = `${data?.quantity || 0} قطعة`;
  } catch (error) {
    console.error("Error loading stock:", error);
    stockElement.value = "خطأ في التحميل";
  }
}

async function executeTransfer() {
  const fromBranchId = document.getElementById("transferFromBranch").value;
  const toBranchId = document.getElementById("transferToBranch").value;
  const productId = document.getElementById("transferProduct").value;
  const quantity = parseInt(document.getElementById("transferQuantity").value);
  const notes = document.getElementById("transferNotes").value;
  const msg = document.getElementById("transferMessage");

  if (!fromBranchId || !toBranchId || !productId || !quantity) {
    showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
    return;
  }

  if (fromBranchId === toBranchId) {
    showMessage(msg, "لا يمكن التحويل لنفس الفرع", "danger");
    return;
  }

  try {
    const { data: fromStock, error: fromError } = await supabaseClient
      .from("branch_stock")
      .select("quantity")
      .eq("branch_id", fromBranchId)
      .eq("product_id", productId)
      .single();

    if (fromError && fromError.code !== "PGRST116") throw fromError;

    const available = fromStock?.quantity || 0;
    if (available < quantity) {
      showMessage(
        msg,
        `الكمية المتاحة (${available}) أقل من المطلوب (${quantity})`,
        "danger",
      );
      return;
    }

    // نقص من المصدر
    await supabaseClient
      .from("branch_stock")
      .update({ quantity: available - quantity })
      .eq("branch_id", fromBranchId)
      .eq("product_id", productId);

    // زيادة في الوجهة
    const { data: toStock, error: toError } = await supabaseClient
      .from("branch_stock")
      .select("quantity")
      .eq("branch_id", toBranchId)
      .eq("product_id", productId)
      .single();

    if (toError && toError.code !== "PGRST116") throw toError;

    if (toStock) {
      await supabaseClient
        .from("branch_stock")
        .update({ quantity: (toStock?.quantity || 0) + quantity })
        .eq("branch_id", toBranchId)
        .eq("product_id", productId);
    } else {
      await supabaseClient.from("branch_stock").insert({
        branch_id: toBranchId,
        product_id: productId,
        quantity: quantity,
      });
    }

    // تسجيل في سجل التوريدات
    const { data: userData } = await supabaseClient.auth.getUser();
    await supabaseClient.from("branch_transfers").insert({
      from_branch_id: fromBranchId,
      to_branch_id: toBranchId,
      product_id: productId,
      quantity: quantity,
      transfer_type: "transfer",
      notes: notes || "تحويل بين الفروع",
      created_by: userData.user?.id,
    });

    showMessage(msg, "✅ تم التحويل بنجاح", "success");
    setTimeout(() => {
      transferModal.hide();
      loadTransfers();
    }, 1500);
  } catch (error) {
    console.error("Error:", error);
    showMessage(msg, "❌ فشل التحويل: " + error.message, "danger");
  }
}

// =============================================
// دوال مساعدة للمرتجع
// =============================================

async function loadBranchesForReturn() {
  try {
    const { data, error } = await supabaseClient
      .from("branches")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("returnBranch");
    if (select) {
      select.innerHTML = '<option value="">اختر الفرع</option>';
      data.forEach((branch) => {
        select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
      });
    }
  } catch (error) {
    console.error("Error loading branches:", error);
  }
}

async function loadProductsForReturn() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("returnProduct");
    if (select) {
      select.innerHTML = '<option value="">اختر المنتج</option>';
      data.forEach((product) => {
        select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
      });
    }
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

async function updateAvailableStockForReturn() {
  const branchId = document.getElementById("returnBranch").value;
  const productId = document.getElementById("returnProduct").value;
  const stockElement = document.getElementById("returnAvailableStock");

  if (!branchId || !productId) {
    stockElement.value = "اختر الفرع والمنتج أولاً";
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("branch_stock")
      .select("quantity")
      .eq("branch_id", branchId)
      .eq("product_id", productId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    stockElement.value = `${data?.quantity || 0} قطعة`;
  } catch (error) {
    console.error("Error loading stock:", error);
    stockElement.value = "خطأ في التحميل";
  }
}

async function executeReturn() {
  const branchId = document.getElementById("returnBranch").value;
  const productId = document.getElementById("returnProduct").value;
  const quantity = parseInt(document.getElementById("returnQuantity").value);
  const notes = document.getElementById("returnNotes").value;
  const msg = document.getElementById("returnMessage");

  if (!branchId || !productId || !quantity) {
    showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
    return;
  }

  try {
    const { data: branchStock, error: branchError } = await supabaseClient
      .from("branch_stock")
      .select("quantity")
      .eq("branch_id", branchId)
      .eq("product_id", productId)
      .single();

    if (branchError && branchError.code !== "PGRST116") throw branchError;

    const available = branchStock?.quantity || 0;
    if (available < quantity) {
      showMessage(
        msg,
        `الكمية المتاحة (${available}) أقل من المطلوب (${quantity})`,
        "danger",
      );
      return;
    }

    // نقص من الفرع
    await supabaseClient
      .from("branch_stock")
      .update({ quantity: available - quantity })
      .eq("branch_id", branchId)
      .eq("product_id", productId);

    // زيادة في المخزن
    const { data: warehouseData, error: warehouseError } = await supabaseClient
      .from("warehouse_stock")
      .select("quantity")
      .eq("product_id", productId)
      .single();

    if (warehouseError && warehouseError.code !== "PGRST116")
      throw warehouseError;

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

    // تسجيل في سجل التوريدات
    const { data: userData } = await supabaseClient.auth.getUser();
    await supabaseClient.from("branch_transfers").insert({
      from_branch_id: branchId,
      to_branch_id: null,
      product_id: productId,
      quantity: quantity,
      transfer_type: "return",
      notes: notes || "مرتجع للمخزن",
      created_by: userData.user?.id,
    });

    showMessage(msg, "✅ تم المرتجع بنجاح", "success");
    setTimeout(() => {
      returnModal.hide();
      loadTransfers();
    }, 1500);
  } catch (error) {
    console.error("Error:", error);
    showMessage(msg, "❌ فشل المرتجع: " + error.message, "danger");
  }
}

// دالة عرض الرسائل
function showMessage(element, message, type) {
  element.textContent = message;
  element.className = `alert alert-${type}`;
  element.classList.remove("d-none");
}

// =============================================
// دوال التوريد من المخزن
// =============================================

// عرض مودال التوريد
function showSupplyModal() {
  const modal = document.getElementById("supplyModal");
  if (!modal) {
    alert("خطأ: مودال التوريد غير موجود");
    return;
  }

  supplyModal = new bootstrap.Modal(modal);

  // تحميل البيانات
  loadBranchesForSupply();
  loadProductsForSupply();

  // إعادة تعيين النموذج
  document.getElementById("supplyForm").reset();
  document.getElementById("supplyAvailableStock").value = "";
  document.getElementById("supplyMessage").classList.add("d-none");

  // أحداث
  document
    .getElementById("supplyProduct")
    .addEventListener("change", function () {
      updateAvailableStockForSupply();
    });

  supplyModal.show();
}

async function loadBranchesForSupply() {
  try {
    const { data, error } = await supabaseClient
      .from("branches")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("supplyBranch");
    if (select) {
      select.innerHTML = '<option value="">اختر الفرع</option>';
      data.forEach((branch) => {
        select.innerHTML += `<option value="${branch.id}">${branch.name}</option>`;
      });
    }
  } catch (error) {
    console.error("Error loading branches:", error);
  }
}

async function loadProductsForSupply() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("supplyProduct");
    if (select) {
      select.innerHTML = '<option value="">اختر المنتج</option>';
      data.forEach((product) => {
        select.innerHTML += `<option value="${product.id}">${product.name}</option>`;
      });
    }
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

async function updateAvailableStockForSupply() {
  const productId = document.getElementById("supplyProduct").value;
  const stockElement = document.getElementById("supplyAvailableStock");

  if (!productId) {
    stockElement.value = "اختر المنتج أولاً";
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("warehouse_stock")
      .select("quantity")
      .eq("product_id", productId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    stockElement.value = `${data?.quantity || 0} قطعة`;
  } catch (error) {
    console.error("Error loading stock:", error);
    stockElement.value = "خطأ في التحميل";
  }
}

async function executeSupply() {
  const branchId = document.getElementById("supplyBranch").value;
  const productId = document.getElementById("supplyProduct").value;
  const quantity = parseInt(document.getElementById("supplyQuantity").value);
  const notes = document.getElementById("supplyNotes").value;
  const msg = document.getElementById("supplyMessage");

  if (!branchId || !productId || !quantity) {
    showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
    return;
  }

  try {
    // التحقق من الكمية في المخزن
    const { data: warehouseData, error: warehouseError } = await supabaseClient
      .from("warehouse_stock")
      .select("quantity")
      .eq("product_id", productId)
      .single();

    if (warehouseError && warehouseError.code !== "PGRST116")
      throw warehouseError;

    const available = warehouseData?.quantity || 0;
    if (available < quantity) {
      showMessage(
        msg,
        `الكمية المتاحة (${available}) أقل من المطلوب (${quantity})`,
        "danger",
      );
      return;
    }

    // 1. تحديث مخزون المستودع (نقص)
    await supabaseClient
      .from("warehouse_stock")
      .update({ quantity: available - quantity })
      .eq("product_id", productId);

    // 2. تحديث مخزون الفرع (زيادة)
    const { data: branchStockData, error: branchStockError } =
      await supabaseClient
        .from("branch_stock")
        .select("quantity")
        .eq("branch_id", branchId)
        .eq("product_id", productId)
        .single();

    if (branchStockError && branchStockError.code !== "PGRST116")
      throw branchStockError;

    if (branchStockData) {
      await supabaseClient
        .from("branch_stock")
        .update({ quantity: (branchStockData?.quantity || 0) + quantity })
        .eq("branch_id", branchId)
        .eq("product_id", productId);
    } else {
      await supabaseClient.from("branch_stock").insert({
        branch_id: branchId,
        product_id: productId,
        quantity: quantity,
      });
    }

    // 3. تسجيل في سجل التوريدات
    const { data: userData } = await supabaseClient.auth.getUser();
    await supabaseClient.from("branch_transfers").insert({
      from_branch_id: null,
      to_branch_id: branchId,
      product_id: productId,
      quantity: quantity,
      transfer_type: "supply",
      notes: notes || "توريد من المخزن الرئيسي",
      created_by: userData.user?.id,
    });

    // 4. تسجيل النشاط
    await logActivity("supply_transfer", {
      to_branch: branchId,
      product: productId,
      quantity: quantity,
    });

    showMessage(msg, "✅ تم التوريد بنجاح", "success");
    setTimeout(() => {
      supplyModal.hide();
      loadTransfers();
    }, 1500);
  } catch (error) {
    console.error("Error:", error);
    showMessage(msg, "❌ فشل التوريد: " + error.message, "danger");
  }
}

// جعل الدوال متاحة
window.showSupplyModal = showSupplyModal;
window.showTransferModal = showTransferModal;
window.showReturnModal = showReturnModal;
window.executeTransfer = executeTransfer;
window.executeReturn = executeReturn;
window.loadTransfers = loadTransfers;
window.resetFilters = resetFilters;
