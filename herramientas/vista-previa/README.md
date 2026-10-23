# Vista previa en un solo archivo

Arma un HTML autocontenido (sin servidor) con la página de Nati, la portada, profesionales y turnos en modo demostración, para mandarlo por WhatsApp o mail.

```sh
npm i esbuild@0.28.2   # una vez, en esta carpeta
node armar.mjs ../.. vista-previa-nati.html
```

Requiere Python 3 con Pillow (recomprime las fotos). Cada página se muestra en un iframe; los links internos y `location` se redirigen al visor, y los turnos de prueba quedan en el navegador de quien lo abre.
