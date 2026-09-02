// ============================================================
// TICKETFLOW — lógica compartida (vanilla JS, sin dependencias)
//
// Qué resuelve este archivo:
//   1) Cuenta regresiva real de los holds de compra (setInterval).
//   2) Guardia de login: bloquea el acceso directo a checkout.html
//      si no se inició sesión antes.
//   3) Manejo de "sesión" simple, sin backend: viaja como querystring
//      (?user=email) de página en página. No usamos localStorage ni
//      cookies a propósito, para que todo el estado sea visible en
//      la URL y fácil de inspeccionar/depurar en un prototipo.
//
// Se carga con <script src="app.js"> al final del <body> en cada
// página que lo necesita, y todo arranca en DOMContentLoaded.
// ============================================================

(function () {
  // IIFE (función que se autoejecuta) para no ensuciar el scope global:
  // así ninguna variable de acá pisa nombres de otros scripts.

  // Leemos los parámetros de la URL actual una sola vez al cargar.
  // Ej: si la URL es checkout.html?user=ana@mail.com, params.get("user")
  // devuelve "ana@mail.com".
  const params = new URLSearchParams(location.search);

  // ------------------------------------------------------------
  // 1) CUENTA REGRESIVA
  // ------------------------------------------------------------
  // Recibe el <elemento> que va a mostrar el reloj. Ese elemento debe
  // tener en el HTML:
  //   class="js-countdown"              -> para que se lo detecte y arranque
  //   data-seconds="359"                -> segundos totales de arranque
  //   data-expired-text="Expirado"      -> (opcional) texto al llegar a 0
  function startCountdown(el) {
    // dataset.seconds llega como string ("359"), lo pasamos a número.
    // Si por algún motivo no hay data-seconds, arranca en 0 en vez de
    // romper (|| 0 como fallback defensivo).
    let seconds = parseInt(el.dataset.seconds, 10) || 0;
    const onZero = el.dataset.expiredText || "Tiempo agotado";

    // Formatea `seconds` como "M:SS" y lo escribe en el elemento.
    // No usamos ceros a la izquierda en los minutos (así se ve "5:59"
    // y no "05:59"), pero sí en los segundos (padStart) para que no
    // "salte" el ancho del texto cada vez que baja de 10.
    function render() {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      el.textContent = `${m}:${String(s).padStart(2, "0")}`;
    }

    // Pintamos el valor inicial de inmediato (sin esperar el primer
    // tick del setInterval), para que no haya un parpadeo de 1 segundo
    // en blanco apenas carga la página.
    render();

    // Un tick por segundo: baja el contador y vuelve a pintar.
    // Guardamos el id que devuelve setInterval en `tick` para poder
    // frenarlo con clearInterval cuando llega a 0 (si no, seguiría
    // ejecutándose para siempre en segundo plano).
    const tick = setInterval(() => {
      seconds -= 1;

      if (seconds <= 0) {
        clearInterval(tick); // paramos el reloj, ya llegó a cero

        el.textContent = onZero;
        el.classList.add("is-expired"); // dispara el estilo rojo (ver styles.css)

        // Además de "vencer" el reloj, deshabilitamos cualquier botón
        // marcado con data-disable-on-expire (por ej. "Confirmar y
        // pagar"), para que no se pueda seguir la compra con el hold
        // ya vencido. Buscamos TODOS los que haya en la página, no
        // solo uno, por si en el futuro hay más de un botón sensible
        // al tiempo.
        document.querySelectorAll("[data-disable-on-expire]").forEach((btn) => {
          btn.setAttribute("disabled", "disabled");
          btn.classList.add("is-disabled"); // por si el elemento no es
                                             // un <button>/<input> real
                                             // (ej. es un <a>), donde el
                                             // atributo disabled no alcanza
                                             // y necesitamos la clase CSS
                                             // para bloquear clicks.
        });
        return; // cortamos acá, no seguimos al render() de abajo
      }

      render();
    }, 1000); // 1000ms = 1 segundo. Nota: setInterval no es 100% preciso
              // al milisegundo (el motor del navegador puede demorar un
              // poco cada tick), pero para un reloj visual de UI el
              // margen de error es imperceptible.
  }

  // ------------------------------------------------------------
  // 2) GUARDIA DE LOGIN (con soporte de rol)
  // ------------------------------------------------------------
  // Se ejecuta en TODAS las páginas (se llama siempre desde
  // DOMContentLoaded más abajo), pero solo actúa si la página actual
  // pide autenticación explícitamente con el atributo data-requires-auth
  // en el <body>. Así, este mismo app.js sirve para páginas públicas
  // (home, evento) y protegidas (checkout, backoffice) sin ramificar
  // el archivo.
  //
  // Además de exigir sesión, una página puede exigir un ROL puntual
  // agregando data-requires-role="admin" en el <body> (es el caso de
  // backoffice.html: no alcanza con estar logueado, hay que haber
  // iniciado sesión específicamente como organizador).
  function enforceAuthGuard() {
    if (!document.body.hasAttribute("data-requires-auth")) return;

    const user = params.get("user");
    const role = params.get("role") || "customer"; // sin ?role= en la URL,
                                                     // asumimos el rol por
                                                     // defecto (cliente)
    const requiredRole = document.body.dataset.requiresRole; // undefined
                                                               // si la página
                                                               // no pide un
                                                               // rol específico

    const noHaySesion = !user;
    const rolIncorrecto = requiredRole && role !== requiredRole;

    if (noHaySesion || rolIncorrecto) {
      const here = location.pathname.split("/").pop();

      // Le pasamos a login.html tanto `next` (para saber a dónde volver)
      // como `role` (para que precargue la pestaña correcta y muestre el
      // aviso adecuado — ver setContextNote() más abajo). Si la página
      // no exige un rol puntual, no forzamos ninguno.
      let target = `login.html?next=${encodeURIComponent(here)}`;
      if (requiredRole) target += `&role=${encodeURIComponent(requiredRole)}`;

      // location.replace() (en vez de location.href) para que esta
      // redirección NO quede en el historial del navegador: si el
      // usuario presiona "atrás" desde el login, no vuelve a rebotar
      // a la página protegida y de ahí de nuevo al login en bucle.
      location.replace(target);
    }
  }

  // ------------------------------------------------------------
  // 3) MOSTRAR EL USUARIO "LOGUEADO" EN EL HEADER
  // ------------------------------------------------------------
  // Busca cualquier elemento marcado con data-user-slot (el span del
  // header en checkout.html y en el sidebar de backoffice.html) y, si
  // hay un ?user= en la URL, lo muestra ahí con un punto verde adelante.
  // Si además hay ?role=admin, le agrega la etiqueta "(admin)" para que
  // quede claro con qué tipo de cuenta se entró.
  function paintSessionSlot() {
    const user = params.get("user");
    const role = params.get("role");

    document.querySelectorAll("[data-user-slot]").forEach((slot) => {
      if (user) {
        slot.textContent = `● ${user}${role === "admin" ? " (admin)" : ""}`;
        slot.classList.add("is-logged-in");
      }
      // Si no hay user, dejamos el slot como estaba en el HTML (vacío),
      // en vez de escribir algo tipo "invitado" a la fuerza.
    });
  }

  // ------------------------------------------------------------
  // 4) FORMULARIOS DE LOGIN / REGISTRO
  // ------------------------------------------------------------
  // formId: id del <form> a interceptar ("loginForm" o "registroForm").
  // fallbackNext: a dónde mandar al usuario si no vino un ?next= en la
  // URL (es decir, si entró al login "suelto", no forzado desde otra
  // pantalla) Y además no eligió el rol "organizador" (ver más abajo).
  function wireAuthForm(formId, fallbackNext) {
    const form = document.getElementById(formId);

    // Si esta página no tiene ese formulario (ej: estamos en
    // registro.html y buscamos "loginForm"), no hacemos nada.
    if (!form) return;

    form.addEventListener("submit", (e) => {
      // Frenamos el envío real del form (que recargaría la página o
      // navegaría a una action inexistente) para manejarlo nosotros.
      e.preventDefault();

      // Tomamos el email cargado. Si por algún motivo viniera vacío
      // (no debería pasar por el "required" del input, pero por las
      // dudas), usamos un valor por defecto en vez de mandar "?user="
      // vacío y romper el header de checkout/backoffice.
      const email = form.querySelector('input[type="email"]').value.trim()
        || "invitado@ticketflow.com";

      // El selector de rol (pestañas "Soy cliente" / "Soy organizador")
      // vive AFUERA del <form> en el HTML (es un bloque compartido antes
      // del formulario), así que lo buscamos a nivel documento y no
      // dentro de `form` — si buscáramos con form.querySelector nunca
      // lo iba a encontrar y el rol quedaba siempre en "customer" por
      // más que se tildara "Soy organizador".
      const roleInput = document.querySelector('input[name="role"]:checked');
      const role = roleInput ? roleInput.value : "customer";

      // Si vinimos empujados desde una guardia (asientos.html ->
      // login.html?next=checkout.html, o backoffice.html ->
      // login.html?next=backoffice.html&role=admin), `next` ya viene
      // en la URL y lo respetamos. Si no, elegimos un destino por
      // defecto según el rol elegido: un organizador que entra "suelto"
      // probablemente quiere ir al backoffice, no al checkout.
      const next = params.get("next") || (role === "admin" ? "backoffice.html" : fallbackNext);

      // Simulamos el login: no hay backend real, así que "loguearse"
      // es simplemente navegar a la página siguiente con el email y el
      // rol colgados en la URL. Cualquier página que los lea (ver
      // paintSessionSlot y enforceAuthGuard) los va a tratar como
      // "sesión iniciada con ese rol".
      location.href = `${next}?user=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`;
    });
  }

  // ------------------------------------------------------------
  // 5) CONTEXTO DEL LOGIN: precargar pestaña y aviso según de dónde
  //    vino el usuario (solo aplica en login.html)
  // ------------------------------------------------------------
  // Si llegamos acá porque una guardia nos empujó (ver enforceAuthGuard),
  // la URL trae ?role=admin (cuando el destino era backoffice.html) o
  // ?next=checkout.html (cuando el destino era el checkout). Usamos eso
  // para: (a) dejar tildada la pestaña de rol correcta, y (b) cambiar el
  // texto del aviso arriba del formulario para que explique el motivo.
  function setLoginContext() {
    const requestedRole = params.get("role");
    const next = params.get("next");

    // (a) Pre-tildar el radio de rol correspondiente, si existe en esta
    // página (login.html sí lo tiene, registro.html no).
    if (requestedRole) {
      const radio = document.querySelector(`input[name="role"][value="${requestedRole}"]`);
      if (radio) radio.checked = true;
    }

    // (b) Ajustar el cartel de aviso. Un solo elemento [data-context-note]
    // que cambia de texto según el caso, en vez de tener tres carteles
    // superpuestos en el HTML mostrando/ocultando con CSS.
    const note = document.querySelector("[data-context-note]");
    if (!note) return;

    if (requestedRole === "admin") {
      note.textContent = "🔒 El backoffice requiere una cuenta de organizador.";
      note.style.display = "flex";
    } else if (next) {
      note.textContent = "⏱ Tu selección de asientos se mantiene reservada mientras iniciás sesión.";
      note.style.display = "flex";
    } else {
      // Se entró a login.html directo, sin venir empujado de ningún
      // lado: no hay nada puntual que avisar.
      note.style.display = "none";
    }
  }

  // ------------------------------------------------------------
  // 6) BUSCADOR Y FILTRO POR CATEGORÍA (solo en index.html)
  // ------------------------------------------------------------
  // No hace falta ningún <form>: se filtra en vivo tipeando (evento
  // "input") y también al tocar "Buscar" o un chip de categoría.
  // Todo pasa en el cliente, mostrando/ocultando las .event-card que
  // ya están en el HTML — no se pide nada a un servidor.
  function wireEventSearch() {
    const input = document.getElementById("eventSearch");
    const grid = document.getElementById("eventGrid");

    // Si esta página no tiene buscador (cualquiera que no sea
    // index.html), no hacemos nada.
    if (!input || !grid) return;

    const cards = Array.from(grid.querySelectorAll(".event-card"));
    const noResults = document.getElementById("noResultsMsg");
    const chipsWrap = document.getElementById("categoryChips");
    let activeCategory = "all"; // arranca en "Todos"

    // Saca acentos y pasa a minúsculas, para que buscar "cordoba"
    // encuentre "Córdoba" y "SUPER" encuentre "Súper".
    function normalize(str) {
      return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    }

    function applyFilters() {
      const term = normalize(input.value.trim());
      let visibleCount = 0;

      cards.forEach((card) => {
        // Buscamos el término en todo el texto visible de la card
        // (nombre del show, venue, fecha, tag): así "Roxy" encuentra
        // "Noche de Improvisación" por el venue, no solo por el título.
        const text = normalize(card.textContent);
        const matchesTerm = term === "" || text.includes(term);
        const matchesCategory =
          activeCategory === "all" || card.dataset.category === activeCategory;

        const show = matchesTerm && matchesCategory;
        card.style.display = show ? "" : "none";
        if (show) visibleCount += 1;
      });

      if (noResults) noResults.style.display = visibleCount === 0 ? "block" : "none";
    }

    // Filtra mientras se tipea (sin esperar a tocar "Buscar").
    input.addEventListener("input", applyFilters);

    // El botón "Buscar" es type="button" (no dispara ningún submit);
    // lo dejamos igual por si alguien prefiere tocarlo en vez de que
    // el filtro ya se haya aplicado solo mientras tipeaba.
    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.addEventListener("click", applyFilters);

    // Chips de categoría: al tocar uno, se marca como activo (se le
    // saca la clase a los demás) y se vuelve a filtrar.
    if (chipsWrap) {
      chipsWrap.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          chipsWrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
          chip.classList.add("is-active");
          activeCategory = chip.dataset.category || "all";
          applyFilters();
        });
      });
    }
  }

  // ------------------------------------------------------------
  // 7) RUTEO SEGÚN SESIÓN: index.html (invitado) vs. landing_page.html
  //    (usuario logueado)
  // ------------------------------------------------------------
  // Equivalente a:
  //   if (usuario.estaAutenticado) { renderizar("landing_page.html"); }
  //   else                         { renderizar("index.html"); }
  //
  // Como acá no hay un router de verdad (son archivos .html sueltos),
  // "renderizar" es directamente navegar a ese archivo. Se ejecuta en
  // ambas puntas para que el par quede simétrico:
  //   - parado en index.html con sesión iniciada -> te manda a la landing
  //   - parado en landing_page.html SIN sesión   -> te manda a index.html
  function routeHomeByAuth() {
    const here = location.pathname.split("/").pop() || "index.html";
    const estaAutenticado = Boolean(params.get("user"));

    function renderizar(destino) {
      // replace() y no href: evita que quede una entrada intermedia
      // en el historial (si no, "atrás" te devuelve a una redirección
      // y rebota de nuevo para adelante).
      location.replace(destino + location.search);
    }

    if (here === "index.html" && estaAutenticado) {
      renderizar("landing_page.html");
      return true; // le avisamos a quien nos llamó que ya redirigimos
    }

    if (here === "landing_page.html" && !estaAutenticado) {
      renderizar("index.html");
      return true;
    }

    return false; // esta página se queda como está, seguir con el resto
  }

  // ------------------------------------------------------------
  // ARRANQUE: todo se dispara cuando el HTML ya está parseado
  // ------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    // routeHomeByAuth va primero y devuelve true si redirigió: en ese
    // caso cortamos acá mismo (return) y no seguimos configurando
    // formularios, buscador, etc. sobre una página que ya se está yendo.
    if (routeHomeByAuth()) return;

    // Orden importa: primero la guardia (puede redirigir y cortar
    // todo lo demás), después lo puramente visual.
    enforceAuthGuard();
    paintSessionSlot();
    setLoginContext(); // no hace nada si esta página no tiene el
                        // formulario/aviso de login

    // Puede haber más de un reloj en la misma página (no es el caso
    // hoy, pero el código ya lo soporta): arrancamos uno por cada
    // elemento .js-countdown que exista.
    document.querySelectorAll(".js-countdown").forEach(startCountdown);

    wireAuthForm("loginForm", "checkout.html");
    wireAuthForm("registroForm", "checkout.html");
    wireEventSearch(); // no hace nada fuera de index.html

    // Los botones "Google" / "Mercado Pago ID" en login.html no son
    // <form>, son <a> sueltos con data-social-login="email@simulado".
    // Los tratamos igual que un login exitoso: mismo destino, mismo
    // criterio de `next`, y respetan el rol que esté tildado en las
    // pestañas de arriba (por si alguien entra como organizador y
    // después usa un botón social en vez del formulario).
    document.querySelectorAll("[data-social-login]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const roleInput = document.querySelector('input[name="role"]:checked');
        const role = roleInput ? roleInput.value : "customer";
        const next = params.get("next") || (role === "admin" ? "backoffice.html" : "checkout.html");
        location.href = `${next}?user=${encodeURIComponent(btn.dataset.socialLogin)}&role=${encodeURIComponent(role)}`;
      });
    });
  });
})();
