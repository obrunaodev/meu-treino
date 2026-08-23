/* Handler de push, importado pelo service worker gerado pelo Workbox.
   Fica separado porque a estratégia generateSW reescreve o arquivo principal
   a cada build — código nosso ali seria apagado. */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = { title: 'Meu Treino', body: '', url: '/' }
  try {
    payload = { ...payload, ...event.data.json() }
  } catch {
    payload.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Uma tag só: lembretes acumulados viram um aviso, não uma pilha.
      tag: 'treino-lembrete',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reaproveita a aba aberta: abrir uma segunda perderia a sessão em curso.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
