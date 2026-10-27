// Tela de voto: código vindo do link (#ABCD-EFGH), formatação do código e limite de escolhas.
(function () {
  'use strict';
  var input = document.getElementById('codigo');
  function normalizar(v) { return String(v).toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '').slice(0, 8); }
  function formatar(c) { return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; }
  if (input) {
    // O "#" do link nunca chega ao servidor nem aos logs. Depois de usado, some da barra e do histórico.
    var doLink = normalizar(decodeURIComponent((location.hash || '').slice(1)));
    if (doLink.length === 8) {
      input.value = formatar(doLink);
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    input.addEventListener('input', function () {
      var f = formatar(normalizar(input.value));
      if (input.value !== f) input.value = f;
    });
  }
  document.querySelectorAll('fieldset[data-max]').forEach(function (fs) {
    var max = parseInt(fs.dataset.max, 10);
    var branco = fs.querySelector('[data-branco]');
    var contador = fs.querySelector('[data-contador]');
    function cands() { return Array.prototype.slice.call(fs.querySelectorAll('input[name^="c"]')); }
    function atualizar() {
      var marcados = cands().filter(function (i) { return i.checked; }).length;
      if (contador) contador.textContent = marcados;
      if (max > 1) cands().forEach(function (i) { i.disabled = !i.checked && marcados >= max; });
    }
    fs.addEventListener('change', function (e) {
      if (e.target === branco && branco.checked) cands().forEach(function (i) { i.checked = false; });
      else if (e.target !== branco && e.target.checked && branco) branco.checked = false;
      atualizar();
    });
    atualizar();
  });
})();
