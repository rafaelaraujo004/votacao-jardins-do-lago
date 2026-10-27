// Mapa das casas: filtro, busca e detalhe ao tocar. Guarda o filtro entre as atualizações automáticas.
(function () {
  'use strict';
  var mapa = document.getElementById('mapa');
  if (!mapa) return;
  var info = document.getElementById('mapa-info');
  var busca = document.getElementById('mapa-busca');
  var botoes = Array.prototype.slice.call(document.querySelectorAll('[data-filtro]'));
  var lotes = Array.prototype.slice.call(mapa.querySelectorAll('.lote'));
  var filtro = 'todas';
  try { filtro = sessionStorage.getItem('mapa-filtro') || 'todas'; } catch (e) {}

  function aplicar() {
    var q = (busca.value || '').trim().toUpperCase();
    botoes.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)); });
    lotes.forEach(function (l) {
      var votou = l.classList.contains('votou');
      var some = (filtro === 'votou' && !votou) || (filtro === 'falta' && votou);
      l.classList.toggle('apagado', some);
      l.classList.toggle('achado', q !== '' && l.dataset.casa === q);
    });
    var achado = mapa.querySelector('.lote.achado');
    if (achado) { achado.scrollIntoView({ block: 'center', behavior: 'smooth' }); mostrar(achado); }
  }

  function mostrar(l) {
    info.hidden = false;
    info.textContent = 'Casa ' + l.dataset.casa + (l.dataset.hora ? ' · votou às ' + l.dataset.hora : ' · ainda não votou');
    lotes.forEach(function (x) { x.classList.toggle('selecionado', x === l); });
  }

  botoes.forEach(function (b) {
    b.addEventListener('click', function () {
      filtro = b.dataset.filtro;
      try { sessionStorage.setItem('mapa-filtro', filtro); } catch (e) {}
      aplicar();
    });
  });
  busca.addEventListener('input', aplicar);
  mapa.addEventListener('click', function (e) {
    var l = e.target.closest('.lote');
    if (l) mostrar(l);
  });
  aplicar();
})();
