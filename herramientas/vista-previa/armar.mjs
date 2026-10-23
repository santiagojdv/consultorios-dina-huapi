// Arma un único HTML autocontenido con el sitio (portada, página de Nati, profesionales y turnos en modo demo).
// Uso: node build-nati.mjs <repo> <salida.html>
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const [repo, salida] = process.argv.slice(2);
const PAGINAS = ['nati/index.html', 'index.html', 'profesionales/index.html', 'turnos/index.html', 'turnos/panel.html', 'turnos/cancelar.html'];
const tmp = mkdtempSync(join(tmpdir(), 'nati-'));

const cacheImg = new Map();
function dataUri(abs) {
  if (cacheImg.has(abs)) return cacheImg.get(abs);
  const ext = extname(abs).toLowerCase();
  let uri;
  if (ext === '.svg') uri = 'data:image/svg+xml;base64,' + readFileSync(abs).toString('base64');
  else {
    // recomprime para que el archivo no pese de más
    const out = join(tmp, cacheImg.size + '.jpg');
    execFileSync('python3', ['-c', `
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); im.thumbnail((1100,1100)); im.save(sys.argv[2],quality=74,optimize=True,progressive=True)`, abs, out]);
    uri = 'data:image/jpeg;base64,' + readFileSync(out).toString('base64');
  }
  cacheImg.set(abs, uri);
  return uri;
}

const esLocal = (u) => !/^(https?:|data:|#|mailto:|tel:)/.test(u);

async function bundle(code, dir) {
  const entry = join(repo, dir, `__entrada_${Math.random().toString(36).slice(2)}.js`);
  writeFileSync(entry, code);
  try {
    const r = await esbuild.build({
      entryPoints: [entry], bundle: true, format: 'esm', write: false, target: 'es2022', minify: true,
      external: ['https://*'],
      define: { location: '__LOC', history: '__HIST' },
      logLevel: 'error',
    });
    return r.outputFiles[0].text;
  } finally {
    execFileSync('rm', ['-f', entry]);
  }
}

const paginas = {};
for (const pag of PAGINAS) {
  const dir = dirname(pag) === '.' ? '' : dirname(pag);
  const base = join(repo, dir);
  let html = readFileSync(join(repo, pag), 'utf8');

  // hojas de estilo locales -> <style>, con sus url() embebidas
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
    if (!esLocal(href)) return m;
    const abs = resolve(base, href);
    const css = readFileSync(abs, 'utf8').replace(/url\(([^)#]+?)\)/g, (mm, u) => {
      u = u.replace(/['"]/g, '');
      return esLocal(u) && existsSync(resolve(dirname(abs), u)) ? `url(${dataUri(resolve(dirname(abs), u))})` : mm;
    });
    return `<style>${css}</style>`;
  });
  // íconos, manifiesto y precargas no hacen falta
  html = html.replace(/<link rel="(icon|manifest|preload|apple-touch-icon)"[^>]*>/g, '');
  // imágenes
  html = html.replace(/(src|poster)="([^"]+\.(?:jpe?g|png|svg|webp))"/g, (m, attr, u) => {
    const abs = resolve(base, u);
    return esLocal(u) && existsSync(abs) ? `${attr}="${dataUri(abs)}"` : m;
  });
  html = html.replace(/url\((['"]?)([^)'"#]+\.(?:jpe?g|png|svg))\1\)/g, (m, q, u) => {
    const abs = resolve(base, u);
    return existsSync(abs) ? `url(${dataUri(abs)})` : m;
  });
  // scripts de módulo -> un solo bloque empaquetado
  const scripts = [...html.matchAll(/<script type="module"(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)];
  for (const s of scripts) {
    const code = s[1] ? `import './${s[1]}';` : s[2];
    const js = (await bundle(code, dir)).replace(/<\/script/gi, '<\\/script');
    html = html.replace(s[0], () => `<script type="module">${js}</script>`);
  }
  paginas[pag] = html;
}

const shell = readFileSync(new URL('./nati-shell.html', import.meta.url), 'utf8')
  .replace('/*PAGINAS*/', () => JSON.stringify(paginas).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'));
writeFileSync(salida, shell);
console.log(salida, (Buffer.byteLength(shell) / 1e6).toFixed(2) + ' MB');
