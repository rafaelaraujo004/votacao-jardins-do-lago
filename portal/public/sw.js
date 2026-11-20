/*
 * Service worker do Portal Jardins do Lago.
 * - Recebe as notificações enviadas pelo portal e mostra no celular, mesmo com o portal fechado.
 * - Ao tocar na notificação, abre (ou traz para a frente) o portal na tela certa.
 * Não guarda páginas nem dados no aparelho.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { titulo: "Jardins do Lago", texto: evento.data ? evento.data.text() : "" };
  }
  const url = typeof dados.url === "string" && dados.url.startsWith("/") && !dados.url.startsWith("//") ? dados.url : "/";
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || "Jardins do Lago", {
      body: dados.texto || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      lang: "pt-BR",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL((evento.notification.data && evento.notification.data.url) || "/", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin) && "focus" in janela) {
          return janela.navigate(destino).then((j) => (j || janela).focus());
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
