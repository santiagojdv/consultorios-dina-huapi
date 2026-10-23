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
| `supabase/functions/whatsapp/`, `turnos/whatsapp.js` | Asistente de WhatsApp y su bandeja en el panel (ver abajo) |

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

- `turnos/index.html` — página pública: el paciente elige profesional, qué necesita (servicio o motivo libre), su cobertura (ve el precio o adicional), día y horario, y deja sus datos (DNI, nombre, nacimiento, teléfono). Cada profesional tiene su link directo (`turnos/index.html?p=…`).
- `turnos/cancelar.html` — el paciente ve o cancela su turno con el link que recibe al reservar.
- `turnos/panel.html` — profesionales (agenda, calendario consolidado de todos los consultorios, turnos manuales, perfil, ausencias, link para Google Calendar) y administración (consultorios, alquileres mensuales, profesionales, servicios, obras sociales, precios e IPC).
- `turnos/planilla.js` — lee la planilla de precios (CSV o Excel) para importarla desde el panel.
- `supabase/functions/calendario/` — entrega el calendario de cada profesional (.ics) para suscribirse desde Google Calendar o iPhone.
- `supabase/functions/ipc/` — baja la variación mensual del IPC (INDEC, vía datos.gob.ar) y la carga en la base.
- `supabase/02_pacientes_y_precios.sql` — fichas de pacientes, servicios, obras sociales, aranceles e IPC. Va después de `schema.sql`.
- `supabase/schema.sql` — tablas, reglas y permisos. Las reglas críticas (sin superposiciones, turnos solo dentro de horarios alquilados, cada profesional ve solo a sus pacientes) las garantiza la base, no la página.

### Modo demostración

Mientras `turnos/config.js` esté vacío, las tres páginas funcionan con una base simulada (`turnos/demo.js`) que respeta las mismas reglas que la real: se puede reservar como paciente, cancelar, entrar al panel como la Dra. Cárdenas o como Administración y asignar alquileres. Los datos quedan solo en el navegador de quien prueba y una franja amarilla avisa que es una demostración. Al completar `config.js`, la demo se apaga sola.

### Pacientes, servicios y precios

- **Ficha por DNI.** Al reservar, el paciente deja DNI, nombre, apellido, nacimiento, teléfono, email, obra social y n.º de afiliado. Si vuelve con el mismo DNI y teléfono, se actualiza su ficha. Si el DNI existe con otro teléfono, no se toca ni se vincula la ficha (podría ser un DNI ajeno) y el turno queda marcado "Revisar" para el profesional. Cada profesional ve solo las fichas de sus pacientes; la administración no las ve.
- **Servicios con duración interna.** El paciente elige un servicio (o "Otro motivo" con texto libre). La duración la define el servicio (o el profesional en "Mis servicios") y decide cuánto ocupa en la agenda; el paciente solo ve horas de inicio.
- **Precios por cobertura.** Por servicio: precio particular y, por obra social, *cubierto*, *copago* (adicional) o *no cubre*. Sin fila para su obra social, el paciente ve el precio particular aclarando que no hay cobertura registrada. El precio informado queda guardado en el turno.
- **Ajuste por IPC.** Cada monto tiene un mes base. Precio de hoy = monto × Π(1 + IPC mensual desde el mes base), redondeado (por defecto a $100). Se usan variaciones mensuales para que un cambio de base de INDEC no rompa la serie. Los valores con "ajusta IPC = No" (ej. lo que paga una obra social por convenio) quedan fijos. "Tomar precios de hoy como nueva base" consolida todo cuando se revisa la lista.
- **Carga.** La lista entera se importa desde una planilla (Administración → Servicios y precios). Plantilla con instrucciones: botón "Descargar plantilla vacía" o la versión Excel que se le pasó a Nati.

### Puesta en marcha (una sola vez, ~20 minutos)

1. Crear un proyecto gratuito en supabase.com (región São Paulo, la más cercana).
2. **SQL Editor** → pegar todo `supabase/schema.sql` → Run. Después, lo mismo con `supabase/02_pacientes_y_precios.sql`.
3. **Authentication → Sign In / Providers**: dejar Email activo y **desactivar "Allow new users to sign up"** (solo entra quien invites).
4. **Authentication → URL Configuration**: en *Site URL* y en *Redirect URLs* poner `https://santiagojdv.github.io/consultorios-dina-huapi/turnos/panel.html`.
5. **Authentication → Users → Invite user** con tu email. Después, en SQL Editor:
   `update profesionales set es_admin = true where email = 'tu@email.com';`
6. **Project Settings → API**: copiar *Project URL* y la *anon / publishable key* en `turnos/config.js`. La anon key es pública por diseño; **nunca** pegues la `service_role`.
7. **Edge Functions → Deploy a new function → Via editor**: nombre `calendario`, pegar `supabase/functions/calendario/index.ts`, y **desactivar "Enforce JWT verification"** (Google Calendar no manda credenciales; el secreto es el token del link). Con la CLI: `supabase functions deploy calendario` (toma `supabase/config.toml`).
8. **IPC automático**: publicar la función `ipc` (`supabase/functions/ipc/index.ts`, sin "Enforce JWT verification"); en *Edge Functions → Secrets* crear `IPC_CLAVE` con una clave larga cualquiera; en *Database → Extensions* activar `pg_cron` y `pg_net`; y correr el `cron.schedule` que está comentado al final de `02_pacientes_y_precios.sql` (reemplazando proyecto y clave). Desde ahí se consulta INDEC del 10 al 20 de cada mes y los precios se actualizan apenas sale el índice. El botón "Buscar índice nuevo en INDEC" del panel hace lo mismo a mano.
9. Entrar a `turnos/panel.html` → Administración: cargar consultorios, invitar profesionales (paso 5, sin el `update`) y cargar sus alquileres. Cada profesional completa "Mi perfil" y activa "Aceptar turnos online".

### Límites conocidos

- **Plan gratuito de Supabase**: pausa el proyecto tras ~1 semana sin uso (se reactiva desde el panel) y no incluye backups automáticos. El envío de mails de login del servidor por defecto es muy limitado: para uso real, configurar SMTP propio en *Authentication → Emails*.
- **Google Calendar actualiza los calendarios suscriptos cada varias horas**, no al instante (lo decide Google). El panel siempre está al día.
- **Sin notificaciones automáticas**: el profesional ve los turnos nuevos en su agenda; el recordatorio al paciente es un botón de WhatsApp. Mails/recordatorios automáticos serían una segunda etapa.
- **Antispam básico**: máximo 2 turnos futuros por teléfono por profesional (4 en total). Si aparece abuso, agregar un captcha (Cloudflare Turnstile).
- **Datos personales**: la ficha guarda DNI, contacto, cobertura y el motivo de consulta que escribe el paciente. Eso es dato de salud (sensible, Ley 25.326): antes de usarlo con pacientes reales hay que publicar una política de privacidad, registrar la base ante la AAIP y no cargar historia clínica acá (tiene sus propias exigencias, Ley 26.529).
- **Planilla en Excel**: la lectura de `.xlsx` baja la librería SheetJS desde jsdelivr al momento de importar; si falla, guardar la planilla como CSV.

## Asistente de WhatsApp

Responde en el WhatsApp del consultorio: preguntas frecuentes, precios según servicio y cobertura, y turnos (dar, consultar y cancelar). Cuando el paciente pide hablar con una persona, hace una pregunta clínica o hay un reclamo, le pasa la conversación a Nati: el asistente deja de responder en ese chat y ella contesta desde el panel.

No tiene datos propios. Usa las mismas funciones que la página de turnos, así que los precios (con IPC), las obras sociales, las duraciones y las reglas de agenda son siempre las mismas que en la web.

- `supabase/functions/whatsapp/index.ts` — recibe los mensajes de WhatsApp (Cloud API oficial de Meta), llama a Claude y manda la respuesta. También envía lo que Nati escribe desde el panel.
- `supabase/functions/whatsapp/asistente.ts` — instrucciones del asistente, herramientas (profesionales, servicios y precios, horarios, reservar, mis turnos, cancelar, derivar) y cómo se ejecuta cada una. Es el mismo archivo que usa la demo.
- `supabase/03_whatsapp.sql` — conversaciones, mensajes, quién atiende la bandeja y las funciones que usa el asistente. Va después de `02_pacientes_y_precios.sql`.
- `turnos/whatsapp.js` — pestaña **WhatsApp** del panel: bandeja con las conversaciones (las derivadas, arriba y marcadas "Para vos"), respuesta, "Tomar la conversación" y "Devolver al asistente". En la vista de administración: encender o apagar el asistente, la información del consultorio que usa y quién atiende la bandeja.
- `herramientas/asistente-demo/` — arma una demo en un solo archivo (teléfono del paciente + bandeja de Nati) para probarlo sin número real.

### Cómo se comporta

- **Turnos**: pregunta qué necesita y la cobertura, muestra el precio, ofrece 3 a 5 horarios reales, pide DNI, nombre y apellido, muestra un resumen y reserva solo después de un "sí". El teléfono es siempre el del chat: un paciente solo puede ver y cancelar sus propios turnos. Los turnos quedan con origen "whatsapp" en la agenda.
- **Precios**: solo los de la lista (nunca inventa). Si la obra social no está, informa el particular.
- **Salud**: no diagnostica ni indica medicación. Ante sangrado que no para, fiebre o hinchazón de cara, indica guardia y deriva.
- **Derivación**: la conversación pasa a "Para vos" con un resumen para Nati, y si está configurado le llega un aviso a otro celular. Con el número en coexistencia, Nati también puede contestar directo desde la app WhatsApp Business: el asistente lo detecta y deja el chat en sus manos. Vuelve sola al asistente después de 24 h sin mensajes (configurable) o cuando Nati toca "Devolver al asistente". Si escribe Nati, la conversación queda en sus manos.
- **Mensajes seguidos**: espera 3 segundos y contesta todo junto. Audios y fotos: pide que lo escriban o que pidan hablar con Nati.
- **Si algo falla** (Claude no responde, error de la API): deriva a Nati y le avisa al paciente.

### Puesta en marcha

**1. Número y cuenta de Meta** (lo hace el dueño de la cuenta, ~1 hora más la aprobación de Meta)
1. Elegir el número. Hay dos caminos:
   - **El número que el consultorio ya usa en la app WhatsApp Business ("coexistencia")**: la app sigue andando en el celular de Nati y el asistente contesta en el mismo número. Meta solo lo habilita a través de un proveedor oficial (BSP o *Tech Provider*, ej. 360dialog), que hace la conexión con su *Embedded Signup* y cobra un abono además de las tarifas de Meta; desde una app propia no se puede. Requisitos: app WhatsApp Business 2.24.17 o más nueva (si hoy está en WhatsApp común, pasarlo a Business primero; conserva los chats), uso sostenido del número (los recién creados no califican) y abrir la app al menos cada 13 días. Al conectarlo se desvinculan los dispositivos (WhatsApp para Windows no vuelve a funcionar), se apagan las listas de difusión, los mensajes temporales y los de una sola vista, y los grupos no pasan al asistente. Se puede importar el historial de los últimos 6 meses. En el webhook hay que suscribir también **smb_message_echoes**, así lo que Nati escribe desde el celular queda guardado y el asistente se calla en ese chat.
   - **Una línea nueva solo para el asistente**: no puede estar en ninguna app de WhatsApp. No necesita proveedor (se hace todo desde Meta, pasos 2 a 7), pero los pacientes tienen que agendar otro número.
2. En business.facebook.com crear el portfolio comercial del consultorio y, si se puede, verificarlo (sube los límites de envío y permite mostrar el nombre).
3. En developers.facebook.com: *Create app* → tipo *Business* → agregar el producto **WhatsApp** → *API Setup* → agregar el número, verificarlo por SMS y cargar el nombre visible ("Consultorios Dina Huapi").
4. En el portfolio, *Usuarios del sistema*: crear uno, asignarle la app y el número, y generar un **token permanente** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
5. Anotar: token permanente, *Phone number ID* (en *API Setup*) y *App secret* (en *App settings → Basic*).
6. (Opcional, para el aviso a Nati) En *WhatsApp Manager → Plantillas*: crear `aviso_derivacion`, categoría *Utilidad*, idioma *Español (ARG)*, con el texto `Hola, {{1}} pidió hablar con una persona en el WhatsApp del consultorio ({{2}}). Entrá al panel para responderle.`
7. Cargar un medio de pago en WhatsApp Manager. Las conversaciones que inicia el paciente no se cobran; las plantillas (el aviso a Nati) sí, unos centavos de dólar cada una.

**2. Supabase**
1. **SQL Editor** → pegar `supabase/03_whatsapp.sql` → Run.
2. **Edge Functions → Deploy a new function → Via editor**: nombre `whatsapp`, pegar `index.ts` y `asistente.ts` (dos archivos), y **desactivar "Enforce JWT verification"**. Con la CLI: `supabase functions deploy whatsapp`.
3. **Edge Functions → Secrets**: `ANTHROPIC_API_KEY` (de console.anthropic.com), `WA_TOKEN`, `WA_PHONE_ID`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` (una palabra larga cualquiera) y, para el aviso, `WA_AVISO_NUMERO` (celular de Nati, ej. `5492944636977`). Opcionales: `CLAUDE_MODELO` (por defecto `claude-opus-5-5`) y `CLAUDE_ESFUERZO` (`low`).
4. En la app de Meta: *WhatsApp → Configuration → Webhook*: *Callback URL* `https://<proyecto>.supabase.co/functions/v1/whatsapp`, *Verify token* el mismo `WA_VERIFY_TOKEN`, y suscribir el campo **messages** (y **smb_message_echoes** si el número está en coexistencia).
5. En el panel → Administración → **WhatsApp**: completar la información del consultorio (horarios, pagos, etc.) y tildar quién atiende la bandeja (Nati).
6. Probar escribiéndole al número desde otro celular.

### Costos y límites

- **Claude**: se paga por uso en console.anthropic.com. Estimación (no medida): entre US$ 0,02 y 0,05 por mensaje del paciente con el modelo por defecto, o sea unos US$ 0,20–0,40 por una conversación completa de turno. Con `CLAUDE_MODELO=claude-haiku-5-5` baja mucho, a costa de respuestas menos finas. Conviene medirlo el primer mes.
- **Ventana de 24 h de WhatsApp**: solo se le puede escribir libremente a un paciente hasta 24 h después de su último mensaje. Pasado eso, el panel no deja enviar hasta que vuelva a escribir.
- **No hay recordatorios automáticos** todavía (necesitan plantillas aprobadas por Meta). Es la siguiente mejora natural.
- **Datos de salud**: las conversaciones pueden tener motivos de consulta. Valen las mismas reglas que las fichas (Ley 25.326): incluirlas en la política de privacidad y en la inscripción ante la AAIP, y definir cuánto tiempo se guardan. Además, el contenido de cada conversación pasa por la API de Claude para generar la respuesta.
- **Audios**: no los transcribe. En Argentina se usan mucho; se puede sumar después.
