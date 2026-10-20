// Arma la demo del asistente de WhatsApp en un solo HTML (para publicarla como artifact en claude.ai).
// Uso, desde esta carpeta:  npm i esbuild@0.28.2  y después  node armar.mjs ../.. asistente-whatsapp.html
// La demo usa la base simulada de turnos/demo.js y el asistente de supabase/functions/whatsapp/asistente.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const aqui = dirname(fileURLToPath(import.meta.url));
const [repo = join(aqui, '../..'), salida = 'asistente-whatsapp.html'] = process.argv.slice(2);

const r = await esbuild.build({
  entryPoints: [join(aqui, 'app.js')], bundle: true, format: 'esm', write: false, target: 'es2022', minify: true,
  external: ['https://*'], // el cliente real de Supabase no se usa en la demo
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(repo, 'turnos/turnos.css'), 'utf8');
const html = readFileSync(join(aqui, 'plantilla.html'), 'utf8')
  .replace('/*__TURNOS_CSS__*/', () => css)
  .replace('<!--__SCRIPT__-->', () => `<script type="module">${js}</script>`);
writeFileSync(salida, html);
console.log(`${salida}: ${(html.length / 1024).toFixed(0)} KB`);
