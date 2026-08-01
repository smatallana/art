/**
 * audit-kit: generate a self-contained HTML gallery for the HUMAN audit of
 * the curated onboarding collection (fifth external review: every onboarding
 * work manually verified). The HTML runs entirely in the owner's browser —
 * images hotlink from the museums (which the dev sandbox cannot see; that is
 * exactly why the audit is his). Progress persists in localStorage; the
 * export button emits JSON in the data/curated/audit.json schema. There is
 * deliberately NO CI gate until that file exists (owner decision).
 */
import { readFile, writeFile } from 'node:fs/promises';
import type { Work } from './types.js';
import { loadCatalog } from './catalog.js';

interface CuratedEntry {
	id: string;
	stage: 1 | 2 | 3;
	role: string;
	note?: string;
}

interface OpeningFile {
	slots: { name: string; pairs: { a: string; b: string; note?: string }[] }[];
}

function esc(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function workCard(w: Work, e: CuratedEntry): string {
	const meta = [w.date.display, w.medium, w.museum.name]
		.filter((s): s is string => !!s)
		.map(esc)
		.join(' · ');
	const editorial = `stage ${e.stage} · ${e.role}${e.note ? ` · ${esc(e.note)}` : ''}`;
	return `<article class="card" data-id="${esc(w.id)}">
<img src="${esc(w.images.display)}" alt="${esc(w.title)}" loading="lazy">
<div class="body">
<h3>${esc(w.title)}</h3>
<p class="artist">${esc(w.artist.name)}</p>
<p class="meta">${meta}</p>
<p class="editorial">${editorial}</p>
${w.story ? `<p class="story">${esc(w.story)}</p>` : '<p class="story missing">sin microhistoria</p>'}
<p class="links"><a href="${esc(w.museum.url)}" target="_blank" rel="noreferrer">ficha del museo ↗</a> · <code>${esc(w.id)}</code></p>
<div class="checks">
<label><input type="checkbox" data-k="img"> Imagen correcta</label>
<label><input type="checkbox" data-k="meta"> Metadatos correctos</label>
<label><input type="checkbox" data-k="open"> Digna de apertura</label>
<label class="reject"><input type="checkbox" data-k="reject"> Rechazar</label>
<input type="text" data-k="motivo" placeholder="motivo del rechazo" class="motivo">
<input type="text" data-k="notas" placeholder="notas (opcional)" class="notas">
</div>
</div>
</article>`;
}

function pairRow(byId: Map<string, Work>, p: { a: string; b: string; note?: string }): string {
	const cell = (id: string) => {
		const w = byId.get(id);
		if (!w) return `<div class="miss">${esc(id)} — no está en el catálogo</div>`;
		return `<figure><img src="${esc(w.images.thumb)}" alt="${esc(w.title)}" loading="lazy"><figcaption>${esc(w.artist.name)}<br>${esc(w.title)}</figcaption></figure>`;
	};
	return `<div class="pair">${cell(p.a)}<span class="vs">×</span>${cell(p.b)}</div>`;
}

export async function runAuditKit(opts: {
	catalogDir: string;
	onboardingFile: string;
	openingFile: string;
	outFile: string;
	log: (m: string) => void;
}): Promise<void> {
	const { catalogDir, onboardingFile, openingFile, outFile, log } = opts;
	const works = await loadCatalog(catalogDir);
	const byId = new Map(works.map((w) => [w.id, w]));
	const curated = (JSON.parse(await readFile(onboardingFile, 'utf8')) as { works: CuratedEntry[] })
		.works;
	let opening: OpeningFile | null = null;
	try {
		opening = JSON.parse(await readFile(openingFile, 'utf8')) as OpeningFile;
	} catch {
		log(`no opening file at ${openingFile} — pairs section omitted`);
	}

	const missing = curated.filter((e) => !byId.has(e.id));
	for (const e of missing) log(`WARNING: curated id ${e.id} not in catalog — card omitted`);
	const cards = curated
		.filter((e) => byId.has(e.id))
		.map((e) => workCard(byId.get(e.id) as Work, e))
		.join('\n');

	const openingSection = opening
		? `<section id="opening"><h2>Parejas de apertura (data/curated/opening.json)</h2>
<p class="hint">Solo referencia visual: si una pareja no funciona, edita ese archivo directamente — la validación de CI comprueba cada variante contra los filtros reales.</p>
${opening.slots
	.map((s) => `<h3>${esc(s.name)}</h3>` + s.pairs.map((p) => pairRow(byId, p)).join('\n'))
	.join('\n')}</section>`
		: '';

	const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beholder — auditoría humana del onboarding (${curated.length} obras)</title>
<style>
:root{color-scheme:light dark}
body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px;margin-inline:auto}
h1{font-size:1.4rem}h2{margin-top:2rem}
.hint{opacity:.75}
.toolbar{position:sticky;top:0;background:Canvas;padding:8px 0;border-bottom:1px solid color-mix(in srgb,CanvasText 20%,transparent);z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.toolbar .count{font-variant-numeric:tabular-nums}
.card{display:flex;gap:14px;border:1px solid color-mix(in srgb,CanvasText 15%,transparent);border-radius:10px;padding:12px;margin:12px 0}
.card img{width:180px;height:auto;max-height:240px;object-fit:contain;flex:none;align-self:flex-start;background:#222}
.card h3{margin:0}.card .artist{margin:.1em 0;font-weight:600}
.card .meta,.card .editorial,.card .links{margin:.15em 0;font-size:.85rem;opacity:.8}
.card .story{font-style:italic}.card .story.missing{opacity:.5}
.checks{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;align-items:center}
.checks label{white-space:nowrap}
.checks .reject{color:#c33}
.motivo,.notas{flex:1;min-width:180px;padding:4px 6px}
.card.done{outline:2px solid #2a7}
.card.rejected{outline:2px solid #c33}
body.only-pending .card.done,body.only-pending .card.rejected{display:none}
.pair{display:flex;gap:12px;align-items:center;margin:10px 0}
.pair figure{margin:0;width:150px;text-align:center}
.pair img{width:150px;max-height:150px;object-fit:contain;background:#222}
.pair figcaption{font-size:.75rem;opacity:.8}
.pair .vs{font-size:1.4rem;opacity:.6}
#export textarea{width:100%;min-height:160px;font:12px/1.4 ui-monospace,monospace}
button{padding:6px 14px}
</style>
<h1>Beholder — auditoría humana del onboarding</h1>
<p>Revisa cada obra: ¿la imagen es la obra correcta y se ve bien? ¿Título, artista, fecha y museo son correctos (contrasta con la ficha del museo)? Marca <em>Rechazar</em> con motivo si no debería estar en el onboarding. El progreso se guarda en este navegador; al final, <strong>Exportar</strong> y pega el JSON en <code>data/curated/audit.json</code>.</p>
<div class="toolbar">
<span class="count" id="count"></span>
<label><input type="checkbox" id="pending"> Solo pendientes</label>
<button id="export-btn">Exportar JSON</button>
<button id="copy-btn">Copiar</button>
</div>
<section id="works">
${cards}
</section>
${openingSection}
<section id="export"><h2>Exportación</h2><textarea id="out" readonly placeholder="Pulsa Exportar JSON"></textarea></section>
<script>
const KEY='beholder-audit-v1';
const state=JSON.parse(localStorage.getItem(KEY)||'{}');
const cards=[...document.querySelectorAll('.card')];
function reviewed(s){return !!(s&&((s.img&&s.meta)||s.reject));}
function paint(card,s){card.classList.toggle('rejected',!!(s&&s.reject));card.classList.toggle('done',reviewed(s)&&!(s&&s.reject));}
function refreshCount(){const n=cards.filter(c=>reviewed(state[c.dataset.id])).length;document.getElementById('count').textContent=n+' / '+cards.length+' revisadas';}
for(const card of cards){
	const id=card.dataset.id,s=state[id]||{};
	for(const el of card.querySelectorAll('[data-k]')){
		const k=el.dataset.k;
		if(el.type==='checkbox')el.checked=!!s[k];else el.value=s[k]||'';
		el.addEventListener('input',()=>{
			const cur=state[id]||(state[id]={});
			cur[k]=el.type==='checkbox'?el.checked:el.value;
			localStorage.setItem(KEY,JSON.stringify(state));
			paint(card,cur);refreshCount();
		});
	}
	paint(card,s);
}
refreshCount();
document.getElementById('pending').addEventListener('change',e=>document.body.classList.toggle('only-pending',e.target.checked));
function exportJson(){
	const works={};
	for(const card of cards){
		const s=state[card.dataset.id];
		if(!reviewed(s))continue;
		const notes=[s.reject&&s.motivo?s.motivo:'',s.open?'digna de apertura':'',s.notas||''].filter(Boolean).join('; ');
		works[card.dataset.id]=notes?{ok:!s.reject,notes}:{ok:!s.reject};
	}
	const out={version:1,checkedAt:new Date().toISOString(),works};
	document.getElementById('out').value=JSON.stringify(out,null,1);
	return document.getElementById('out').value;
}
document.getElementById('export-btn').addEventListener('click',exportJson);
document.getElementById('copy-btn').addEventListener('click',()=>navigator.clipboard.writeText(exportJson()));
</script>`;

	await writeFile(outFile, html);
	log(
		`wrote ${outFile}: ${curated.length - missing.length} work cards` +
			(opening ? `, ${opening.slots.reduce((a, s) => a + s.pairs.length, 0)} opening pairs` : '')
	);
}
