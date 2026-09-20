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
