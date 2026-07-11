// =============================================
// سجل التوريدات - نسخة كاملة (بدون Optional Chaining)
// =============================================

document.addEventListener("DOMContentLoaded", async function() {
    const user = await checkAuthAndRedirect();
    if (!user || user.profile.role !== "admin") {
        window.location.href = "/pages/login.html";
        return;
    }

    const avatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    avatar.textContent = user.profile.full_name ?
        user.profile.full_name.charAt(0).toUpperCase() :
        "A";
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

        let query = supabaseClient.from("branch_transfers").select(`
                *,
                from_branch:branches!from_branch_id(name),
                to_branch:branches!to_branch_id(name),
                products(name),
                profiles(full_name)
            `);

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
            '<tr><td colspan="8" class="text-center text-muted">لا توجد توريدات</td></tr>';
        return;
    }

    tbody.innerHTML = data
        .map((transfer, index) => {
            const typeNames = {
                supply: "توريد",
                transfer: "تحويل",
                return: "مرتجع",
                customer_return: "مرتجع عميل",
                exchange: "استبدال",
            };
            const typeColors = {
                supply: "primary",
                transfer: "success",
                return: "warning",
                customer_return: "info",
                exchange: "secondary",
            };

            const typeName =
                typeNames[transfer.transfer_type] || transfer.transfer_type;
            const typeColor = typeColors[transfer.transfer_type] || "secondary";

            // ✅ استخدام الـ alias من الـ select
            const fromBranchName = transfer.from_branch && transfer.from_branch.name ? transfer.from_branch.name : "المخزن";
            const toBranchName = transfer.to_branch && transfer.to_branch.name ? transfer.to_branch.name : "المخزن";
            const productName = transfer.products && transfer.products.name ? transfer.products.name : "غير معروف";

            return `
            <tr>
                <td>${index + 1}</td>
                <td>${new Date(transfer.transfer_date).toLocaleDateString("ar")}</td>
                <td><span class="badge bg-${typeColor}">${typeName}</span></td>
                <td>${fromBranchName}</td>
                <td>${toBranchName}</td>
                <td>${productName}</td>
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

    const totalItems = data.reduce(function(sum, t) {
        return sum + (t.quantity || 0);
    }, 0);
    const uniqueBranches = new Set(data.map(function(t) {
        return t.to_branch_id;
    })).size;
    const uniqueDays = new Set(data.map(function(t) {
        return t.transfer_date;
    })).size;

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
    var csv = [];

    var headers = [
        "التاريخ",
        "النوع",
        "من",
        "إلى",
        "المنتج",
        "الكمية",
        "الملاحظات",
    ];
    csv.push(headers.join(","));

    var rows = document.querySelectorAll("#transfersBody tr");
    rows.forEach(function(row) {
        var cols = row.querySelectorAll("td");
        if (cols.length > 1) {
            var rowData = [];
            for (var i = 1; i < cols.length; i++) {
                rowData.push(cols[i].textContent.trim());
            }
            csv.push(rowData.join(","));
        }
    });

    var blob = new Blob(["\uFEFF" + csv.join("\n")], {
        type: "text/csv;charset=utf-8;",
    });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "توريدات_الفروع_" + new Date().toISOString().split("T")[0] + ".csv";
    link.click();
}

// =============================================
// دوال التحويلات والمرتجعات
// =============================================

var supplyModal = null;
var transferModal = null;
var returnModal = null;

function showSupplyModal() {
    window.location.href = "warehouse.html";
}

function showTransferModal() {
    var modalHtml = `
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

    var oldModal = document.getElementById("transferModal");
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    transferModal = new bootstrap.Modal(document.getElementById("transferModal"));

    loadBranchesForTransfer();
    loadProductsForTransfer();

    document
        .getElementById("transferProduct")
        .addEventListener("change", function() {
            updateAvailableStockForTransfer();
        });
    document
        .getElementById("transferFromBranch")
        .addEventListener("change", function() {
            updateAvailableStockForTransfer();
        });

    transferModal.show();
}

function showReturnModal() {
    var modalHtml = `
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

    var oldModal = document.getElementById("returnModal");
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    returnModal = new bootstrap.Modal(document.getElementById("returnModal"));

    loadBranchesForReturn();
    loadProductsForReturn();

    document
        .getElementById("returnProduct")
        .addEventListener("change", function() {
            updateAvailableStockForReturn();
        });
    document
        .getElementById("returnBranch")
        .addEventListener("change", function() {
            updateAvailableStockForReturn();
        });

    returnModal.show();
}

// =============================================
// دوال مساعدة للتحويل
// =============================================

async function loadBranchesForTransfer() {
    try {
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");

        if (error) throw error;

        var selects = ["transferFromBranch", "transferToBranch"];
        selects.forEach(function(id) {
            var select = document.getElementById(id);
            if (select) {
                select.innerHTML = '<option value="">اختر الفرع</option>';
                data.forEach(function(branch) {
                    select.innerHTML += '<option value="' + branch.id + '">' + branch.name + '</option>';
                });
            }
        });
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
            data.forEach(function(product) {
                select.innerHTML += '<option value="' + product.id + '">' + product.name + '</option>';
            });
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
        var { data: fromStock, error: fromError } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", fromBranchId)
            .eq("product_id", productId)
            .single();

        if (fromError && fromError.code !== "PGRST116") throw fromError;

        var available = (fromStock && fromStock.quantity) || 0;
        if (available < quantity) {
            showMessage(
                msg,
                "الكمية المتاحة (" + available + ") أقل من المطلوب (" + quantity + ")",
                "danger",
            );
            return;
        }

        await supabaseClient
            .from("branch_stock")
            .update({ quantity: available - quantity })
            .eq("branch_id", fromBranchId)
            .eq("product_id", productId);

        var { data: toStock, error: toError } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", toBranchId)
            .eq("product_id", productId)
            .single();

        if (toError && toError.code !== "PGRST116") throw toError;

        if (toStock) {
            await supabaseClient
                .from("branch_stock")
                .update({ quantity: ((toStock && toStock.quantity) || 0) + quantity })
                .eq("branch_id", toBranchId)
                .eq("product_id", productId);
        } else {
            await supabaseClient.from("branch_stock").insert({
                branch_id: toBranchId,
                product_id: productId,
                quantity: quantity,
            });
        }

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
        });

        showMessage(msg, "✅ تم التحويل بنجاح", "success");
        setTimeout(function() {
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
        var { data, error } = await supabaseClient
            .from("branches")
            .select("*")
            .order("name");

        if (error) throw error;

        var select = document.getElementById("returnBranch");
        if (select) {
            select.innerHTML = '<option value="">اختر الفرع</option>';
            data.forEach(function(branch) {
                select.innerHTML += '<option value="' + branch.id + '">' + branch.name + '</option>';
            });
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
            data.forEach(function(product) {
                select.innerHTML += '<option value="' + product.id + '">' + product.name + '</option>';
            });
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
        var { data: branchStock, error: branchError } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", productId)
            .single();

        if (branchError && branchError.code !== "PGRST116") throw branchError;

        var available = (branchStock && branchStock.quantity) || 0;
        if (available < quantity) {
            showMessage(
                msg,
                "الكمية المتاحة (" + available + ") أقل من المطلوب (" + quantity + ")",
                "danger",
            );
            return;
        }

        await supabaseClient
            .from("branch_stock")
            .update({ quantity: available - quantity })
            .eq("branch_id", branchId)
            .eq("product_id", productId);

        var { data: warehouseData, error: warehouseError } = await supabaseClient
            .from("warehouse_stock")
            .select("quantity")
            .eq("product_id", productId)
            .single();

        if (warehouseError && warehouseError.code !== "PGRST116")
            throw warehouseError;

        if (warehouseData) {
            await supabaseClient
                .from("warehouse_stock")
                .update({
                    quantity: ((warehouseData && warehouseData.quantity) || 0) + quantity,
                    updated_at: new Date().toISOString(),
                })
                .eq("product_id", productId);
        } else {
            await supabaseClient.from("warehouse_stock").insert({
                product_id: productId,
                quantity: quantity,
            });
        }

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
            notes: notes || "مرتجع للمخزن",
            created_by: userId,
        });

        showMessage(msg, "✅ تم المرتجع بنجاح", "success");
        setTimeout(function() {
            returnModal.hide();
            loadTransfers();
        }, 1500);
    } catch (error) {
        console.error("Error:", error);
        showMessage(msg, "❌ فشل المرتجع: " + error.message, "danger");
    }
}

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = "alert alert-" + type;
    element.classList.remove("d-none");
}

// =============================================
// دوال التوريد من المخزن
// =============================================

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
        .addEventListener("change", function() {
            updateAvailableStockForSupply();
        });

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
            data.forEach(function(branch) {
                select.innerHTML += '<option value="' + branch.id + '">' + branch.name + '</option>';
            });
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
            data.forEach(function(product) {
                select.innerHTML += '<option value="' + product.id + '">' + product.name + '</option>';
            });
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
        var { data: warehouseData, error: warehouseError } = await supabaseClient
            .from("warehouse_stock")
            .select("quantity")
            .eq("product_id", productId)
            .single();

        if (warehouseError && warehouseError.code !== "PGRST116")
            throw warehouseError;

        var available = (warehouseData && warehouseData.quantity) || 0;
        if (available < quantity) {
            showMessage(
                msg,
                "الكمية المتاحة (" + available + ") أقل من المطلوب (" + quantity + ")",
                "danger",
            );
            return;
        }

        await supabaseClient
            .from("warehouse_stock")
            .update({ quantity: available - quantity })
            .eq("product_id", productId);

        var { data: branchStockData, error: branchStockError } =
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
                .update({
                    quantity:
                        ((branchStockData && branchStockData.quantity) || 0) + quantity,
                })
                .eq("branch_id", branchId)
                .eq("product_id", productId);
        } else {
            await supabaseClient.from("branch_stock").insert({
                branch_id: branchId,
                product_id: productId,
                quantity: quantity,
            });
        }

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
            notes: notes || "توريد من المخزن الرئيسي",
            created_by: userId,
        });

        if (typeof logActivity === "function") {
            await logActivity("supply_transfer", {
                to_branch: branchId,
                product: productId,
                quantity: quantity,
            });
        }

        showMessage(msg, "✅ تم التوريد بنجاح", "success");
        setTimeout(function() {
            supplyModal.hide();
            loadTransfers();
        }, 1500);
    } catch (error) {
        console.error("Error:", error);
        showMessage(msg, "❌ فشل التوريد: " + error.message, "danger");
    }
}

// =============================================
// مرتجع من العميل (✅ مُصلح)
// =============================================

function showCustomerReturnModal() {
    var modalHtml = `
        <div class="modal fade" id="customerReturnModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-user-undo me-2"></i>مرتجع من العميل</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="customerReturnMessage" class="alert d-none"></div>
                        <form id="customerReturnForm">
                            <div class="mb-3">
                                <label class="form-label">الفرع *</label>
                                <select class="form-select" id="customerReturnBranch" required>
                                    <option value="">اختر الفرع</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">المنتج *</label>
                                <select class="form-select" id="customerReturnProduct" required>
                                    <option value="">اختر المنتج</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الكمية *</label>
                                <input type="number" class="form-control" id="customerReturnQuantity" min="1" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">سبب المرتجع</label>
                                <textarea class="form-control" id="customerReturnNotes" rows="2" placeholder="سبب الإرجاع..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-info" onclick="executeCustomerReturn()">
                            <i class="fas fa-user-undo me-2"></i>تنفيذ المرتجع
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    var oldModal = document.getElementById("customerReturnModal");
    if (oldModal) oldModal.remove();

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
        data.forEach(function(branch) {
            select.innerHTML += '<option value="' + branch.id + '">' + branch.name + '</option>';
        });
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
        data.forEach(function(product) {
            select.innerHTML += '<option value="' + product.id + '">' + product.name + '</option>';
        });
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

async function executeCustomerReturn() {
    var branchId = document.getElementById("customerReturnBranch").value;
    var productId = document.getElementById("customerReturnProduct").value;
    var quantity = parseInt(document.getElementById("customerReturnQuantity").value);
    var notes = document.getElementById("customerReturnNotes").value;
    var msg = document.getElementById("customerReturnMessage");

    if (!branchId || !productId || !quantity) {
        showMessage(msg, "يرجى ملء جميع الحقول المطلوبة", "danger");
        return;
    }

    try {
        // 1. زيادة مخزون الفرع (العميل رجع المنتج)
        var { data: stockData, error: stockError } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", productId)
            .maybeSingle();

        if (stockError) throw stockError;

        var currentQty = (stockData && stockData.quantity) || 0;
        var newQty = currentQty + quantity;

        if (stockData) {
            await supabaseClient
                .from("branch_stock")
                .update({ quantity: newQty })
                .eq("branch_id", branchId)
                .eq("product_id", productId);
        } else {
            await supabaseClient.from("branch_stock").insert({
                branch_id: branchId,
                product_id: productId,
                quantity: quantity
            });
        }

        // 2. ✅ تحديث المخزن الرئيسي (يزيد لأن العميل رجع المنتج)
        var { data: warehouseData, error: warehouseError } = await supabaseClient
            .from("warehouse_stock")
            .select("quantity")
            .eq("product_id", productId)
            .maybeSingle();

        if (warehouseError && warehouseError.code !== "PGRST116") throw warehouseError;

        var warehouseQty = (warehouseData && warehouseData.quantity) || 0;
        var newWarehouseQty = warehouseQty + quantity; // ✅ يزيد المخزن

        if (warehouseData) {
            await supabaseClient
                .from("warehouse_stock")
                .update({ quantity: newWarehouseQty })
                .eq("product_id", productId);
        } else {
            await supabaseClient.from("warehouse_stock").insert({
                product_id: productId,
                quantity: quantity
            });
        }

        // 3. تسجيل الحركة
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
            notes: notes || "مرتجع من العميل",
            created_by: userId
        });

        showMessage(msg, "✅ تم إرجاع الكمية بنجاح", "success");

        setTimeout(function() {
            var modalElement = document.getElementById("customerReturnModal");
            if (modalElement) {
                var closeBtn = modalElement.querySelector(".btn-close");
                if (closeBtn) closeBtn.click();
            }
            loadTransfers();
        }, 1500);

    } catch (error) {
        console.error("Error:", error);
        showMessage(msg, "❌ فشل المرتجع: " + error.message, "danger");
    }
}

// =============================================
// استبدال منتج (✅ مُصلح)
// =============================================

function showExchangeModal() {
    var modalHtml = `
        <div class="modal fade" id="exchangeModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-exchange-alt me-2"></i>استبدال منتج</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="exchangeMessage" class="alert d-none"></div>
                        <form id="exchangeForm">
                            <div class="mb-3">
                                <label class="form-label">الفرع *</label>
                                <select class="form-select" id="exchangeBranch" required>
                                    <option value="">اختر الفرع</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">المنتج المرتجع *</label>
                                <select class="form-select" id="exchangeOldProduct" required>
                                    <option value="">اختر المنتج</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">المنتج الجديد *</label>
                                <select class="form-select" id="exchangeNewProduct" required>
                                    <option value="">اختر المنتج</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الكمية *</label>
                                <input type="number" class="form-control" id="exchangeQuantity" min="1" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الملاحظات</label>
                                <textarea class="form-control" id="exchangeNotes" rows="2" placeholder="ملاحظات..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-secondary" onclick="executeExchange()">
                            <i class="fas fa-exchange-alt me-2"></i>تنفيذ الاستبدال
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    var oldModal = document.getElementById("exchangeModal");
    if (oldModal) oldModal.remove();

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
        data.forEach(function(branch) {
            select.innerHTML += '<option value="' + branch.id + '">' + branch.name + '</option>';
        });
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

        var selects = ["exchangeOldProduct", "exchangeNewProduct"];
        selects.forEach(function(id) {
            var select = document.getElementById(id);
            select.innerHTML = '<option value="">اختر المنتج</option>';
            data.forEach(function(product) {
                select.innerHTML += '<option value="' + product.id + '">' + product.name + '</option>';
            });
        });
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

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
        // ====== الخطوة 1: زيادة المنتج القديم في الفرع ======
        var { data: oldStock, error: oldError } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", oldProductId)
            .maybeSingle();

        if (oldError) throw oldError;

        var oldCurrentQty = (oldStock && oldStock.quantity) || 0;
        var oldNewQty = oldCurrentQty + quantity; // العميل رجع القديم

        if (oldStock) {
            await supabaseClient
                .from("branch_stock")
                .update({ quantity: oldNewQty })
                .eq("branch_id", branchId)
                .eq("product_id", oldProductId);
        } else {
            await supabaseClient.from("branch_stock").insert({
                branch_id: branchId,
                product_id: oldProductId,
                quantity: quantity
            });
        }

        // ====== الخطوة 2: نقص المنتج الجديد من الفرع ======
        var { data: newStock, error: newError } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", branchId)
            .eq("product_id", newProductId)
            .maybeSingle();

        if (newError) throw newError;

        var newCurrentQty = (newStock && newStock.quantity) || 0;
        var newNewQty = Math.max(0, newCurrentQty - quantity); // العميل أخذ الجديد

        if (newStock) {
            await supabaseClient
                .from("branch_stock")
                .update({ quantity: newNewQty })
                .eq("branch_id", branchId)
                .eq("product_id", newProductId);
        } else {
            await supabaseClient.from("branch_stock").insert({
                branch_id: branchId,
                product_id: newProductId,
                quantity: 0
            });
        }

        // ====== الخطوة 3: ✅ تحديث المخزن الرئيسي ======
        // 3أ: المخزن يستقبل المنتج القديم (العميل رجعه) - يزيد
        var { data: warehouseOld, error: warehouseOldError } = await supabaseClient
            .from("warehouse_stock")
            .select("quantity")
            .eq("product_id", oldProductId)
            .maybeSingle();

        if (warehouseOldError && warehouseOldError.code !== "PGRST116") throw warehouseOldError;

        var warehouseOldQty = (warehouseOld && warehouseOld.quantity) || 0;
        var newWarehouseOldQty = warehouseOldQty + quantity;

        if (warehouseOld) {
            await supabaseClient
                .from("warehouse_stock")
                .update({ quantity: newWarehouseOldQty })
                .eq("product_id", oldProductId);
        } else {
            await supabaseClient.from("warehouse_stock").insert({
                product_id: oldProductId,
                quantity: quantity
            });
        }

        // 3ب: المخزن ينقص المنتج الجديد (العميل أخذه) - ينقص
        var { data: warehouseNew, error: warehouseNewError } = await supabaseClient
            .from("warehouse_stock")
            .select("quantity")
            .eq("product_id", newProductId)
            .maybeSingle();

        if (warehouseNewError && warehouseNewError.code !== "PGRST116") throw warehouseNewError;

        var warehouseNewQty = (warehouseNew && warehouseNew.quantity) || 0;
        var newWarehouseNewQty = Math.max(0, warehouseNewQty - quantity);

        if (warehouseNew) {
            await supabaseClient
                .from("warehouse_stock")
                .update({ quantity: newWarehouseNewQty })
                .eq("product_id", newProductId);
        } else {
            await supabaseClient.from("warehouse_stock").insert({
                product_id: newProductId,
                quantity: 0
            });
        }

        // ====== الخطوة 4: تسجيل الحركات ======
        var { data: userData } = await supabaseClient.auth.getUser();
        var userId = null;
        if (userData && userData.user && userData.user.id) {
            userId = userData.user.id;
        }

        // حركة مرتجع القديم
        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: branchId,
            to_branch_id: null,
            product_id: oldProductId,
            quantity: quantity,
            transfer_type: "customer_return",
            notes: notes || "مرتجع استبدال",
            created_by: userId
        });

        // حركة توريد الجديد
        await supabaseClient.from("branch_transfers").insert({
            from_branch_id: null,
            to_branch_id: branchId,
            product_id: newProductId,
            quantity: quantity,
            transfer_type: "exchange",
            notes: notes || "توريد استبدال",
            created_by: userId
        });

        showMessage(msg, "✅ تم الاستبدال بنجاح", "success");

        setTimeout(function() {
            var modalElement = document.getElementById("exchangeModal");
            if (modalElement) {
                var closeBtn = modalElement.querySelector(".btn-close");
                if (closeBtn) closeBtn.click();
            }
            loadTransfers();
        }, 1500);

    } catch (error) {
        console.error("Error:", error);
        showMessage(msg, "❌ فشل الاستبدال: " + error.message, "danger");
    }
}

// =============================================
// جعل الدوال متاحة في النطاق العام
// =============================================

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