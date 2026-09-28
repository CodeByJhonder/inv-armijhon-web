# Configuracion de Supabase

## 1. Crear el proyecto

1. Crear un proyecto en Supabase.
2. Abrir **SQL Editor**.
3. Ejecutar `supabase/schema.sql` completo.
4. En **Authentication > Users**, crear el usuario administrador.
5. En **Project Settings > API**, copiar solamente:
   - Project URL
   - Publishable key / anon key

No usar ni compartir la clave `service_role` en el navegador.

## 2. Configurar la pagina

Editar `assets/js/supabase-config.js`:

```javascript
window.SUPABASE_CONFIG = {
    url: 'https://TU-PROYECTO.supabase.co',
    anonKey: 'TU_CLAVE_PUBLICA_ANON'
};
```

La clave publica no reemplaza las politicas RLS ni permite acceso administrativo.

## 3. Datos del comercio pendientes

Antes de activar el checkout se deben definir:

- Nombre del titular o comercio.
- Banco receptor.
- Telefono del Pago Movil.
- Cedula o RIF asociado.
- Numero de cuenta para transferencias.
- Tasa USD/VES y quien la actualiza.
- Limite de comprobante, actualmente 5 MB.

## 3.1 Tasas de cambio automaticas

La pagina consulta gratuitamente `open.er-api.com` para obtener USD/COP y USD/VES.
Se actualiza al abrir la pagina y cada 5 minutos. Si no hay internet, usa las tasas
de respaldo definidas en `assets/js/payment-config.js` y muestra el estado al cliente.

Esta fuente no requiere clave ni pago, pero no debe considerarse una cotizacion
bancaria instantanea. Antes de confirmar un pago, verifica la tasa y el monto real.

## 4. Flujo previsto

1. El cliente crea el pedido.
2. Elige Pago Movil o transferencia.
3. El sistema calcula el total en VES.
4. Se crea un pedido con estado `pending`.
5. El cliente carga el comprobante al bucket privado.
6. El administrador inicia sesion desde su PC.
7. Revisa el comprobante y cambia el estado a `approved`, `rejected` o `completed`.

La verificacion automatica del pago no se puede garantizar sin una API bancaria; el panel esta pensado para verificacion manual segura.

## 5. Publicar la Edge Function

La pagina usa `supabase/functions/create-order/index.ts` para recibir pedidos y comprobantes sin exponer la clave `service_role`.

Con Supabase CLI instalado y autenticado:

```bash
supabase link --project-ref ygfzwqhelhpfxtknybra
supabase functions deploy create-order
```

La funcion usa automaticamente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno seguro de Supabase.

## 6. Activar el chat de atención

El chat guarda el nombre, teléfono y mensajes del cliente en Supabase. El cliente retoma
su conversación desde el mismo navegador y dispositivo; si borra los datos del navegador,
perderá la credencial local para acceder al historial. La clave `service_role` nunca debe
añadirse al sitio ni compartirse.

1. En Supabase **SQL Editor**, ejecutar `supabase/chat-migration.sql` una sola vez.
   Esto crea las tablas, activa RLS y habilita los cambios necesarios para Realtime.
2. Autorizar explícitamente al usuario administrativo del panel para que pueda acceder
   al chat. Reemplazar el correo del ejemplo por el correo exacto que aparece en
   **Authentication > Users** y ejecutar:

   ```sql
   insert into public.chat_admins (user_id)
   select id from auth.users where email = 'CORREO_ADMINISTRADOR'
   on conflict (user_id) do nothing;
   ```

   Verificar que se agregó una fila:

   ```sql
   select user_id from public.chat_admins;
   ```

   Solo los usuarios agregados a `chat_admins` pueden leer conversaciones mediante
   Realtime o usar las acciones administrativas de la función.
3. Desde la raíz del proyecto, vincular el CLI al proyecto correcto si aún no está vinculado:

   ```bash
   supabase link --project-ref ygfzwqhelhpfxtknybra
   ```

4. Desplegar la función:

   ```bash
   supabase functions deploy customer-chat
   ```

   La función usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno administrado
   de Supabase. `supabase/config.toml` desactiva la verificación JWT automática para esta
   función; la propia función valida las sesiones administrativas y el token secreto de
   cada conversación de cliente.
5. Publicar los archivos del sitio actualizados. Iniciar sesión en `admin.html` con el
   usuario administrativo existente para recibir y contestar los chats.
6. Probar el flujo desde una ventana/navegador de cliente y confirmar que el mensaje
   aparece en la sección **Atención por chat** del panel. Mantener la página del panel
   abierta para recibir los eventos Realtime.

No habilitar acceso anónimo directo a las tablas del chat ni copiar la clave `service_role`
en archivos JavaScript, HTML o configuración pública.

## 7. Activar notificaciones push para clientes y administradores

Las notificaciones son opcionales: cada cliente y cada navegador administrador debe
habilitarlas explícitamente desde su botón. Los avisos no contienen el texto del chat.
GitHub Pages y Vercel son orígenes diferentes, por lo que cada uno requiere una
suscripción/permiso independiente.

Esta implementación usa `@negrel/webpush@0.5.0` desde JSR, compatible con el runtime
Deno de Supabase Edge Functions y con Web Crypto. Su mantenedor advierte que la
implementación criptográfica no ha sido revisada por especialistas; se aceptó esta
advertencia para evitar añadir otro proveedor. Evalúa ese riesgo antes de usarla con
información sensible.

1. Desde la raíz del proyecto, genera un par VAPID localmente:

   ```powershell
   node supabase\generate-vapid-keys.cjs
   ```

   El resultado incluye `applicationServerKey` y `vapidKeys`. Conserva el resultado
   solo temporalmente. Copiarás el objeto completo `vapidKeys` a Supabase; no lo
   compartas ni lo subas a GitHub. No generes un par diferente después de activar
   suscripciones existentes.
2. En el panel de Supabase, abre **Project Settings → Edge Functions → Secrets** y
   agrega:
   - `VAPID_KEYS`: el objeto JSON `vapidKeys` que imprimió el generador, incluyendo
     `publicKey` y `privateKey`.
   - `VAPID_SUBJECT`: un contacto válido, por ejemplo `mailto:TU_CORREO_DE_CONTACTO`.

   La clave privada queda en los secretos del servidor. La función entrega al navegador
   solamente la clave pública.
3. En **SQL Editor**, ejecuta `supabase/chat-push-migration.sql`. Esta migración requiere
   que `chat-migration.sql` ya se haya ejecutado. Las suscripciones quedan privadas y
   solo la Edge Function puede consultarlas.
4. Desde la raíz del proyecto, despliega la función actualizada:

   ```powershell
   npx --yes supabase functions deploy customer-chat
   ```

   Debe estar vinculada al proyecto correcto con `supabase link`. No ejecutes este
   comando con una clave VAPID en sus argumentos.
5. Publica las nuevas versiones de los archivos web en GitHub y espera el despliegue de
   Vercel/GitHub Pages:
   - `index.html`, `admin.html`, `politica-privacidad.html`
   - `service-worker.js`, `manifest.webmanifest`
   - `assets/js/admin.js`, `assets/js/chat-push.js`
   - `assets/css/tailwind.min.css`
   - `assets/images/pwa-icon-180.png`, `pwa-icon-192.png` y `pwa-icon-512.png`
6. En el panel, inicia sesión y pulsa **Activar avisos**. En una conversación de cliente,
   pulsa **Activar avisos** y acepta el permiso cuando el navegador lo solicite. La
   conversación debe haberse iniciado en ese mismo dominio/navegador.

### Compatibilidad

- Se detecta la disponibilidad de HTTPS, Service Worker, Push API y Notifications API;
  si falta soporte, el chat seguirá funcionando mientras la página esté abierta.
- En iPhone/iPad se requiere iOS/iPadOS 16.4 o posterior: abre el sitio en Safari,
  usa **Compartir → Añadir a pantalla de inicio** y luego abre el sitio desde ese icono
  antes de activar las notificaciones.
- Si el permiso se bloquea, hay que cambiarlo desde los ajustes del sitio en el navegador
  o dispositivo. El sitio no volverá a mostrar el diálogo automáticamente.
