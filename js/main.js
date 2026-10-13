/* ==========================================================================
   KOA — MAIN JS (Fase 1: Home)
   Responsable únicamente de:
   1) Menú hamburguesa funcional (móvil / tablet)
   2) Estado "scrolled" de la navbar
   No incluye lógica de backend, datos ni panel administrativo.
   ========================================================================== */

(function () {
  "use strict";

  var navbar = document.getElementById("navbar");
  var navToggle = document.getElementById("navToggle");
  var primaryNav = document.getElementById("primary-navigation");

  if (!navbar || !navToggle || !primaryNav) return;

  function openMenu() {
    primaryNav.classList.add("is-open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Cerrar menú de navegación");
  }

  function closeMenu() {
    primaryNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir menú de navegación");
  }

  function isMenuOpen() {
    return primaryNav.classList.contains("is-open");
  }

  navToggle.addEventListener("click", function () {
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  /* Cerrar el menú al elegir un enlace (útil en móvil) */
  primaryNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (isMenuOpen()) closeMenu();
    });
  });

  /* Cerrar el menú con la tecla Escape */
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isMenuOpen()) {
      closeMenu();
      navToggle.focus();
    }
  });

  /* Cerrar el menú al hacer clic fuera de la navbar */
  document.addEventListener("click", function (event) {
    if (isMenuOpen() && !navbar.contains(event.target)) {
      closeMenu();
    }
  });

  /* Navbar sólida al hacer scroll */
  var SCROLL_THRESHOLD = 24;

  function updateNavbarState() {
    if (window.scrollY > SCROLL_THRESHOLD) {
      navbar.classList.add("navbar--scrolled");
    } else {
      navbar.classList.remove("navbar--scrolled");
    }
  }

  window.addEventListener("scroll", updateNavbarState, { passive: true });
  updateNavbarState();
})();
