// ============================================================
// ✅ دوال مساعدة لتحديث المخزون
// ============================================================

async function updateBranchStock(branchId, productId, quantityChange) {
    try {
        var { data: current, error } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", productId)
            .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;

        var currentQty = (current && current.quantity) || 0;
        var newQty = Math.max(0, currentQty + quantityChange);

        var { error: upsertError } = await supabaseClient
            .from("branch_stock")
            .upsert({
                branch_id: branchId,
                product_id: productId,
                quantity: newQty,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: "branch_id, product_id",
            }, );

        if (upsertError) throw upsertError;

        return {
            success: true,
            oldQuantity: currentQty,
            newQuantity: newQty,
            change: quantityChange,
        };
    } catch (error) {
        console.error("❌ خطأ في تحديث مخزون الفرع:", error);
        return {
            success: false,
            error: error.message,
        };
    }
}

async function updateWarehouseStock(productId, quantityChange) {
    try {
        var { data: current, error } = await supabaseClient
            .from("warehouse_stock")
            .select("quantity")
            .eq("product_id", productId)
            .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;

        var currentQty = (current && current.quantity) || 0;
        var newQty = Math.max(0, currentQty + quantityChange);

        var { error: upsertError } = await supabaseClient
            .from("warehouse_stock")
            .upsert({
                product_id: productId,
                quantity: newQty,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: "product_id",
            }, );

        if (upsertError) throw upsertError;

        return {
            success: true,
            oldQuantity: currentQty,
            newQuantity: newQty,
            change: quantityChange,
        };
    } catch (error) {
        console.error("❌ خطأ في تحديث المخزن:", error);
        return {
            success: false,
            error: error.message,
        };
    }
}

// ============================================================
// ✅ دالة الربط: تحديث الفرع والمخزن معاً
// ============================================================

async function updateBothStocks(
    branchId,
    productId,
    branchChange,
    warehouseChange,
) {
    try {
        var branchResult = await updateBranchStock(
            branchId,
            productId,
            branchChange,
        );
        if (!branchResult.success) throw new Error(branchResult.error);

        var warehouseResult = await updateWarehouseStock(
            productId,
            warehouseChange,
        );
        if (!warehouseResult.success) throw new Error(warehouseResult.error);

        return {
            success: true,
            branch: branchResult,
            warehouse: warehouseResult,
        };
    } catch (error) {
        console.error("❌ خطأ في تحديث كلا المخزونين:", error);
        return {
            success: false,
            error: error.message,
        };
    }
}

// ============================================================
// تصدير الدوال للنطاق العام
// ============================================================

window.updateBranchStock = updateBranchStock;
window.updateWarehouseStock = updateWarehouseStock;
window.updateBothStocks = updateBothStocks;

// ============================================================
// سجل التوريدات - النسخة النهائية
// ============================================================

document.addEventListener("DOMContentLoaded", async function() {
    var user = await checkAuthAndRedirect();
    if (!user || user.profile.role !== "admin") {
        window.location.href = "/pages/login.html";
        return;
    }

    var avatar = document.getElementById("userAvatar");
    var userName = document.getElementById("userName");
    avatar.textContent = user.profile.full_name ?
        user.profile.full_name.charAt(0).toUpperCase() :
        "A";
    userName.textContent = user.profile.full_name || "أدمن";

    await loadBranches();
    await loadProducts();
    await loadTransfers();
});

// ============================================================
// دوال التحميل
// ============================================================

async function loadBranches() {
    try {
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");

        if (error) throw error;

        var select = document.getElementById("filterBranch");
        select.innerHTML = '<option value="">جميع الفروع</option>';
        for (var i = 0; i < data.length; i++) {
            select.innerHTML +=
                '<option value="' + data[i].id + '">' + data[i].name + "</option>";
        }
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

async function loadProducts() {
    try {
        var { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("name");

        if (error) throw error;

        var select = document.getElementById("filterProduct");
        select.innerHTML = '<option value="">جميع المنتجات</option>';
        for (var i = 0; i < data.length; i++) {
            select.innerHTML +=
                '<option value="' + data[i].id + '">' + data[i].name + "</option>";
        }
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

// ============================================================
// تحميل وعرض التوريدات (مع الفلاتر)
// ============================================================

async function loadTransfers() {
    try {
        var dateFrom = document.getElementById("filterDateFrom").value;
        var dateTo = document.getElementById("filterDateTo").value;
        var branchId = document.getElementById("filterBranch").value;
        var productId = document.getElementById("filterProduct").value;

        // ✅ بناء الاستعلام مع الفلاتر
        var query = supabaseClient
            .from("branch_transfers")
            .select("*");

        // تطبيق الفلاتر على الاستعلام
        if (dateFrom) {
            query = query.gte("transfer_date", dateFrom);
        }
        if (dateTo) {
            query = query.lte("transfer_date", dateTo);
        }
        if (branchId) {
            query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
        }
        if (productId) {
            query = query.eq("product_id", productId);
        }

        // ترتيب النتائج
        query = query.order("transfer_date", { ascending: false });

        var { data: transfers, error: transfersError } = await query;

        if (transfersError) throw transfersError;

        // جلب بيانات الفروع والمنتجات بشكل منفصل
        var { data: branches } = await supabaseClient
            .from("branches")
            .select("id, name");
        var { data: products } = await supabaseClient
            .from("products")
            .select("id, name");

        // ربط البيانات يدوياً
        var data = [];
        for (var i = 0; i < transfers.length; i++) {
            var transfer = transfers[i];
            var fromBranch = null;
            var toBranch = null;
            var product = null;

            for (var j = 0; j < branches.length; j++) {
                if (branches[j].id === transfer.from_branch_id) {
                    fromBranch = branches[j];
                }
                if (branches[j].id === transfer.to_branch_id) {
                    toBranch = branches[j];
                }
            }

            for (var k = 0; k < products.length; k++) {
                if (products[k].id === transfer.product_id) {
                    product = products[k];
                }
            }

            data.push({
                ...transfer,
                from_branch: fromBranch,
                to_branch: toBranch,
                products: product
            });
        }

        displayTransfers(data);
        updateStatistics(data);
    } catch (error) {
        console.error("Error loading transfers:", error);
        showError("فشل تحميل التوريدات");
    }
}

function displayTransfers(data) {
    var tbody = document.getElementById("transfersBody");

    if (data.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8" class="text-center text-muted">لا توجد توريدات</td></tr>';
        return;
    }

    var html = "";
    for (var i = 0; i < data.length; i++) {
        var transfer = data[i];

        var typeNames = {
            supply: "توريد",
            transfer: "تحويل",
            return: "مرتجع للمخزن",
            customer_return: "مرتجع عميل ✅",
            exchange: "استبدال 🔄",
        };
        var typeColors = {
            supply: "primary",
            transfer: "success",
            return: "warning",
            customer_return: "info",
            exchange: "secondary",
        };

        var typeName = typeNames[transfer.transfer_type] || transfer.transfer_type;
        var typeColor = typeColors[transfer.transfer_type] || "secondary";

        var fromBranchName = "المخزن";
        var toBranchName = "المخزن";
        var productName = "غير معروف";

        if (transfer.from_branch && transfer.from_branch.name) {
            fromBranchName = transfer.from_branch.name;
        }
        if (transfer.to_branch && transfer.to_branch.name) {
            toBranchName = transfer.to_branch.name;
        }
        if (transfer.products && transfer.products.name) {
            productName = transfer.products.name;
        }

        html +=
            "<tr>" +
            "<td>" +
            (i + 1) +
            "</td>" +
            "<td>" +
            new Date(transfer.transfer_date).toLocaleDateString("ar") +
            "</td>" +
            '<td><span class="badge bg-' +
            typeColor +
            '">' +
            typeName +
            "</span></td>" +
            "<td>" +
            fromBranchName +
            "</td>" +
            "<td>" +
            toBranchName +
            "</td>" +
            "<td>" +
            productName +
            "</td>" +
            '<td><span class="badge bg-primary">' +
            transfer.quantity +
            "</span></td>" +
            "<td>" +
            (transfer.notes || "-") +
            "</td>" +
            "</tr>";
    }
    tbody.innerHTML = html;
}

function updateStatistics(data) {
    if (data.length === 0) {
        document.getElementById("totalTransfers").textContent = "0";
        document.getElementById("totalItems").textContent = "0";
        document.getElementById("totalBranches").textContent = "0";
        document.getElementById("totalDays").textContent = "0";
        return;
    }

    var totalItems = 0;
    for (var i = 0; i < data.length; i++) {
        totalItems += data[i].quantity || 0;
    }

    var uniqueBranches = [];
    var uniqueDays = [];
    for (var j = 0; j < data.length; j++) {
        if (
            data[j].to_branch_id &&
            uniqueBranches.indexOf(data[j].to_branch_id) === -1
        ) {
            uniqueBranches.push(data[j].to_branch_id);
        }
        if (
            data[j].transfer_date &&
            uniqueDays.indexOf(data[j].transfer_date) === -1
        ) {
            uniqueDays.push(data[j].transfer_date);
        }
    }

    document.getElementById("totalTransfers").textContent = data.length;
    document.getElementById("totalItems").textContent = totalItems;
    document.getElementById("totalBranches").textContent = uniqueBranches.length;
    document.getElementById("totalDays").textContent = uniqueDays.length;
}

function resetFilters() {
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    document.getElementById("filterBranch").value = "";
    document.getElementById("filterProduct").value = "";
    loadTransfers();
}

function exportTransfers() {
    var headers = [
        "التاريخ",
        "النوع",
        "من",
        "إلى",
        "المنتج",
        "الكمية",
        "الملاحظات",
    ];
    var rows = document.querySelectorAll("#transfersBody tr");
    var csv = [headers.join(",")];

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var cols = row.querySelectorAll("td");
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
        "توريدات_الفروع_" + new Date().toISOString().split("T")[0] + ".csv";
    link.click();
}

// ============================================================
// showTransferModal
// ============================================================

var supplyModal = null;
var transferModal = null;
var returnModal = null;

function showSupplyModal() {
    window.location.href = "warehouse.html";
}

// ============================================================
// تحويل بين الفروع
// ============================================================

function showTransferModal() {
    var oldModal = document.getElementById("transferModal");
    if (oldModal) oldModal.remove();

    var modalHtml =
        "" +
        '<div class="modal fade" id="transferModal" tabindex="-1">' +
        '  <div class="modal-dialog">' +
        '    <div class="modal-content">' +
        '      <div class="modal-header">' +
        '        <h5 class="modal-title"><i class="fas fa-exchange-alt me-2"></i>تحويل بين الفروع</h5>' +
        '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
        "      </div>" +
        '      <div class="modal-body">' +
        '        <div id="transferMessage" class="alert d-none"></div>' +
        '        <form id="transferForm">' +
        '          <div class="mb-3">' +
        '            <label class="form-label">من فرع *</label>' +
        '            <select class="form-select" id="transferFromBranch" required>' +
        '              <option value="">اختر الفرع المصدر</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">إلى فرع *</label>' +
        '            <select class="form-select" id="transferToBranch" required>' +
        '              <option value="">اختر الفرع الوجهة</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">المنتج *</label>' +
        '            <select class="form-select" id="transferProduct" required>' +
        '              <option value="">اختر المنتج</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الكمية المتاحة</label>' +
        '            <input type="text" class="form-control" id="transferAvailableStock" readonly>' +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الكمية *</label>' +
        '            <input type="number" class="form-control" id="transferQuantity" min="1" required>' +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الملاحظات</label>' +
        '            <textarea class="form-control" id="transferNotes" rows="2" placeholder="سبب التحويل..."></textarea>' +
        "          </div>" +
        "        </form>" +
        "      </div>" +
        '      <div class="modal-footer">' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>' +
        '        <button type="button" class="btn btn-success" onclick="executeTransfer()">تنفيذ التحويل</button>' +
        "      </div>" +
        "    </div>" +
        "  </div>" +
        "</div>";

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    transferModal = new bootstrap.Modal(document.getElementById("transferModal"));
    loadBranchesForTransfer();
    loadProductsForTransfer();

    document
        .getElementById("transferProduct")
        .addEventListener("change", updateAvailableStockForTransfer);
    document
        .getElementById("transferFromBranch")
        .addEventListener("change", updateAvailableStockForTransfer);

    transferModal.show();
}

async function loadBranchesForTransfer() {
    try {
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (error) throw error;

        var selects = ["transferFromBranch", "transferToBranch"];
        for (var i = 0; i < selects.length; i++) {
            var select = document.getElementById(selects[i]);
            if (select) {
                select.innerHTML = '<option value="">اختر الفرع</option>';
                for (var j = 0; j < data.length; j++) {
                    select.innerHTML +=
                        '<option value="' + data[j].id + '">' + data[j].name + "</option>";
                }
            }
        }
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

async function loadProductsForTransfer() {
    try {
        var { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("transferProduct");
        if (select) {
            select.innerHTML = '<option value="">اختر المنتج</option>';
            for (var i = 0; i < data.length; i++) {
                select.innerHTML +=
                    '<option value="' + data[i].id + '">' + data[i].name + "</option>";
            }
        }
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

async function updateAvailableStockForTransfer() {
    var branchId = document.getElementById("transferFromBranch").value;
    var productId = document.getElementById("transferProduct").value;
    var stockElement = document.getElementById("transferAvailableStock");

    if (!branchId || !productId) {
        stockElement.value = "اختر الفرع والمنتج أولاً";
        return;
    }

    try {
        var { data, error } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", productId)
            .single();

        if (error && error.code !== "PGRST116") throw error;
        stockElement.value = ((data && data.quantity) || 0) + " قطعة";
    } catch (error) {
        console.error("Error loading stock:", error);
        stockElement.value = "خطأ في التحميل";
    }
}

async function executeTransfer() {
    var fromBranchId = document.getElementById("transferFromBranch").value;
    var toBranchId = document.getElementById("transferToBranch").value;
    var productId = document.getElementById("transferProduct").value;
    var quantity = parseInt(document.getElementById("transferQuantity").value);
    var notes = document.getElementById("transferNotes").value;
    var msg = document.getElementById("transferMessage");

    if (!fromBranchId || !toBranchId || !productId || !quantity) {
        showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
        return;
    }

    if (fromBranchId === toBranchId) {
        showMessage(msg, "لا يمكن التحويل لنفس الفرع", "danger");
        return;
    }

    try {
        var fromResult = await updateBranchStock(
            fromBranchId,
            productId, -quantity,
        );
        if (!fromResult.success) throw new Error(fromResult.error);

        var toResult = await updateBranchStock(toBranchId, productId, quantity);
        if (!toResult.success) throw new Error(toResult.error);

        var { data: userData } = await supabaseClient.auth.getUser();
        var userId = null;
        if (userData && userData.user && userData.user.id) {
            userId = userData.user.id;
        }

        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: fromBranchId,
            to_branch_id: toBranchId,
            product_id: productId,
            quantity: quantity,
            transfer_type: "transfer",
            notes: notes || "تحويل بين الفروع",
            created_by: userId,
            transfer_date: new Date().toISOString(),
        });

        showMessage(
            msg,
            "✅ تم التحويل بنجاح\n📦 من: " +
            fromResult.newQuantity +
            "\n📦 إلى: " +
            toResult.newQuantity,
            "success",
        );
        setTimeout(function() {
            transferModal.hide();
            loadTransfers();
        }, 1500);
    } catch (error) {
        console.error("Error:", error);
        showMessage(msg, "❌ فشل التحويل: " + error.message, "danger");
    }
}

// ============================================================
// مرتجع للمخزن
// ============================================================

function showReturnModal() {
    var oldModal = document.getElementById("returnModal");
    if (oldModal) oldModal.remove();

    var modalHtml =
        "" +
        '<div class="modal fade" id="returnModal" tabindex="-1">' +
        '  <div class="modal-dialog">' +
        '    <div class="modal-content">' +
        '      <div class="modal-header">' +
        '        <h5 class="modal-title"><i class="fas fa-undo me-2"></i>مرتجع للمخزن</h5>' +
        '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
        "      </div>" +
        '      <div class="modal-body">' +
        '        <div id="returnMessage" class="alert d-none"></div>' +
        '        <form id="returnForm">' +
        '          <div class="mb-3">' +
        '            <label class="form-label">من فرع *</label>' +
        '            <select class="form-select" id="returnBranch" required>' +
        '              <option value="">اختر الفرع</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">المنتج *</label>' +
        '            <select class="form-select" id="returnProduct" required>' +
        '              <option value="">اختر المنتج</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الكمية المتاحة</label>' +
        '            <input type="text" class="form-control" id="returnAvailableStock" readonly>' +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الكمية *</label>' +
        '            <input type="number" class="form-control" id="returnQuantity" min="1" required>' +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">سبب المرتجع</label>' +
        '            <textarea class="form-control" id="returnNotes" rows="2" placeholder="سبب الإرجاع..."></textarea>' +
        "          </div>" +
        "        </form>" +
        "      </div>" +
        '      <div class="modal-footer">' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>' +
        '        <button type="button" class="btn btn-warning" onclick="executeReturn()">تنفيذ المرتجع</button>' +
        "      </div>" +
        "    </div>" +
        "  </div>" +
        "</div>";

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    returnModal = new bootstrap.Modal(document.getElementById("returnModal"));
    loadBranchesForReturn();
    loadProductsForReturn();

    document
        .getElementById("returnProduct")
        .addEventListener("change", updateAvailableStockForReturn);
    document
        .getElementById("returnBranch")
        .addEventListener("change", updateAvailableStockForReturn);

    returnModal.show();
}

async function loadBranchesForReturn() {
    try {
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("returnBranch");
        if (select) {
            select.innerHTML = '<option value="">اختر الفرع</option>';
            for (var i = 0; i < data.length; i++) {
                select.innerHTML +=
                    '<option value="' + data[i].id + '">' + data[i].name + "</option>";
            }
        }
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

async function loadProductsForReturn() {
    try {
        var { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("returnProduct");
        if (select) {
            select.innerHTML = '<option value="">اختر المنتج</option>';
            for (var i = 0; i < data.length; i++) {
                select.innerHTML +=
                    '<option value="' + data[i].id + '">' + data[i].name + "</option>";
            }
        }
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

async function updateAvailableStockForReturn() {
    var branchId = document.getElementById("returnBranch").value;
    var productId = document.getElementById("returnProduct").value;
    var stockElement = document.getElementById("returnAvailableStock");

    if (!branchId || !productId) {
        stockElement.value = "اختر الفرع والمنتج أولاً";
        return;
    }

    try {
        var { data, error } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", productId)
            .single();

        if (error && error.code !== "PGRST116") throw error;
        stockElement.value = ((data && data.quantity) || 0) + " قطعة";
    } catch (error) {
        console.error("Error loading stock:", error);
        stockElement.value = "خطأ في التحميل";
    }
}

async function executeReturn() {
    var branchId = document.getElementById("returnBranch").value;
    var productId = document.getElementById("returnProduct").value;
    var quantity = parseInt(document.getElementById("returnQuantity").value);
    var notes = document.getElementById("returnNotes").value;
    var msg = document.getElementById("returnMessage");

    if (!branchId || !productId || !quantity) {
        showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
        return;
    }

    try {
        var result = await updateBothStocks(
            branchId,
            productId, -quantity,
            quantity,
        );
        if (!result.success) throw new Error(result.error);

        await supabaseClient.from("returns_and_exchanges").insert({
            branch_id: branchId,
            product_id: productId,
            quantity: quantity,
            type: "return",
            reason: notes || "مرتجع للمخزن",
            transferred_to_warehouse: true,
            warehouse_updated: true,
            branch_updated: true,
        });

        var { data: userData } = await supabaseClient.auth.getUser();
        var userId = null;
        if (userData && userData.user && userData.user.id) {
            userId = userData.user.id;
        }

        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: branchId,
            to_branch_id: null,
            product_id: productId,
            quantity: quantity,
            transfer_type: "return",
            notes: notes || "مرتجع للمخزن (تم الربط)",
            created_by: userId,
            transfer_date: new Date().toISOString(),
        });

        showMessage(
            msg,
            "✅ تم المرتجع بنجاح (ربط تلقائي)\n📦 الفرع: " +
            result.branch.newQuantity +
            "\n🏚️ المخزن: " +
            result.warehouse.newQuantity,
            "success",
        );
        setTimeout(function() {
            returnModal.hide();
            loadTransfers();
        }, 1500);
    } catch (error) {
        console.error("❌ Error in return:", error);
        showMessage(msg, "❌ فشل المرتجع: " + error.message, "danger");
    }
}

// ============================================================
// دوال التوريد من المخزن
// ============================================================

function showSupplyModal() {
    var modal = document.getElementById("supplyModal");
    if (!modal) {
        alert("خطأ: مودال التوريد غير موجود");
        return;
    }

    supplyModal = new bootstrap.Modal(modal);
    loadBranchesForSupply();
    loadProductsForSupply();

    document.getElementById("supplyForm").reset();
    document.getElementById("supplyAvailableStock").value = "";
    document.getElementById("supplyMessage").classList.add("d-none");

    document
        .getElementById("supplyProduct")
        .addEventListener("change", updateAvailableStockForSupply);
    supplyModal.show();
}

async function loadBranchesForSupply() {
    try {
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("supplyBranch");
        if (select) {
            select.innerHTML = '<option value="">اختر الفرع</option>';
            for (var i = 0; i < data.length; i++) {
                select.innerHTML +=
                    '<option value="' + data[i].id + '">' + data[i].name + "</option>";
            }
        }
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

async function loadProductsForSupply() {
    try {
        var { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("supplyProduct");
        if (select) {
            select.innerHTML = '<option value="">اختر المنتج</option>';
            for (var i = 0; i < data.length; i++) {
                select.innerHTML +=
                    '<option value="' + data[i].id + '">' + data[i].name + "</option>";
            }
        }
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

async function updateAvailableStockForSupply() {
    var productId = document.getElementById("supplyProduct").value;
    var stockElement = document.getElementById("supplyAvailableStock");

    if (!productId) {
        stockElement.value = "اختر المنتج أولاً";
        return;
    }

    try {
        var { data, error } = await supabaseClient
            .from("warehouse_stock")
            .select("quantity")
            .eq("product_id", productId)
            .single();

        if (error && error.code !== "PGRST116") throw error;
        stockElement.value = ((data && data.quantity) || 0) + " قطعة";
    } catch (error) {
        console.error("Error loading stock:", error);
        stockElement.value = "خطأ في التحميل";
    }
}

async function executeSupply() {
    var branchId = document.getElementById("supplyBranch").value;
    var productId = document.getElementById("supplyProduct").value;
    var quantity = parseInt(document.getElementById("supplyQuantity").value);
    var notes = document.getElementById("supplyNotes").value;
    var msg = document.getElementById("supplyMessage");

    if (!branchId || !productId || !quantity) {
        showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
        return;
    }

    try {
        var result = await updateBothStocks(
            branchId,
            productId,
            quantity, -quantity,
        );
        if (!result.success) throw new Error(result.error);

        var { data: userData } = await supabaseClient.auth.getUser();
        var userId = null;
        if (userData && userData.user && userData.user.id) {
            userId = userData.user.id;
        }

        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: null,
            to_branch_id: branchId,
            product_id: productId,
            quantity: quantity,
            transfer_type: "supply",
            notes: notes || "توريد من المخزن الرئيسي (تم الربط)",
            created_by: userId,
            transfer_date: new Date().toISOString(),
        });

        showMessage(
            msg,
            "✅ تم التوريد بنجاح (ربط تلقائي)\n🏚️ المخزن: " +
            result.warehouse.newQuantity +
            "\n📦 الفرع: " +
            result.branch.newQuantity,
            "success",
        );
        setTimeout(function() {
            supplyModal.hide();
            loadTransfers();
        }, 1500);
    } catch (error) {
        console.error("Error:", error);
        showMessage(msg, "❌ فشل التوريد: " + error.message, "danger");
    }
}

// ============================================================
// مرتجع من العميل
// ============================================================

function showCustomerReturnModal() {
    var oldModal = document.getElementById("customerReturnModal");
    if (oldModal) oldModal.remove();

    var modalHtml =
        "" +
        '<div class="modal fade" id="customerReturnModal" tabindex="-1">' +
        '  <div class="modal-dialog">' +
        '    <div class="modal-content">' +
        '      <div class="modal-header">' +
        '        <h5 class="modal-title"><i class="fas fa-user-undo me-2"></i>مرتجع من العميل</h5>' +
        '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
        "      </div>" +
        '      <div class="modal-body">' +
        '        <div id="customerReturnMessage" class="alert d-none"></div>' +
        '        <form id="customerReturnForm">' +
        '          <div class="mb-3">' +
        '            <label class="form-label">الفرع *</label>' +
        '            <select class="form-select" id="customerReturnBranch" required>' +
        '              <option value="">اختر الفرع</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">المنتج *</label>' +
        '            <select class="form-select" id="customerReturnProduct" required>' +
        '              <option value="">اختر المنتج</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الكمية *</label>' +
        '            <input type="number" class="form-control" id="customerReturnQuantity" min="1" required>' +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">سبب المرتجع</label>' +
        '            <textarea class="form-control" id="customerReturnNotes" rows="2" placeholder="سبب الإرجاع..."></textarea>' +
        "          </div>" +
        "        </form>" +
        "      </div>" +
        '      <div class="modal-footer">' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>' +
        '        <button type="button" class="btn btn-info" onclick="executeCustomerReturn()">تنفيذ المرتجع</button>' +
        "      </div>" +
        "    </div>" +
        "  </div>" +
        "</div>";

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    var modal = new bootstrap.Modal(
        document.getElementById("customerReturnModal"),
    );
    loadBranchesForCustomerReturn();
    loadProductsForCustomerReturn();
    modal.show();
}

async function loadBranchesForCustomerReturn() {
    try {
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("customerReturnBranch");
        select.innerHTML = '<option value="">اختر الفرع</option>';
        for (var i = 0; i < data.length; i++) {
            select.innerHTML +=
                '<option value="' + data[i].id + '">' + data[i].name + "</option>";
        }
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

async function loadProductsForCustomerReturn() {
    try {
        var { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("customerReturnProduct");
        select.innerHTML = '<option value="">اختر المنتج</option>';
        for (var i = 0; i < data.length; i++) {
            select.innerHTML +=
                '<option value="' + data[i].id + '">' + data[i].name + "</option>";
        }
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

// ============================================================
// مرتجع من العميل (✅ الفرع فقط)
// ============================================================

async function executeCustomerReturn() {
    var branchId = document.getElementById("customerReturnBranch").value;
    var productId = document.getElementById("customerReturnProduct").value;
    var quantity = parseInt(
        document.getElementById("customerReturnQuantity").value,
    );
    var notes = document.getElementById("customerReturnNotes").value;
    var msg = document.getElementById("customerReturnMessage");

    if (!branchId || !productId || !quantity) {
        showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
        return;
    }

    try {
        // ✅ فقط الفرع يزيد (المخزن ميتغيرش)
        var branchResult = await updateBranchStock(branchId, productId, quantity);
        if (!branchResult.success) throw new Error(branchResult.error);

        // تسجيل في returns_and_exchanges
        await supabaseClient.from("returns_and_exchanges").insert({
            branch_id: branchId,
            product_id: productId,
            quantity: quantity,
            type: "return",
            reason: notes || "مرتجع من العميل",
            transferred_to_warehouse: false, // ❌ مترحلش للمخزن
            warehouse_updated: false, // ❌ المخزن ميتحدثش
            branch_updated: true,
        });

        // تسجيل في branch_transfers
        var { data: userData } = await supabaseClient.auth.getUser();
        var userId = null;
        if (userData && userData.user && userData.user.id) {
            userId = userData.user.id;
        }

        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: branchId,
            to_branch_id: null,
            product_id: productId,
            quantity: quantity,
            transfer_type: "customer_return",
            notes: notes || "مرتجع من العميل (الفرع فقط)",
            created_by: userId,
            transfer_date: new Date().toISOString(),
        });

        showMessage(
            msg,
            "✅ تم إرجاع " +
            quantity +
            " قطعة بنجاح\n" +
            "📦 الفرع: " +
            branchResult.newQuantity,
            "success",
        );

        setTimeout(function() {
            var modalElement = document.getElementById("customerReturnModal");
            if (modalElement) {
                var closeBtn = modalElement.querySelector(".btn-close");
                if (closeBtn) closeBtn.click();
            }
            loadTransfers();
        }, 1500);
    } catch (error) {
        console.error("❌ Error:", error);
        showMessage(msg, "❌ فشل المرتجع: " + error.message, "danger");
    }
}

// ============================================================
// استبدال منتج
// ============================================================

function showExchangeModal() {
    var oldModal = document.getElementById("exchangeModal");
    if (oldModal) oldModal.remove();

    var modalHtml =
        "" +
        '<div class="modal fade" id="exchangeModal" tabindex="-1">' +
        '  <div class="modal-dialog">' +
        '    <div class="modal-content">' +
        '      <div class="modal-header">' +
        '        <h5 class="modal-title"><i class="fas fa-exchange-alt me-2"></i>استبدال منتج</h5>' +
        '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
        "      </div>" +
        '      <div class="modal-body">' +
        '        <div id="exchangeMessage" class="alert d-none"></div>' +
        '        <form id="exchangeForm">' +
        '          <div class="mb-3">' +
        '            <label class="form-label">الفرع *</label>' +
        '            <select class="form-select" id="exchangeBranch" required>' +
        '              <option value="">اختر الفرع</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">المنتج المرتجع *</label>' +
        '            <select class="form-select" id="exchangeOldProduct" required>' +
        '              <option value="">اختر المنتج</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">المنتج الجديد *</label>' +
        '            <select class="form-select" id="exchangeNewProduct" required>' +
        '              <option value="">اختر المنتج</option>' +
        "            </select>" +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الكمية *</label>' +
        '            <input type="number" class="form-control" id="exchangeQuantity" min="1" required>' +
        "          </div>" +
        '          <div class="mb-3">' +
        '            <label class="form-label">الملاحظات</label>' +
        '            <textarea class="form-control" id="exchangeNotes" rows="2" placeholder="ملاحظات..."></textarea>' +
        "          </div>" +
        "        </form>" +
        "      </div>" +
        '      <div class="modal-footer">' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>' +
        '        <button type="button" class="btn btn-secondary" onclick="executeExchange()">تنفيذ الاستبدال</button>' +
        "      </div>" +
        "    </div>" +
        "  </div>" +
        "</div>";

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    var modal = new bootstrap.Modal(document.getElementById("exchangeModal"));
    loadBranchesForExchange();
    loadProductsForExchange();
    modal.show();
}

async function loadBranchesForExchange() {
    try {
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");
        if (error) throw error;

        var select = document.getElementById("exchangeBranch");
        select.innerHTML = '<option value="">اختر الفرع</option>';
        for (var i = 0; i < data.length; i++) {
            select.innerHTML +=
                '<option value="' + data[i].id + '">' + data[i].name + "</option>";
        }
    } catch (error) {
        console.error("Error loading branches:", error);
    }
}

async function loadProductsForExchange() {
    try {
        var { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("name");
        if (error) throw error;

        var ids = ["exchangeOldProduct", "exchangeNewProduct"];
        for (var j = 0; j < ids.length; j++) {
            var select = document.getElementById(ids[j]);
            select.innerHTML = '<option value="">اختر المنتج</option>';
            for (var i = 0; i < data.length; i++) {
                select.innerHTML +=
                    '<option value="' + data[i].id + '">' + data[i].name + "</option>";
            }
        }
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

// ============================================================
// استبدال منتج (✅ الفرع فقط)
// ============================================================

async function executeExchange() {
    var branchId = document.getElementById("exchangeBranch").value;
    var oldProductId = document.getElementById("exchangeOldProduct").value;
    var newProductId = document.getElementById("exchangeNewProduct").value;
    var quantity = parseInt(document.getElementById("exchangeQuantity").value);
    var notes = document.getElementById("exchangeNotes").value;
    var msg = document.getElementById("exchangeMessage");

    if (!branchId || !oldProductId || !newProductId || !quantity) {
        showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
        return;
    }

    if (oldProductId === newProductId) {
        showMessage(msg, "لا يمكن استبدال المنتج بنفسه", "danger");
        return;
    }

    try {
        // ✅ القديم: الفرع يزيد (المخزن ميتغيرش)
        var oldBranchResult = await updateBranchStock(
            branchId,
            oldProductId,
            quantity,
        );
        if (!oldBranchResult.success) throw new Error(oldBranchResult.error);

        // ✅ الجديد: الفرع ينقص (المخزن ميتغيرش)
        var newBranchResult = await updateBranchStock(
            branchId,
            newProductId, -quantity,
        );
        if (!newBranchResult.success) throw new Error(newBranchResult.error);

        // تسجيل في returns_and_exchanges
        var { data: userData } = await supabaseClient.auth.getUser();
        var userId = null;
        if (userData && userData.user && userData.user.id) {
            userId = userData.user.id;
        }

        await supabaseClient.from("returns_and_exchanges").insert({
            branch_id: branchId,
            product_id: oldProductId,
            exchange_product_id: newProductId,
            quantity: quantity,
            type: "exchange",
            reason: notes || "استبدال منتج",
            transferred_to_warehouse: false, // ❌ مترحلش للمخزن
            warehouse_updated: false, // ❌ المخزن ميتحدثش
            branch_updated: true,
        });

        // تسجيل في branch_transfers
        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: branchId,
            to_branch_id: null,
            product_id: oldProductId,
            quantity: quantity,
            transfer_type: "customer_return",
            notes: notes || "مرتجع استبدال (الفرع فقط)",
            created_by: userId,
            transfer_date: new Date().toISOString(),
        });

        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: null,
            to_branch_id: branchId,
            product_id: newProductId,
            quantity: quantity,
            transfer_type: "exchange",
            notes: notes || "توريد استبدال (الفرع فقط)",
            created_by: userId,
            transfer_date: new Date().toISOString(),
        });

        showMessage(
            msg,
            "✅ تم الاستبدال بنجاح\n" +
            "📦 القديم في الفرع: " +
            oldBranchResult.newQuantity +
            "\n" +
            "📦 الجديد في الفرع: " +
            newBranchResult.newQuantity,
            "success",
        );

        setTimeout(function() {
            var modalElement = document.getElementById("exchangeModal");
            if (modalElement) {
                var closeBtn = modalElement.querySelector(".btn-close");
                if (closeBtn) closeBtn.click();
            }
            loadTransfers();
        }, 1500);
    } catch (error) {
        console.error("❌ Error:", error);
        showMessage(msg, "❌ فشل الاستبدال: " + error.message, "danger");
    }
}

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = "alert alert-" + type;
    element.classList.remove("d-none");
}

// ============================================================
// جعل الدوال متاحة في النطاق العام
// ============================================================

window.showSupplyModal = showSupplyModal;
window.showTransferModal = showTransferModal;
window.showReturnModal = showReturnModal;
window.executeTransfer = executeTransfer;
window.executeReturn = executeReturn;
window.loadTransfers = loadTransfers;
window.resetFilters = resetFilters;
window.showCustomerReturnModal = showCustomerReturnModal;
window.executeCustomerReturn = executeCustomerReturn;
window.showExchangeModal = showExchangeModal;
window.executeExchange = executeExchange;
window.exportTransfers = exportTransfers;