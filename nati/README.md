# Natalia Cárdenas · Ortodoncia & Estética Facial

Sitio de una página para la Od. Natalia F. Cárdenas, hecho con el manual de marca v3 (Anto Creativa, octubre 2026).

- `index.html`: todo el sitio (HTML, CSS y JS sin dependencias; tipografías Cormorant Garamond + Poppins desde Google Fonts).
- `img/`: imágenes tomadas de las aplicaciones del manual (renders ilustrativos). Reemplazar por fotos reales del consultorio cuando estén.
- `marca/logo.svg` y `marca/isotipo.svg`: logo vectorial extraído del PDF del manual (azul marino #2B3B5A).

Datos a confirmar antes de publicar: WhatsApp (+54 9 294 463-6977 figura en la firma de email del manual), matrícula (M.P.), obras sociales y prepagas con las que trabaja, horarios.

Destino por defecto: carpeta `nati/` del repo santiagojdv/consultorios-dina-huapi (sitio de la clínica, PR #3). Copiar `index.html`, `img/` y `marca/` tal cual: todas las rutas son relativas y el pie vuelve a la clínica con `../`. La preview en Artifact usa el link absoluto a la clínica.

El botón "Reservar online" (solo en esta versión del repo) apunta a `../turnos/index.html`. Cuando exista el id de Nati en Supabase, cambiarlo por `../turnos/index.html?p=<uuid>`.
