/* ==========================================================================
   KOA — CARRUSEL DE TORNEOS
   Controla el desplazamiento del carrusel de "Torneos KOA" en el Home.
   Las tarjetas se generan dinámicamente con js/tournaments.js (y el track
   puede estar vacío mientras no haya torneos); por eso lee
   track.children de nuevo en cada update() en lugar de una sola vez, y
   vuelve a ejecutarse cuando recibe el evento "resize" (js/tournaments.js
   dispara uno sintético después de reemplazar las tarjetas).
   ========================================================================== */

(function () {
  "use strict";

  var viewport = document.querySelector(".tournaments__viewport");
  var track = document.querySelector(".tournaments__track");

  if (!viewport || !track) return;

  var prevBtn = document.querySelector('[data-carousel="prev"]');
  var nextBtn = document.querySelector('[data-carousel="next"]');
  var dotsWrap = document.querySelector('[data-carousel="dots"]');
  var controls = document.querySelector(".tournaments__controls");

  var page = 0;
  var pageCount = 1;

  function visibleCount() {
    var w = window.innerWidth;
    if (w <= 640) return 1;
    if (w <= 992) return 2;
    return 3;
  }

  function update() {
    var cards = Array.prototype.slice.call(track.children);
    if (!cards.length) return;

    var perPage = visibleCount();
    pageCount = Math.max(1, Math.ceil(cards.length / perPage));
    if (page > pageCount - 1) page = pageCount - 1;

    var cardWidth = cards[0].getBoundingClientRect().width;
    var gap = parseFloat(getComputedStyle(track).gap) || 0;
    var offset = page * perPage * (cardWidth + gap);
    track.style.transform = "translateX(-" + offset + "px)";

    renderDots();
    toggleArrows();
  }

  function renderDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = "";
    for (var i = 0; i < pageCount; i++) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "tournaments__dot" + (i === page ? " is-active" : "");
      dot.setAttribute("aria-label", "Ir al grupo de torneos " + (i + 1));
      (function (index) {
        dot.addEventListener("click", function () {
          page = index;
          update();
        });
      })(i);
      dotsWrap.appendChild(dot);
    }
  }

  function toggleArrows() {
    if (prevBtn) prevBtn.disabled = pageCount <= 1;
    if (nextBtn) nextBtn.disabled = pageCount <= 1;
    /* Independiente del atributo "hidden" que maneja js/tournaments.js
       (sin tarjetas / cargando / error): aquí solo importa si hay a dónde ir. */
    if (controls) controls.classList.toggle("is-single", pageCount <= 1);
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      page = page > 0 ? page - 1 : pageCount - 1;
      update();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      page = page < pageCount - 1 ? page + 1 : 0;
      update();
    });
  }

  window.addEventListener("resize", update);
  window.addEventListener("load", update);
  update();
})();
