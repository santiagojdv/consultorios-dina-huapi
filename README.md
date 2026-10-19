# Consultorios Dina Huapi

Sitio de Consultorios Dina Huapi: portada de la clínica para pacientes, alquiler de consultorio para profesionales, tienda de insumos y sistema de turnos. HTML estático, sin build, publicado en GitHub Pages.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | Portada de la clínica: tratamientos, equipo, consultorio, ubicación, preguntas, CTA a turnos |
| `profesionales/` | Alquiler: modalidades, qué incluye, agenda online, comparativa, pedido de visita |
| `insumos/` | **Offline por ahora** (sin links desde el sitio y con `noindex`). Catálogo con carrito; el pedido se envía armado por WhatsApp. Para activarlo, volver a enlazarlo desde el menú y quitar el `noindex` |
| `turnos/` | Reserva de pacientes y panel de profesionales (ver abajo) |
| `assets/sitio.css`, `assets/sitio.js` | Sistema visual compartido (manual de marca v3) y comportamiento común |
| `img/` | Imágenes. Las actuales son **ilustrativas**: reemplazarlas por fotos reales con el mismo nombre |
| `nati/` | Sitio de la Dra. Natalia Cárdenas |
| `docs/mapa-del-sitio.md` | Mapa del sitio (copia del FigJam) |

## Cómo editarlo

- **Número de WhatsApp**: `assets/sitio.js`, constante `WHATSAPP` (formato `5492944xxxxxx`, sin `+` ni espacios). Todos los botones de consulta, visitas y pedidos de insumos lo usan.
- **Datos a completar**: lo subrayado en punteado (`class="ph"`) son datos pendientes (horarios, obras sociales, precios, matrícula). Buscá `ph"` para encontrarlos.
- **Equipo de la portada**: se arma solo con los profesionales que aceptan turnos online. Cada uno completa en el panel, en *Mi perfil*, su nombre, especialidad, presentación, sitio web y foto, y la ficha lleva a su agenda (`turnos/index.html?p=…`) y a su sitio. Si el sistema de turnos no está configurado, se ve la ficha fija de Nati que está en `index.html`.
- **Insumos**: todo sale de `insumos/catalogo.json`. Cada producto es una línea: `precio` en pesos sin puntos (o `null` para mostrar "Precio a confirmar"), `stock` true/false, `destacado` para la etiqueta "Más pedido", `variantes` para talles o colores, `matricula` si exige matrícula. La foto sale de `img/insumos/` por categoría o por el campo `foto`.
- **Colores y tipografías**: bloque `:root` al principio de `assets/sitio.css`. Navy `#2B3B5A`, petróleo `#127285`, grafito `#4B5668`; Cormorant Garamond para títulos y Poppins para texto.
- Desde cualquier dispositivo: abrí el archivo en github.com y tocá el lápiz (Edit). Para cambios grandes, apretá `.` en el repo y se abre un editor completo en el navegador.

## Publicarlo

Settings → Pages → Branch `main`, carpeta `/ (root)`. Queda en https://santiagojdv.github.io/consultorios-dina-huapi/.

## Sistema de turnos (`turnos/`)

Turnos online para pacientes y agenda para profesionales, sobre el mismo GitHub Pages. La base de datos y el login los pone [Supabase](https://supabase.com) (plan gratuito).

- `turnos/index.html` — página pública: el paciente elige profesional, día y horario. Cada profesional tiene su link directo (`turnos/index.html?p=…`).
- `turnos/cancelar.html` — el paciente ve o cancela su turno con el link que recibe al reservar.
- `turnos/panel.html` — profesionales (agenda, calendario consolidado de todos los consultorios, turnos manuales, perfil, ausencias, link para Google Calendar) y administración (consultorios, alquileres mensuales, profesionales).
- `supabase/functions/calendario/` — entrega el calendario de cada profesional (.ics) para suscribirse desde Google Calendar o iPhone.
- `supabase/schema.sql` — tablas, reglas y permisos. Las reglas críticas (sin superposiciones, turnos solo dentro de horarios alquilados, cada profesional ve solo a sus pacientes) las garantiza la base, no la página.

### Modo demostración

Mientras `turnos/config.js` esté vacío, las tres páginas funcionan con una base simulada (`turnos/demo.js`) que respeta las mismas reglas que la real: se puede reservar como paciente, cancelar, entrar al panel como la Dra. Cárdenas o como Administración y asignar alquileres. Los datos quedan solo en el navegador de quien prueba y una franja amarilla avisa que es una demostración. Al completar `config.js`, la demo se apaga sola.

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
