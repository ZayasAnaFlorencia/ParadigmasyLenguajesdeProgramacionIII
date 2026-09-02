// ============================================================
// TICKETFLOW — lógica compartida (vanilla JS, sin dependencias)
// - Cuenta regresiva real (setInterval) para los holds de compra
// - Guardia de login: bloquea el acceso directo a checkout.html
// - Manejo simple de "sesión" vía querystring (?user=email)
// ============================================================

(function () {
  const params = new URLSearchParams(location.search);

  // ---------- 1) Cuenta regresiva ----------
  function startCountdown(el) {
    let seconds = parseInt(el.dataset.seconds, 10) || 0;
    const onZero = el.dataset.expiredText || "Tiempo agotado";

    function render() {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      el.textContent = `${m}:${String(s).padStart(2, "0")}`;
    }
    render();

    const tick = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(tick);
        el.textContent = onZero;
        el.classList.add("is-expired");
        document.querySelectorAll("[data-disable-on-expire]").forEach((btn) => {
          btn.setAttribute("disabled", "disabled");
          btn.classList.add("is-disabled");
        });
        return;
      }
      render();
    }, 1000);
  }

  // ---------- 2) Guardia de login ----------
  // Si la página exige sesión y no vino un ?user= en la URL, redirige al login
  // y le pasa `next` para volver acá después de iniciar sesión.
  function enforceAuthGuard() {
    if (!document.body.hasAttribute("data-requires-auth")) return;
    const user = params.get("user");
    if (!user) {
      const here = location.pathname.split("/").pop();
      location.replace(`login.html?next=${encodeURIComponent(here)}`);
    }
  }

  // ---------- 3) Mostrar el usuario "logueado" si vino en la URL ----------
  function paintSessionSlot() {
    const user = params.get("user");
    document.querySelectorAll("[data-user-slot]").forEach((slot) => {
      if (user) {
        slot.textContent = `● ${user}`;
        slot.classList.add("is-logged-in");
      }
    });
  }

  // ---------- 4) Formularios de login / registro ----------
  // Al enviar, simulamos la autenticación y redirigimos a donde corresponda
  // (?next=checkout.html si vinimos forzados desde ahí, o checkout.html por defecto).
  function wireAuthForm(formId, fallbackNext) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value.trim() || "invitado@ticketflow.com";
      const next = params.get("next") || fallbackNext;
      location.href = `${next}?user=${encodeURIComponent(email)}`;
    });
  }

  // ---------- 5) Buscador + chips de categoría (home) ----------
  // Filtra las tarjetas de #eventGrid combinando el texto de #searchInput
  // con la categoría activa de #chipFilters. Usa data-search / data-category
  // que ya vienen en cada .event-card.
  function initSearchAndFilters() {
    const grid = document.getElementById("eventGrid");
    const searchForm = document.getElementById("searchForm");
    const searchInput = document.getElementById("searchInput");
    const chipFilters = document.getElementById("chipFilters");
    const noResults = document.getElementById("noResults");
    if (!grid || !searchInput) return;

    const cards = Array.from(grid.querySelectorAll(".event-card"));
    let activeCategory = "todos";

    function applyFilters() {
      const query = searchInput.value.trim().toLowerCase();
      let visibleCount = 0;

      cards.forEach((card) => {
        const matchesCategory = activeCategory === "todos" || card.dataset.category === activeCategory;
        const haystack = `${card.dataset.search || ""} ${card.textContent}`.toLowerCase();
        const matchesSearch = query === "" || haystack.includes(query);
        const visible = matchesCategory && matchesSearch;
        card.style.display = visible ? "" : "none";
        if (visible) visibleCount += 1;
      });

      if (noResults) noResults.hidden = visibleCount > 0;
    }

    if (searchForm) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        applyFilters();
      });
    }
    // Filtra en vivo mientras se escribe, no solo al apretar "Buscar"
    searchInput.addEventListener("input", applyFilters);

    if (chipFilters) {
      chipFilters.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          chipFilters.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
          chip.classList.add("is-active");
          activeCategory = chip.dataset.filter;
          applyFilters();
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    enforceAuthGuard();
    paintSessionSlot();
    document.querySelectorAll(".js-countdown").forEach(startCountdown);
    wireAuthForm("loginForm", "checkout.html");
    wireAuthForm("registroForm", "checkout.html");
    initSearchAndFilters();

    // Botones "Google" / "Mercado Pago ID" en login: también simulan sesión
    document.querySelectorAll("[data-social-login]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const next = params.get("next") || "checkout.html";
        location.href = `${next}?user=${encodeURIComponent(btn.dataset.socialLogin)}`;
      });
    });
  });
})();
