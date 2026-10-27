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

// Busca em tabelas longas (ex.: as 220 casas).
document.querySelectorAll('[data-busca-tabela]').forEach(function (campo) {
  var tabela = document.getElementById(campo.dataset.buscaTabela);
  if (!tabela) return;
  var linhas = Array.prototype.slice.call(tabela.querySelectorAll('tbody tr[data-busca]'));
  campo.addEventListener('input', function () {
    var q = campo.value.trim().toLowerCase();
    linhas.forEach(function (tr) {
      var t = tr.dataset.busca;
      tr.hidden = q !== '' && !(t.split(' ')[0] === q || t.indexOf(q) !== -1);
    });
  });
});
