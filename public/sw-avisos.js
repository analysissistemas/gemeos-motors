/* Avisos no celular (Gêmeos Motors). Recebe o aviso do servidor e mostra; tocar abre a conversa. */
self.addEventListener("push", (evento) => {
  let a = {};
  try {
    a = evento.data ? evento.data.json() : {};
  } catch (e) {
    a = { titulo: "Gêmeos Motors", corpo: evento.data ? evento.data.text() : "" };
  }
  evento.waitUntil(
    self.registration.showNotification(a.titulo || "Gêmeos Motors", {
      body: a.corpo || "",
      tag: a.tag || undefined,
      icon: "/social/icone-180.png",
      badge: "/social/icone-180.png",
      data: { url: a.url || "/sistema" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = new URL((evento.notification.data && evento.notification.data.url) || "/sistema", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ("focus" in j && j.url.startsWith(self.location.origin)) {
          j.navigate(url);
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
