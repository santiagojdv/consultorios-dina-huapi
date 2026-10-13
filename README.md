# Consultorios Dina Huapi

Sitio de una página para Consultorios Dina Huapi: consultorio odontológico equipado en alquiler por paquetes de horas para profesionales.

## Cómo editarlo

- Todo el sitio está en `index.html` (HTML y CSS en un solo archivo, sin dependencias).
- Desde cualquier dispositivo: abrí el archivo en github.com y tocá el lápiz (Edit). Para cambios grandes, apretá `.` en el repo y se abre un editor completo en el navegador.
- Lo resaltado en violeta (`class="ph"`) son datos a completar. Buscá `ph"` para encontrarlos todos.
- Los colores están al principio del `<style>`, en el bloque `:root`.

## Publicarlo

Settings → Pages → Branch `main`, carpeta `/ (root)`. Queda en https://santiagojdv.github.io/consultorios-dina-huapi/.

## Sistema de turnos (`turnos/`)

Turnos online para pacientes y agenda para profesionales, sobre el mismo GitHub Pages. La base de datos y el login los pone [Supabase](https://supabase.com) (plan gratuito).

- `turnos/index.html` — página pública: el paciente elige profesional, día y horario. Cada profesional tiene su link directo (`turnos/index.html?p=…`).
- `turnos/cancelar.html` — el paciente ve o cancela su turno con el link que recibe al reservar.
- `turnos/panel.html` — profesionales (agenda, calendario consolidado de todos los consultorios, turnos manuales, perfil, ausencias, link para Google Calendar) y administración (consultorios, alquileres mensuales, profesionales).
- `supabase/functions/calendario/` — entrega el calendario de cada profesional (.ics) para suscribirse desde Google Calendar o iPhone.
- `supabase/schema.sql` — tablas, reglas y permisos. Las reglas críticas (sin superposiciones, turnos solo dentro de horarios alquilados, cada profesional ve solo a sus pacientes) las garantiza la base, no la página.

### Puesta en marcha (una sola vez, ~20 minutos)

1. Crear un proyecto gratuito en supabase.com (región São Paulo, la más cercana).
2. **SQL Editor** → pegar todo `supabase/schema.sql` → Run.
3. **Authentication → Sign In / Providers**: dejar Email activo y **desactivar "Allow new users to sign up"** (solo entra quien invites).
4. **Authentication → URL Configuration**: en *Site URL* y en *Redirect URLs* poner `https://santiagojdv.github.io/consultorios-dina-huapi/turnos/panel.html`.
5. **Authentication → Users → Invite user** con tu email. Después, en SQL Editor:
   `update profesionales set es_admin = true where email = 'tu@email.com';`
6. **Project Settings → API**: copiar *Project URL* y la *anon / publishable key* en `turnos/config.js`. La anon key es pública por diseño; **nunca** pegues la `service_role`.
7. **Edge Functions → Deploy a new function → Via editor**: nombre `calendario`, pegar `supabase/functions/calendario/index.ts`, y **desactivar "Enforce JWT verification"** (Google Calendar no manda credenciales; el secreto es el token del link). Con la CLI: `supabase functions deploy calendario` (toma `supabase/config.toml`).
8. Entrar a `turnos/panel.html` → Administración: cargar consultorios, invitar profesionales (paso 5, sin el `update`) y cargar sus alquileres. Cada profesional completa "Mi perfil" y activa "Aceptar turnos online".

### Límites conocidos

- **Plan gratuito de Supabase**: pausa el proyecto tras ~1 semana sin uso (se reactiva desde el panel) y no incluye backups automáticos. El envío de mails de login del servidor por defecto es muy limitado: para uso real, configurar SMTP propio en *Authentication → Emails*.
- **Google Calendar actualiza los calendarios suscriptos cada varias horas**, no al instante (lo decide Google). El panel siempre está al día.
- **Sin notificaciones automáticas**: el profesional ve los turnos nuevos en su agenda; el recordatorio al paciente es un botón de WhatsApp. Mails/recordatorios automáticos serían una segunda etapa.
- **Antispam básico**: máximo 2 turnos futuros por teléfono por profesional (4 en total). Si aparece abuso, agregar un captcha (Cloudflare Turnstile).
- **Datos personales**: solo se piden nombre, teléfono y email. No cargar datos clínicos en notas. Conviene publicar una política de privacidad y registrar la base ante la AAIP (Ley 25.326).
