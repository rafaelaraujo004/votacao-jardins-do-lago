// Tema claro/escuro do painel da comissão.
// Sem escolha salva, o tema segue o sistema operacional (prefers-color-scheme no app.css).
// Carregado no <head>, antes da página, para não piscar o tema errado.
// Usa arquivo próprio porque a CSP do site não permite script inline.
(function () {
  'use strict';
  var CHAVE = 'jardins-tema';
  var raiz = document.documentElement;
  var escuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function lerSalvo() {
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }
  function salvar(valor) {
    try { localStorage.setItem(CHAVE, valor); } catch (e) { /* armazenamento bloqueado: segue só nesta página */ }
  }
  function temaAtual() {
    if (raiz.dataset.theme === 'light' || raiz.dataset.theme === 'dark') return raiz.dataset.theme;
    return escuro && escuro.matches ? 'dark' : 'light';
  }
  function aplicar(tema) {
    if (tema === 'light' || tema === 'dark') raiz.dataset.theme = tema;
    else delete raiz.dataset.theme;
  }

  var salvo = lerSalvo();
  if (salvo === 'light' || salvo === 'dark') aplicar(salvo);

  document.addEventListener('DOMContentLoaded', function () {
    var botao = document.querySelector('[data-tema]');
    if (!botao) return;
    function rotular() {
      var proximo = temaAtual() === 'dark' ? 'claro' : 'escuro';
      botao.textContent = 'Modo ' + proximo;
      botao.setAttribute('aria-label', 'Mudar para o modo ' + proximo);
    }
    botao.addEventListener('click', function () {
      var novo = temaAtual() === 'dark' ? 'light' : 'dark';
      aplicar(novo);
      salvar(novo);
      rotular();
    });
    rotular();
  });
})();
