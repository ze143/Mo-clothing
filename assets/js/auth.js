// التعامل مع تسجيل الدخول
document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const submitButton = this.querySelector('button[type="submit"]');

      // تعطيل الزر أثناء المعالجة
      submitButton.disabled = true;
      submitButton.innerHTML =
        '<i class="fas fa-spinner fa-spin me-2"></i>جاري تسجيل الدخول...';

      // إخفاء رسائل الخطأ السابقة
      loginError.classList.add("d-none");

      try {
        // محاولة تسجيل الدخول
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (error) throw error;

        if (!data.user) {
          throw new Error("لم يتم العثور على المستخدم");
        }

        // الحصول على بيانات الملف الشخصي
        const { data: profile, error: profileError } = await supabaseClient
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile error:", profileError);
          throw new Error("خطأ في تحميل بيانات المستخدم");
        }

        if (!profile) {
          throw new Error("لم يتم العثور على ملف شخصي للمستخدم");
        }

        // توجيه المستخدم حسب دوره
        if (profile.role === "admin") {
          window.location.href = "admin/dashboard.html";
        } else if (profile.role === "branch_user") {
          window.location.href = "branch/dashboard.html";
        } else {
          throw new Error("دور المستخدم غير معروف");
        }
      } catch (error) {
        console.error("Login error:", error);
        loginError.textContent =
          error.message ||
          "فشل تسجيل الدخول. يرجى التحقق من البريد الإلكتروني وكلمة المرور.";
        loginError.classList.remove("d-none");

        // إعادة تفعيل الزر
        submitButton.disabled = false;
        submitButton.innerHTML =
          '<i class="fas fa-sign-in-alt me-2"></i>تسجيل الدخول';
      }
    });
  }
});

// التحقق من المصادقة في الصفحات المحمية مع معالجة أفضل
async function checkAuthAndRedirect() {
  try {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    if (error || !session) {
      window.location.href = "/pages/login.html";
      return null;
    }

    // الحصول على بيانات الملف الشخصي
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile error:", profileError);
      await supabaseClient.auth.signOut();
      window.location.href = "/pages/login.html";
      return null;
    }

    return { user: session.user, profile };
  } catch (error) {
    console.error("Auth check error:", error);
    window.location.href = "/pages/login.html";
    return null;
  }
}

// =============================================
// دوال محسنة للمصادقة
// =============================================

// تسجيل الدخول مع حفظ النشاط
async function loginWithLog(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    // تسجيل نشاط تسجيل الدخول
    await logActivity("login", {
      email: email,
      timestamp: new Date().toISOString(),
    });

    return data;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

// تسجيل الخروج
async function logout() {
  try {
    await supabaseClient.auth.signOut();
    window.location.href = "/pages/login.html";
  } catch (error) {
    console.error("Logout error:", error);
    window.location.href = "/pages/login.html";
  }
}

// جعل الدالة متاحة في النطاق العام
window.logout = logout;

// تسجيل الخروج مع تسجيل النشاط
async function logoutWithLog() {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (user) {
      await logActivity("logout", {
        user_id: user.id,
        timestamp: new Date().toISOString(),
      });
    }
    await supabaseClient.auth.signOut();
    window.location.href = "/pages/login.html";
  } catch (error) {
    console.error("Logout error:", error);
    window.location.href = "/pages/login.html";
  }
}

// جعل الدوال متاحة
window.loginWithLog = loginWithLog;
window.logoutWithLog = logoutWithLog;

// دالة مساعدة لإنشاء مستخدم أدمن (للاستخدام مرة واحدة)
async function createAdminUser(email, password, fullName) {
  try {
    // إنشاء المستخدم
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
    });

    if (error) throw error;

    // إنشاء ملف شخصي للأدمن
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .insert({
        id: data.user.id,
        username: email.split("@")[0],
        full_name: fullName || "مدير النظام",
        role: "admin",
        branch_id: null,
      });

    if (profileError) throw profileError;

    console.log("Admin user created successfully");
    return data.user;
  } catch (error) {
    console.error("Error creating admin:", error);
    throw error;
  }
}

// جعل الدوال متاحة في النطاق العام
window.checkAuthAndRedirect = checkAuthAndRedirect;
window.createAdminUser = createAdminUser;
