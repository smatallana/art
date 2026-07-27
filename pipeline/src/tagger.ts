/**
 * Rule-based ontology tagging from museum metadata.
 * Source `meta`: conservative confidences — curated museum taxonomies (AIC
 * subject_titles) score higher than free-text keyword hits. Visual dimensions
 * (mood, light, composition) are mostly left to the CLIP stage; only strong
 * lexical evidence produces a weak tag here.
 */
import type { Tag } from './types.js';

type TagMap = Record<string, Tag>;

/** curated-taxonomy term → dims (confidence 0.75) */
const SUBJECT_TAXONOMY: Record<string, string[]> = {
	portraits: ['subject.portrait', 'subject.figure', 'subject.facevisible'],
	'self-portraits': ['subject.portrait', 'subject.figure', 'subject.facevisible'],
	landscapes: ['subject.landscape', 'subject.nature'],
	seascapes: ['subject.marine', 'subject.landscape'],
	cityscapes: ['subject.cityscape', 'subject.architecture'],
	architecture: ['subject.architecture'],
	interiors: ['subject.interior'],
	'still life': ['subject.stilllife'],
	'still lifes': ['subject.stilllife'],
	animals: ['subject.animal'],
	women: ['subject.figure'],
	men: ['subject.figure'],
	children: ['subject.figure', 'subject.family'],
	'everyday life': ['subject.genre'],
	'genre scenes': ['subject.genre'],
	leisure: ['subject.genre'],
	work: ['subject.labor'],
	'religious scenes': ['subject.religion'],
	christianity: ['subject.religion'],
	saints: ['subject.religion'],
	madonna: ['subject.religion'],
	mythology: ['subject.myth'],
	'mythological figures': ['subject.myth'],
	war: ['subject.war'],
	battles: ['subject.war'],
	history: ['subject.history'],
	'historical scenes': ['subject.history'],
	'night scenes': ['light.nocturne'],
	gardens: ['subject.nature'],
	flowers: ['subject.nature'],
	trees: ['subject.nature'],
	rivers: ['subject.nature', 'subject.landscape'],
	mountains: ['subject.nature', 'subject.landscape']
};

/** free-text keyword (word-boundary regex) → dims (confidence 0.5) */
const KEYWORDS: [RegExp, string[]][] = [
	[/\bportrait\b/i, ['subject.portrait', 'subject.figure']],
	[/\bself-portrait\b/i, ['subject.portrait', 'subject.figure']],
	[/\blandscape\b/i, ['subject.landscape', 'subject.nature']],
	[/\bseascape|harbor|harbour|shipwreck|\bsea\b|\bcoast\b/i, ['subject.marine']],
	[/\bstill life\b|\bbouquet\b|\bvase of\b/i, ['subject.stilllife']],
	[/\binterior\b|\broom\b/i, ['subject.interior']],
	[/\bcity\b|\bstreet\b|\bboulevard\b|\bbridge\b/i, ['subject.cityscape']],
	[/\bcathedral\b|\bchurch\b|\btemple\b|\bruins\b/i, ['subject.architecture']],
	[/\bmadonna\b|\bchrist\b|\bsaint\b|\bcrucifix|\bannunciation\b|\bvirgin\b|\bholy\b/i, ['subject.religion']],
	[/\bvenus\b|\bapollo\b|\bdiana\b|\bnymph\b|\bmyth/i, ['subject.myth']],
	[/\bbattle\b|\bwar\b|\bsoldier|\bcavalry\b/i, ['subject.war']],
	[/\bharvest\b|\blabor|\blabour|\bwasherwomen\b|\bpeasant/i, ['subject.labor', 'subject.genre']],
	[/\bmother\b|\bfamily\b|\bcradle\b|\bchild\b|\bchildren\b/i, ['subject.family', 'subject.figure']],
	[/\bhorse\b|\bdog\b|\bcat\b|\bbird\b|\blion\b|\bcattle\b|\bsheep\b/i, ['subject.animal']],
	[/\bnight\b|\bnocturne\b|\bmoonlight\b|\bmoonlit\b|\bevening\b/i, ['light.nocturne']],
	[/\bwinter\b|\bsnow\b/i, ['subject.landscape']],
	[/\bstorm\b|\btempest\b/i, ['mood.tension', 'mood.drama']],
	[/\bsolitude\b|\balone\b|\bsolitary\b/i, ['mood.solitude']],
	[/\bmartyrdom\b|\bmassacre\b|\bdeath\b/i, ['mood.drama']]
];

/** movement/style name → weak formal hints (confidence 0.4) */
const STYLE_HINTS: Record<string, Record<string, number>> = {
	impressionism: { 'form.brushwork': 0.8, 'form.stylization': 0.45, 'color.saturation': 0.6 },
	'post-impressionism': { 'form.brushwork': 0.85, 'form.stylization': 0.6 },
	expressionism: { 'form.brushwork': 0.85, 'form.stylization': 0.75, 'color.saturation': 0.7 },
	cubism: { 'form.abstraction': 0.75, 'form.geometry': 0.85, 'form.stylization': 0.8 },
	surrealism: { 'mood.strangeness': 0.8, 'narr.implicit': 0.55 },
	realism: { 'form.stylization': 0.2, 'form.abstraction': 0.05 },
	baroque: { 'light.drama': 0.75, 'mood.drama': 0.6 },
	rococo: { 'mood.exuberance': 0.65, 'color.restraint': 0.7 },
	renaissance: { 'form.stylization': 0.25, 'form.brushwork': 0.2 },
	neoclassicism: { 'form.brushwork': 0.15, 'form.line': 0.75, 'form.order': 0.2 },
	romanticism: { 'mood.drama': 0.65, 'light.drama': 0.6 },
	'abstract expressionism': { 'form.abstraction': 0.95, 'form.brushwork': 0.9 },
	minimalism: { 'form.abstraction': 0.9, 'form.complexity': 0.05 },
	'folk art': { 'form.stylization': 0.75 },
	tonalism: { 'color.saturation': 0.2, 'color.restraint': 0.2, 'mood.contemplation': 0.5 },
	luminism: { 'light.natural': 1, 'mood.serenity': 0.55 }
};

function add(tags: TagMap, dim: string, v: number, c: number, src: Tag['src'] = 'meta'): void {
	const existing = tags[dim];
	// Keep the higher-confidence claim; merge equal-confidence by max value.
	if (!existing || c > existing.c) tags[dim] = { v, c, src };
	else if (c === existing.c && v > existing.v) tags[dim] = { v, c, src };
}

export interface TagInput {
	title: string;
	movement: string | null;
	culture: string | null;
	medium: string | null;
	subjects: string[]; // curated taxonomy terms (high trust)
	styles: string[];
	terms: string[]; // free text blobs (low trust)
}

export function tagFromMetadata(input: TagInput): TagMap {
	const tags: TagMap = {};

	// 1. Curated subject taxonomies.
	for (const s of input.subjects) {
		const dims = SUBJECT_TAXONOMY[s.toLowerCase().trim()];
		if (dims) for (const d of dims) add(tags, d, 1, 0.75);
	}

	// 2. Keyword scan over title + free-text terms.
	const textPool = [input.title, ...input.terms].join(' \n ');
	for (const [re, dims] of KEYWORDS) {
		if (re.test(textPool)) {
			for (const d of dims) add(tags, d, d.startsWith('mood.') ? 0.6 : 1, 0.5);
		}
	}

	// 3. Style/movement hints.
	const styleNames = [input.movement, ...input.styles].filter(Boolean) as string[];
	for (const s of styleNames) {
		const hints = STYLE_HINTS[s.toLowerCase().trim()];
		if (hints) for (const [d, v] of Object.entries(hints)) add(tags, d, v, 0.4);
	}

	// 4. Derived: human presence.
	const figureHit = ['subject.portrait', 'subject.figure', 'subject.group'].some(
		(d) => tags[d] && (tags[d] as Tag).v > 0.5
	);
	const nonFigureScene = ['subject.landscape', 'subject.stilllife', 'subject.architecture'].some(
		(d) => tags[d] && (tags[d] as Tag).v > 0.5
	);
	if (figureHit) add(tags, 'subject.humanpresence', 0.85, 0.6);
	else if (nonFigureScene) add(tags, 'subject.humanpresence', 0.15, 0.35);

	// 5. All paintings: medium is categorical context — not tagged here.
	return tags;
}
