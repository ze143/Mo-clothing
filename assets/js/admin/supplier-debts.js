let paymentModal = null;

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

  paymentModal = new bootstrap.Modal(document.getElementById("paymentModal"));

  await loadSuppliers();
  await loadPayments();
  await calculateDebts();
});

async function loadSuppliers() {
  try {
    const { data, error } = await supabaseClient
      .from("suppliers")
      .select("*")
      .order("name");

    if (error) throw error;

    const select = document.getElementById("paymentSupplier");
    select.innerHTML = '<option value="">اختر المورد</option>';
    data.forEach((supplier) => {
      select.innerHTML += `<option value="${supplier.id}">${supplier.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading suppliers:", error);
    showError("فشل تحميل الموردين");
  }
}

async function loadPayments() {
  try {
    const { data, error } = await supabaseClient
      .from("supplier_payments")
      .select(
        `
                *,
                suppliers(name)
            `,
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const tbody = document.getElementById("paymentsBody");
    if (data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">لا توجد مدفوعات</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map(
        (payment, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${payment.suppliers?.name || "غير معروف"}</td>
                <td><strong>${formatCurrency(payment.amount)}</strong></td>
                <td>${new Date(payment.payment_date).toLocaleDateString("ar")}</td>
                <td>${payment.payment_method || "-"}</td>
                <td>${payment.notes || "-"}</td>
            </tr>
        `,
      )
      .join("");
  } catch (error) {
    console.error("Error loading payments:", error);
    showError("فشل تحميل المدفوعات");
  }
}

async function calculateDebts() {
  try {
    // حساب إجمالي المستحقات (توريدات الموردين)
    const { data: suppliesData, error: suppliesError } = await supabaseClient
      .from("supplier_supplies")
      .select("total");

    if (suppliesError) throw suppliesError;

    const totalDebts = suppliesData.reduce(
      (sum, item) => sum + (item.total || 0),
      0,
    );

    // حساب المدفوعات
    const { data: paymentsData, error: paymentsError } = await supabaseClient
      .from("supplier_payments")
      .select("amount");

    if (paymentsError) throw paymentsError;

    const totalPaid = paymentsData.reduce(
      (sum, item) => sum + (item.amount || 0),
      0,
    );

    // تحديث الإحصائيات
    document.getElementById("totalDebts").textContent =
      formatCurrency(totalDebts);
    document.getElementById("totalPaid").textContent =
      formatCurrency(totalPaid);
    document.getElementById("totalRemaining").textContent = formatCurrency(
      totalDebts - totalPaid,
    );
  } catch (error) {
    console.error("Error calculating debts:", error);
  }
}

async function savePayment() {
  const supplierId = document.getElementById("paymentSupplier").value;
  const amount = parseFloat(document.getElementById("paymentAmount").value);
  const method = document.getElementById("paymentMethod").value;
  const reference = document.getElementById("paymentReference").value.trim();
  const notes = document.getElementById("paymentNotes").value.trim();

  if (!supplierId || !amount || amount <= 0) {
    alert("يرجى اختيار المورد وإدخال مبلغ صحيح");
    return;
  }

  try {
    const { error } = await supabaseClient.from("supplier_payments").insert({
      supplier_id: supplierId,
      amount: amount,
      payment_method: method,
      reference_number: reference,
      notes: notes,
    });

    if (error) throw error;

    showSuccess("تم تسجيل الدفعة بنجاح");
    await loadPayments();
    await calculateDebts();
    paymentModal.hide();
    document.getElementById("paymentForm").reset();
  } catch (error) {
    console.error("Error saving payment:", error);
    alert("فشل تسجيل الدفعة: " + error.message);
  }
}

window.savePayment = savePayment;
