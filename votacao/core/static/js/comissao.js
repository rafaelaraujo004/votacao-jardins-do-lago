(function () {
  'use strict';
  var b = document.querySelector('[data-imprimir]');
  if (b) b.addEventListener('click', function () { window.print(); });
  // Confirmação digitada para ações sem volta (ex.: gerar os códigos).
  document.querySelectorAll('form[data-confirmar]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      var campo = f.querySelector('[name=confirmacao]');
      if (campo && campo.value.trim().toUpperCase() !== f.dataset.confirmar) { e.preventDefault(); campo.focus(); }
    });
  });
})();
