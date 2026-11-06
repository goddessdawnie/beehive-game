/* No offline fetch interception or caching: existing Beehive behavior stays unchanged. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload={};
  try { payload=event.data?event.data.json():{}; } catch { payload={body:event.data?event.data.text():''}; }
  const title=typeof payload.title==='string'?payload.title.slice(0,120):'Beehive';
  const body=typeof payload.body==='string'?payload.body.slice(0,500):'Your Beehive timer is ready.';
  event.waitUntil(self.registration.showNotification(title,{
    body,icon:'./icons/beehive-192.png',badge:'./icons/beehive-192.png',
    tag:typeof payload.tag==='string'?payload.tag.slice(0,120):'beehive-notification'
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const destination=new URL('./',self.registration.scope).href;
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const win of windows)if(win.url.startsWith(self.registration.scope)&&'focus' in win)return win.focus();
    return clients.openWindow(destination);
  })());
});
