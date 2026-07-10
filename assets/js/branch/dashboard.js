// متغيرات عامة
let currentBranchId = null;
let currentBranchName = "";
let todaySales = [];
let todayDate = new Date().toISOString().split("T")[0];

// تهيئة الصفحة
document.addEventListener("DOMContentLoaded", async function() {
    const user = await checkAuthAndRedirect();
    if (!user) return;

    // التحقق من صلاحيات الفرع
    if (user.profile.role !== "branch_user") {
        alert("غير مصرح لك بالوصول إلى هذه الصفحة");
        window.location.href = "/pages/login.html";
        return;
    }

    currentBranchId = user.profile.branch_id;

    // عرض معلومات المستخدم
    const avatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    const branchName = document.getElementById("branchName");

    avatar.textContent = user.profile.full_name ?
        user.profile.full_name.charAt(0).toUpperCase() :
        "B";
    userName.textContent = user.profile.full_name || "موظف فرع";

    // الحصول على اسم الفرع
    await loadBranchInfo();

    // تحميل المنتجات
    await loadProducts();

    // تحميل مبيعات اليوم
    await loadTodaySales();
    await loadBranchStock(); // ✅ خليها موجودة

    // تحديث الإحصائيات
    await updateStatistics();

    // التعامل مع نموذج إضافة مبيعات
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

async function handleAddSale(e) {
    e.preventDefault();
    e.stopPropagation();

    const productId = document.getElementById("salesProduct").value;
    const quantity = parseInt(document.getElementById("salesQuantity").value);

    if (!productId || !quantity || quantity < 1) {
        showSalesMessage("يرجى اختيار المنتج وإدخال كمية صحيحة", "danger");
        return;
    }

    try {
        // ✅ إضافة المبيعات فقط (من غير خصم المخزون)
        const { data, error } = await supabaseClient
            .from("daily_sales")
            .insert({
                branch_id: currentBranchId,
                product_id: productId,
                quantity: quantity,
                sale_date: todayDate,
                is_closed: false,
            })
            .select();

        if (error) throw error;

        await loadTodaySales();
        // ❌ متستدعيش loadBranchStock() هنا عشان المخزون متغيرش
        await updateStatistics();

        document.getElementById("dailySalesForm").reset();

        showSalesMessage("✅ تم إضافة المبيعات بنجاح", "success");
    } catch (error) {
        console.error("Error adding sale:", error);
        showSalesMessage("❌ فشل إضافة المبيعات: " + error.message, "danger");
    }
}

// حذف مبيعات
async function deleteSale(saleId) {
    if (!confirm("هل أنت متأكد من حذف هذه المبيعات؟")) return;

    try {
        const { error: deleteError } = await supabaseClient
            .from("daily_sales")
            .delete()
            .eq("id", saleId);

        if (deleteError) throw deleteError;

        await loadTodaySales();
        // ❌ متستدعيش loadBranchStock() هنا عشان المخزون متغيرش
        await updateStatistics();

        showSalesMessage("تم حذف المبيعات بنجاح", "success");
    } catch (error) {
        console.error("Error deleting sale:", error);
        showSalesMessage("فشل حذف المبيعات", "danger");
    }
}

// تحميل مخزون الفرع
async function loadBranchStock() {
    try {
        const { data, error } = await supabaseClient
            .from("branch_stock")
            .select(
                `
                *,
                products(name)
            `,
            )
            .eq("branch_id", currentBranchId);

        if (error) throw error;

        const tbody = document.getElementById("branchStockBody");
        if (data.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="2" class="text-center text-muted">لا توجد منتجات في المخزون</td></tr>';
            return;
        }

        tbody.innerHTML = data
            .map(
                (item) => `
            <tr>
                <td>${item.products.name}</td>
                <td>${item.quantity}</td>
            </tr>
        `,
            )
            .join("");
    } catch (error) {
        console.error("Error loading branch stock:", error);
    }
}

async function updateStatistics() {
    try {
        // ✅ مبيعات اليوم (عدد القطع)
        const todayTotal = todaySales.reduce((sum, sale) => sum + sale.quantity, 0);
        document.getElementById("branchTodaySales").textContent = todayTotal;

        // ✅ مخزون الفرع (بيجيب من الداتا بيز)
        const { data: stockData, error: stockError } = await supabaseClient
            .from("branch_stock")
            .select("quantity")
            .eq("branch_id", currentBranchId);

        if (!stockError) {
            const totalStock = stockData.reduce(
                (sum, item) => sum + item.quantity,
                0,
            );
            document.getElementById("branchStock").textContent = totalStock;
        }
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

// ✅ الاستماع لتحديث المخزون من الأدمن
window.addEventListener("storage", function(e) {
    if (e.key === "stockUpdated") {
        console.log("🔄 تم تحديث المخزون من الأدمن");
        loadBranchStock();
        updateStatistics();
    }
});

// جعل deleteSale متاحاً في النطاق العام
window.deleteSale = deleteSale;