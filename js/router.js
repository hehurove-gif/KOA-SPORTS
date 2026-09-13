/* ==========================================================================
   KOA — ROUTER DE VISTAS (SPA de un solo index.html)
   Responsable únicamente de:
   1) Mostrar una única ".app-view" a la vez (Home, Organización, Jugadores,
      Torneos, Historial), usando "hidden" + aria-hidden + clase ".is-active".
   2) Sincronizar la navegación con el hash de la URL (index.html#jugadores,
      index.html#torneos, index.html#organizacion, index.html#historial).
   3) Resolver también anclas internas de una vista (p.ej. "#quienes-somos"
      dentro de Home, o "#proximos" dentro de Torneos): activa la vista que
      contiene ese elemento (si no lo está ya) y hace scroll hasta él.
   No depende de datos, backend ni frameworks.
   ========================================================================== */

(function () {
  "use strict";

  var VIEWS = ["home", "organizacion", "jugadores", "torneos", "historial"];

  var views = {};
  VIEWS.forEach(function (name) {
    views[name] = document.getElementById("view-" + name);
  });

  var navLinks = document.querySelectorAll(".navbar__link");

  if (!views.home) return;

  var currentView = "home";

  function setActiveNavLink(viewName) {
    navLinks.forEach(function (link) {
      var isMatch = link.getAttribute("href") === "#" + viewName;
      link.classList.toggle("is-active", isMatch);
    });
  }

  /* Activa una vista concreta (oculta el resto). No mueve el scroll por sí
     sola: quien la invoque decide si hay que ir arriba o a un ancla. */
  function activateView(viewName) {
    if (!views[viewName] || viewName === currentView) return;

    VIEWS.forEach(function (name) {
      var section = views[name];
      if (!section) return;
      if (name === viewName) {
        section.hidden = false;
        section.setAttribute("aria-hidden", "false");
        section.classList.add("is-active");
      } else {
        section.hidden = true;
        section.setAttribute("aria-hidden", "true");
        section.classList.remove("is-active");
      }
    });

    currentView = viewName;
    setActiveNavLink(viewName);

    /* El carrusel de torneos vive dentro de Home y calcula anchos con
       getBoundingClientRect(); si el navegador se redimensionó mientras
       Home estaba oculto, esos anchos quedaron mal. Un evento "resize"
       sintético hace que carousel.js (sin tocarlo) se recalcule solo. */
    if (viewName === "home") {
      window.setTimeout(function () {
        window.dispatchEvent(new Event("resize"));
      }, 0);
    }
  }

  /* Procesa el hash actual de la URL y decide qué vista mostrar. */
  function handleHash() {
    var raw = window.location.hash.replace(/^#/, "");

    if (!raw) {
      activateView("home");
      window.scrollTo(0, 0);
      return;
    }

    /* Caso 1: el hash es directamente el nombre de una vista. */
    if (VIEWS.indexOf(raw) !== -1) {
      activateView(raw);
      window.scrollTo(0, 0);
      return;
    }

    /* Caso 2: el hash es un ancla interna (p.ej. "quienes-somos",
       "proximos", "unete"...). Buscamos el elemento y activamos la vista
       que lo contiene antes de desplazarnos hasta él. */
    var target = document.getElementById(raw);
    if (!target) {
      activateView("home");
      window.scrollTo(0, 0);
      return;
    }

    var ownerView = target.closest(".app-view");
    var ownerName = ownerView ? ownerView.id.replace(/^view-/, "") : null;

    if (ownerName && VIEWS.indexOf(ownerName) !== -1) {
      activateView(ownerName);
    }

    window.setTimeout(function () {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  window.addEventListener("hashchange", handleHash);
  document.addEventListener("DOMContentLoaded", handleHash);

  /* Si el documento ya estaba cargado cuando se ejecuta este script
     (por ejemplo, script al final del body), procesamos el hash ya mismo. */
  if (document.readyState === "interactive" || document.readyState === "complete") {
    handleHash();
  }
})();
