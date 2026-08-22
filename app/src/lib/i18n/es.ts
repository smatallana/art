/**
 * Cadenas en español — espejo exacto de en.ts (tipado con `Strings` y
 * verificado por el test de paridad de claves). Los labels de dimensiones y
 * épocas llegan del motor en inglés (son datos, no plantillas): las funciones
 * que los reciben los traducen aquí mismo con el mapa de abajo, con
 * fallback al original si un label nuevo aún no está mapeado.
 * Límite honesto: las microhistorias del catálogo (`work.story`) vienen del
 * pipeline en inglés y no se traducen en este tramo.
 */
import type { InterpretPhrases } from '../engine/profile';
import type { Strings } from './en';

/** Motor → español: labels de dims, polos y épocas (minúsculas). */
const LABELS: Record<string, string> = {
	// épocas (insight.ERA_DIMS)
	'the era before 1500': 'la época anterior a 1500',
	'the 1500s and 1600s': 'los siglos XVI y XVII',
	'the 1700s and early 1800s': 'el siglo XVIII y principios del XIX',
	'the late 1800s': 'finales del siglo XIX',
	'the modern era': 'la era moderna',
	// polos de escalas (ontology.json)
	figurative: 'lo figurativo',
	abstract: 'lo abstracto',
	naturalistic: 'lo naturalista',
	stylized: 'lo estilizado',
	'polished, invisible': 'factura pulida, invisible',
	'visible, gestural': 'pincelada visible, gestual',
	spare: 'lo sobrio',
	intricate: 'lo minucioso',
	minimal: 'lo mínimo',
	dense: 'lo denso',
	ordered: 'lo ordenado',
	chaotic: 'lo caótico',
	organic: 'las formas orgánicas',
	geometric: 'las formas geométricas',
	painterly: 'lo pictórico',
	linear: 'lo lineal',
	smooth: 'las superficies lisas',
	textured: 'las superficies con textura',
	muted: 'las paletas apagadas',
	vivid: 'el color vivo',
	cool: 'los tonos fríos',
	warm: 'los tonos cálidos',
	restrained: 'las paletas contenidas',
	exuberant: 'las paletas exuberantes',
	supporting: 'el color como acompañante',
	protagonist: 'el color protagonista',
	soft: 'el contraste suave',
	stark: 'el contraste marcado',
	dark: 'lo oscuro',
	luminous: 'lo luminoso',
	'diffuse, even': 'la luz difusa y pareja',
	'theatrical, dramatic': 'la luz teatral y dramática',
	flat: 'lo plano',
	'deep space': 'el espacio profundo',
	distributed: 'la atención repartida',
	'central figure': 'la figura central',
	'closed, contained': 'el encuadre cerrado',
	'open, cropped': 'el encuadre abierto',
	asymmetric: 'lo asimétrico',
	symmetric: 'lo simétrico',
	filled: 'el lienzo lleno',
	'generous emptiness': 'el vacío generoso',
	intimate: 'lo íntimo',
	monumental: 'lo monumental',
	stillness: 'la quietud',
	movement: 'el movimiento',
	absent: 'la ausencia de figuras',
	dominant: 'la presencia humana dominante',
	individual: 'el individuo',
	multitude: 'la multitud',
	// nombres de dims (openQuestion, timeline, chips)
	abstraction: 'abstracción',
	stylization: 'estilización',
	brushwork: 'pincelada',
	detail: 'detalle',
	'visual complexity': 'complejidad visual',
	order: 'orden',
	geometry: 'geometría',
	line: 'línea',
	surface: 'superficie',
	saturation: 'saturación',
	temperature: 'temperatura',
	palette: 'paleta',
	'role of color': 'papel del color',
	contrast: 'contraste',
	'overall value': 'valor lumínico',
	light: 'luz',
	'natural light': 'luz natural',
	'night scene': 'escena nocturna',
	depth: 'profundidad',
	focus: 'foco',
	framing: 'encuadre',
	symmetry: 'simetría',
	'negative space': 'espacio negativo',
	'felt scale': 'escala percibida',
	motion: 'movimiento',
	// binarios de tema e intensidades de ánimo
	portrait: 'retrato',
	'human figure': 'figura humana',
	'group scene': 'escena de grupo',
	landscape: 'paisaje',
	interior: 'interior',
	city: 'ciudad',
	architecture: 'arquitectura',
	nature: 'naturaleza',
	'still life': 'naturaleza muerta',
	'everyday scene': 'escena cotidiana',
	'historical scene': 'escena histórica',
	religious: 'lo religioso',
	mythological: 'lo mitológico',
	war: 'la guerra',
	'work & labor': 'el trabajo',
	'family & intimacy': 'familia e intimidad',
	animals: 'animales',
	sea: 'el mar',
	'human presence': 'presencia humana',
	'face visible': 'rostro visible',
	'direct gaze': 'mirada directa',
	cast: 'reparto',
	serenity: 'serenidad',
	joy: 'alegría',
	melancholy: 'melancolía',
	unease: 'inquietud',
	tension: 'tensión',
	mystery: 'misterio',
	ambiguity: 'ambigüedad',
	vulnerability: 'vulnerabilidad',
	intimacy: 'intimidad',
	solitude: 'soledad',
	sensuality: 'sensualidad',
	violence: 'violencia',
	spirituality: 'espiritualidad',
	hope: 'esperanza',
	humor: 'humor',
	strangeness: 'extrañeza',
	elegance: 'elegancia',
	austerity: 'austeridad',
	exuberance: 'exuberancia',
	drama: 'dramatismo',
	contemplation: 'contemplación',
	grotesque: 'lo grotesco',
	'explicit narrative': 'narrativa explícita',
	'implied narrative': 'narrativa implícita',
	'cinematic feeling': 'sensación cinematográfica',
	'before/after pull': 'el antes y el después',
	'psychological charge': 'carga psicológica'
};

/** Traduce un label del motor; conserva el original si no está mapeado. */
function L(label: string): string {
	return LABELS[label.toLowerCase()] ?? label;
}

const tierES = {
	strong: 'evidencia sólida',
	moderate: 'evidencia moderada',
	weak: 'evidencia incipiente',
	insufficient: 'evidencia insuficiente'
};

const phrasesES: InterpretPhrases = {
	tier: tierES,
	beginning: 'Tu perfil apenas comienza — sigue eligiendo y la imagen se afinará con cada sesión.',
	topLine: (label, tier, provisional) =>
		`Lo que más te atrae de forma consistente por ahora: ${L(label)} — ${tier}${provisional ? ' (hipótesis importada, en prueba)' : ''}.`,
	formOverSubject: (label) =>
		`Cómo está pintado un cuadro (${L(label)}) pesa ahora más que lo que representa.`,
	subjectOverForm: (label) =>
		`Lo que un cuadro representa (${L(label)}) pesa ahora más que cómo está pintado.`,
	aversionLine: (label, tier) => `Lo que más dejas pasar: ${L(label)} — ${tier}.`,
	conflictLine: (label) =>
		`Tus respuestas ante ${L(label)} tiran en ambas direcciones — la atracción puede depender de un contexto que el modelo aún no aísla.`,
	provisionalLine: (n) =>
		n === 1
			? '1 hipótesis importada sigue siendo provisional — las próximas sesiones la confirmarán o refutarán.'
			: `${n} hipótesis importadas siguen siendo provisionales — las próximas sesiones las confirmarán o refutarán.`,
	noisyLine:
		'Tus últimas respuestas han sido menos consistentes de lo habitual; las conclusiones se sostienen con más cautela por ahora.'
};

export const es: Strings = {
	appName: 'Beholder',
	tagline: 'Aprende tu propia mirada.',

	welcome: {
		how: 'Elige entre parejas de cuadros. Beholder aprende qué ama tu mirada — y te muestra por qué.',
		journey: 'Tu primera lectura aparece tras 8 elecciones; un perfil calibrado hacia las 40.',
		begin: 'Empezar',
		heroCredit: (artist, title, museum) => `${artist} — ${title} · ${museum}`
	},

	home: {
		start: 'Empezar una sesión',
		continue: 'Continuar tu sesión',
		sessionsDone: (n) => (n === 1 ? '1 sesión celebrada' : `${n} sesiones celebradas`),
		answersLogged: (n) => (n === 1 ? '1 elección registrada' : `${n} elecciones registradas`),
		saved: 'Obras guardadas',
		settings: 'Ajustes',
		catalogOffline: 'Sin conexión — usando tu colección en caché',
		catalogError: 'No se pudo cargar la colección. Revisa tu conexión e inténtalo de nuevo.',
		catalogLoading: 'Colgando la galería…',
		catalogProgress: (loaded, total) =>
			total > 0 ? `Colgando la galería — ${loaded} de ${total} paredes` : 'Colgando la galería…',
		catalogDegraded: 'Parte de la colección no se pudo cargar — aun así puedes empezar.',
		retry: 'Reintentar'
	},

	session: {
		whichOne: '¿Cuál te atrae?',
		firstHint: 'Elige el que te llame — cada respuesta enseña a Beholder tu mirada.',
		both: 'Ambos',
		neither: 'Ninguno',
		unsure: 'No sé decidir',
		more: 'Más opciones',
		skipPair: 'Saltar esta pareja',
		reportProblem: 'Reportar un problema',
		reportPrompt: '¿Qué falló en esta pareja?',
		reportImage: 'La imagen se ve mal',
		reportFormat: 'El formato es difícil de comparar',
		reportRepeat: 'Se repite demasiado',
		reportOther: 'Otra cosa',
		strengthPrompt: '¿Con qué claridad?',
		strengthSlight: 'Ligeramente',
		strengthClear: 'Con claridad',
		strengthStrong: 'Con fuerza',
		reactionPrompt: 'Deja una reacción (opcional)',
		elementPrompt: '¿Qué te atrajo? (opcional)',
		save: 'Guardar',
		saved: 'Guardada',
		remember: 'Quiero recordarla',
		remembered: 'Marcada para recordar',
		next: 'Siguiente',
		undo: 'Deshacer elección',
		skip: 'Saltar',
		finish: 'Terminar sesión',
		progress: (i, n) => `${i} de ${n}`,
		probeExplain: {
			'cross-era': 'Esta pareja cruzó dos épocas distintas para ver si el periodo te importa.',
			'cross-subject': 'Esta pareja contrastó dos tipos de tema.',
			'within-stratum':
				'Estas dos son primas cercanas — una comparación fina dentro de un mismo territorio.',
			coverage: 'Esta pareja amplía el mapa de lo que has visto.'
		},
		summaryTitle: 'Sesión completa',
		summaryAgain: 'Poner a prueba este patrón',
		summaryAgainNeutral: 'Otra sesión',
		summaryHome: 'Terminar',
		sharpen: 'Afinar esta lectura — 4 elecciones más',
		seeMyEye: 'Ver mi mirada',
		longerSession: '¿Prefieres una sesión larga? Empieza 12 parejas',
		endedEarly: (n) =>
			n === 1
				? 'Terminada antes de tiempo — tu elección cuenta igual.'
				: `Terminada antes de tiempo — tus ${n} elecciones cuentan igual.`,
		summarySaved: 'Tus elecciones quedan guardadas.',
		emptyPool:
			'Has visto todo lo que podemos emparejar ahora mismo — la colección crece continuamente.',
		insightHeadline: 'Está emergiendo un patrón',
		insightHeadlineEarly: 'Una señal temprana',
		insightHeadlineNone: 'Todavía mapeando tu mirada',
		patternPhrase: (dimId, label) =>
			dimId.startsWith('era.') ? `obras de ${L(label)}` : `obras con ${L(label)}`,
		insightPattern: (phrases) => `Elegiste una y otra vez ${phrases}.`,
		insightPatternEarly: (phrases) =>
			`Una señal temprana: puede que respondas a ${phrases}. Aún es pronto para asegurarlo.`,
		insightCounter: (label) => `También rechazaste ${L(label)} — anotado.`,
		factsAnswered: (n, eras) =>
			eras >= 2
				? n === 1
					? `Respondiste 1 pareja abarcando ${eras} épocas de la pintura.`
					: `Respondiste ${n} parejas abarcando ${eras} épocas de la pintura.`
				: n === 1
					? 'Respondiste 1 pareja.'
					: `Respondiste ${n} parejas.`,
		factsTopEra: (label, n) => `${n} de tus elecciones vinieron de ${L(label)}.`,
		factsSaved: (n) =>
			n === 1
				? 'Una obra quedó guardada para volver a ella.'
				: `${n} obras quedaron guardadas para volver a ellas.`,
		factsNoThread:
			'Ningún hilo dominó — tu mirada no es de una sola nota. El mapa sigue creciendo.',
		insightOpen: (dim) => `Sigue abierto: dónde te sitúas ante ${L(dim)}.`,
		insightNext: (dim) => `La próxima sesión puede poner a prueba ${L(dim)} directamente.`,
		insightEvidence: 'De esta sesión',
		calibrationProgress: (n, target) => `${n} de ${target} elecciones de calibración.`,
		galleryGrew: (n) =>
			n === 1 ? 'Tu galería creció a 1 obra vista.' : `Tu galería creció a ${n} obras vistas.`,
		nextWorks: 'Para tu próxima visita',
		nextWorksEarly: 'Primeras posibilidades para tu próxima visita',
		nextWorksHint:
			'Primeras conjeturas a partir de tus elecciones — cada tarjeta dice por qué. Irán afinándose.',
		insightRejection: (phrase, n) =>
			`Apartaste parejas ${n} veces por lo mismo: ${phrase.toLowerCase()}.`,
		insightShared: (phrase) =>
			`Cuando ambas obras te atrajeron, lo que compartían era ${phrase.toLowerCase()}.`,
		insightCounterExample: 'También elegiste una vez lo contrario:',
		objectiveActive: (label) => `Poniendo a prueba: ${L(label)}`,
		changeDirection: 'Cambiemos de dirección.',
		consistencyNote: 'Se muestra de nuevo a propósito — una comprobación de consistencia.',
		microPrefix: 'Por ahora:',
		micro: (label) => `te inclinas hacia ${L(label)}.`,
		bothTitle: 'Ambas te atrajeron',
		bothPrompt: '¿Qué compartían? (opcional)',
		neitherTitle: 'Ninguna conectó — eso también sirve',
		neitherPrompt: '¿Qué te alejó? (opcional)',
		unsureTitle: 'Sin preferencia clara',
		unsurePrompt: '¿Por qué fue difícil? (opcional)',
		neitherLearning: 'Nos alejaremos de parejas como esta mientras averiguamos por qué.',
		neitherLearningFlagged: 'No contaremos esta pareja — gracias por avisar.',
		addContext: 'Añadir contexto a esta elección',
		learnMore: 'Sobre esta obra',
		whyPairSpecific: (a, b) =>
			b ? `Esta pareja contrasta ${L(a)} frente a ${L(b)}.` : `Esta pareja contrasta ${L(a)}.`,
		whyPairEra: (centuries) => ` Además las separan ${centuries} siglos.`
	},

	aspects: {
		subject: 'El tema',
		color: 'El color',
		style: 'El estilo',
		atmosphere: 'La atmósfera',
		emotion: 'La emoción',
		composition: 'La composición',
		technique: 'La técnica',
		'too-decorative': 'Demasiado decorativo',
		'too-abstract': 'Demasiado abstracto',
		'too-busy': 'Demasiado recargado',
		flat: 'Me dejó indiferente',
		'no-pull': 'Sin tirón emocional',
		'too-similar': 'Demasiado parecidas',
		'image-quality': 'Imagen deficiente',
		'hard-to-judge': 'Difícil de juzgar',
		'not-sure': 'No lo sé'
	},

	reveal: {
		unknownDate: 'fecha desconocida',
		viewAtMuseum: 'Ver en el museo',
		whyThisPair: '¿Por qué esta pareja?'
	},

	emotions: {
		moved: 'Conmovida/o',
		calm: 'En calma',
		unsettled: 'Inquieta/o',
		intrigued: 'Intrigada/o',
		delighted: 'Encantada/o',
		melancholic: 'Nostálgica/o',
		awed: 'Asombrada/o',
		indifferent: 'Indiferente'
	},

	elements: {
		color: 'El color',
		atmosphere: 'La atmósfera',
		composition: 'La composición',
		subject: 'El tema',
		face: 'Un rostro',
		mystery: 'El misterio',
		story: 'La historia',
		technique: 'La técnica',
		light: 'La luz'
	},

	saved: {
		title: 'Obras guardadas',
		empty: 'Aún no hay nada guardado. Cuando una obra se quede contigo, guárdala aquí.',
		remove: 'Quitar',
		seenTitle: 'Obras vistas',
		seenCount: (n, total) => `${n} de ${total} obras de la colección.`,
		seenEras: (n, total) => `Tu mirada ha cruzado ${n} de ${total} épocas de la pintura.`,
		seenChosen: 'elegida',
		seenLatest: 'Se muestran las más recientes.',
		notebook: 'Cuaderno de campo',
		notebookHint:
			'Cuadros que fotografiaste y que aún no están en la colección. Las fotos nunca salen de este dispositivo; a medida que la colección crezca podrán identificarse.',
		notebookAlt: 'Tu foto de un cuadro'
	},

	settings: {
		title: 'Ajustes',
		data: 'Tus datos',
		exportBtn: 'Exportar mis datos (JSON)',
		exportHint: 'Todo: tus respuestas, guardados y notas. Tuyos para siempre.',
		resetBtn: 'Borrar datos locales',
		resetConfirm:
			'¿Borrar todas las respuestas, guardados y obras en caché de este dispositivo? No se puede deshacer.',
		resetDone: 'Datos locales borrados.',
		about: 'Acerca de',
		aboutBody:
			'Beholder es un proyecto abierto, personal y no comercial. La mayoría de las obras son de dominio público, con metadatos CC0 de los museos de origen o Wikimedia Commons; un pequeño conjunto de obras emblemáticas con derechos vigentes se enlaza desde Wikipedia a tamaño de uso legítimo y nunca se redistribuye.',
		attributions: 'Colecciones',
		priorHint:
			'¿Tienes hipótesis de partida de comparaciones anteriores? Impórtalas como prior de baja confianza: las próximas sesiones las pondrán a prueba, no las confirmarán.',
		priorBtn: 'Importar perfil de partida (JSON)',
		priorDone: 'Perfil de partida importado como hipótesis provisionales.',
		priorFailed: 'Ese archivo no parece un perfil de partida de Beholder.',
		privacy:
			'Sin analítica, sin rastreo. Tus respuestas se quedan en este dispositivo hasta que crees una cuenta y elijas sincronizar.'
	},

	profile: {
		title: 'Tu mirada',
		empty: 'Aún no hay elecciones — tu perfil comienza con tu primera sesión.',
		portrait: (top, tier, away) =>
			away
				? `Tu mirada se inclina hacia ${L(top)} (${tier}) y tiende a dejar pasar ${L(away)}.`
				: `Tu mirada se inclina hacia ${L(top)} (${tier}).`,
		representative: 'Obras que tu mirada eligió una y otra vez',
		testThis: 'Ponerlo a prueba',
		testQueued: 'En cola para tu próxima sesión',
		testLater: (k) =>
			k === 1
				? 'Se podrán poner a prueba cuando termine la calibración — falta 1 elección.'
				: `Se podrán poner a prueba cuando termine la calibración — faltan ${k} elecciones.`,
		wellTested: 'bien probado',
		lightlyTested: 'poco probado',
		artistLowExposure: 'aún sin encuentros suficientes',
		snapCta: 'Fotografía un cuadro que te encantó ↗',
		pastSessions: 'Sesiones anteriores',
		pastFacts: (n) => (n === 1 ? '1 respondida' : `${n} respondidas`),
		pastNoPattern: 'sin un patrón único',
		statusStrengthened: 'más fuerte desde entonces',
		statusWeakened: 'más débil desde entonces',
		statusChanged: 'se ha invertido',
		statusHolds: 'se mantiene',
		statusUnresolved: 'sigue abierto',
		basis: (n) =>
			n === 1
				? 'Construido a partir de 1 elección registrada y tus guardados, reacciones y saltos.'
				: `Construido a partir de ${n} elecciones registradas y tus guardados, reacciones y saltos.`,
		drawsYou: 'Qué te atrae',
		leavesYou: 'Qué sueles dejar pasar',
		contradictions: 'Donde tus respuestas discrepan',
		conflictLine: (label) =>
			`${L(label)}: tus respuestas tiran en ambas direcciones — posiblemente dependa del contexto.`,
		stillOpen: 'Aún una pregunta abierta',
		artists: 'Artistas',
		seeded: 'importado',
		evolution: 'Cómo se ha movido tu mirada',
		afterChoices: (n) => `tras ${n} elecciones`,
		artistRecord: (w, l, s) => `${w}–${l} en comparaciones${s > 0 ? `, ${s} guardadas` : ''}`,
		noObservations: 'aún sin encuentros',
		provisional: 'provisional',
		tierStrong: 'evidencia sólida',
		tierModerate: 'moderada',
		tierWeak: 'señal temprana',
		tierInsufficient: 'aún insuficiente',
		phrases: phrasesES,
		observations: (n) => (n === 1 ? '1 observación' : `${n} observaciones`),
		honesty:
			'Beholder nunca inventa precisión: las barras muestran confianza relativa y cada afirmación lleva su nivel de evidencia. Las conclusiones cambian a medida que se acumulan tus elecciones.'
	},

	discover: {
		title: 'Descubrir',
		searchPlaceholder: 'Busca artista, título, museo…',
		results: (n) => (n === 1 ? '1 obra encontrada' : `${n} obras encontradas`),
		clear: 'Limpiar',
		close: 'Para tu mirada',
		closeHint:
			'Obras no vistas a las que el modelo espera que respondas — cada tarjeta dice por qué.',
		closeEarly: 'Primeras posibilidades',
		closeEarlyHint:
			'Primeras conjeturas a partir de tus elecciones — cada tarjeta dice por qué. Se irán afinando.',
		challenge: 'Desafía tu mirada',
		challengeHint:
			'Fuera de tu zona de confort a propósito — cada tarjeta nombra contra qué empuja.',
		needSessions: (k) =>
			k === 1
				? 'Las recomendaciones personales se desbloquean tras 1 elección más — el explorador de abajo funciona desde ya.'
				: `Las recomendaciones personales se desbloquean tras ${k} elecciones más — el explorador de abajo funciona desde ya.`,
		surprise: 'Sorpréndeme',
		artists: 'Artistas que aún no conoces',
		artistsHint: 'Predicho a partir de toda su obra en la colección.',
		explore: 'Explorar la colección'
	},

	work: {
		whyTitle: 'Por qué podría hablarte',
		imageUnavailable: 'La imagen no se pudo cargar.',
		imageRetry: 'Reintentar',
		viewFull: 'Ver a pantalla completa',
		closeFull: 'Cerrar pantalla completa',
		seenInPerson: 'Vista en persona',
		seenInPersonDone: 'Vista en persona ✓',
		notes: 'Tus notas',
		notePlaceholder: 'Un pensamiento para guardar con esta obra…',
		noteSave: 'Guardar nota',
		noteSaved: 'Guardada',
		notFound: 'Esta obra no está en la colección actual.'
	},

	account: {
		title: 'Cuenta y sincronización',
		guestHint:
			'Usas Beholder como invitada/o — todo vive en este dispositivo. Inicia sesión para sincronizar tu mirada entre dispositivos.',
		signIn: 'Iniciar sesión con Google',
		signedInAs: (label) => `Sesión iniciada como ${label}`,
		signOut: 'Cerrar sesión',
		deleteBtn: 'Borrar cuenta y datos',
		deleteConfirm:
			'¿Borrar tu cuenta y todas las respuestas sincronizadas del servidor? Los datos locales de este dispositivo permanecen hasta que los borres. No se puede deshacer.',
		syncing: 'Sincronizando…',
		syncOffline: 'Sin conexión — se sincronizará a tu regreso',
		syncError: 'La sincronización falló — se reintentará',
		lastSync: (when) => `Última sincronización ${when}`,
		signingIn: 'Completando el inicio de sesión…',
		signInFailed: 'El inicio de sesión no se completó',
		signInFailedHint: 'El enlace caducó o ya se había usado. Inténtalo de nuevo.',
		notConfigured: 'Las cuentas aún no están disponibles en este despliegue.',
		authPending: 'El inicio de sesión se está configurando — la sincronización llegará en breve.'
	},

	snap: {
		title: 'Snap',
		intro:
			'¿Viste un cuadro por ahí? Fotografíalo y Beholder intentará encontrarlo en la colección — tu confirmación es la señal.',
		takePhoto: 'Fotografiar un cuadro',
		priorHint:
			'¿Tienes hipótesis de partida de comparaciones anteriores? Impórtalas como prior de baja confianza: las próximas sesiones las pondrán a prueba, no las confirmarán.',
		priorBtn: 'Importar perfil de partida (JSON)',
		priorDone: 'Perfil de partida importado como hipótesis provisionales.',
		priorFailed: 'Ese archivo no parece un perfil de partida de Beholder.',
		privacy: 'Las fotos nunca salen de este dispositivo. No se registra ubicación.',
		loadingCatalog: 'Cargando el índice visual…',
		loadingModel: 'Primera vez: descargando el modelo de visión (~30 MB, luego queda en caché)…',
		matching: 'Buscando en la colección…',
		firstTime: 'El primer snap tarda más mientras se descarga el modelo.',
		isItOne: '¿Es una de estas?',
		likely: 'gran parecido',
		maybe: 'posible coincidencia',
		itsThis: 'Es esta',
		noneOfThese: 'Ninguna de estas',
		noCandidates: 'Nada en la colección se parece lo suficiente a esta foto como para aventurarlo.',
		confirmedNote: (artist) =>
			`Registrado: vista en persona, amada y guardada — una señal fuerte para tu mirada. (${artist})`,
		archivedNote:
			'Guardada en tu cuaderno de campo privado en este dispositivo. Cuando la colección crezca, versiones futuras podrán reintentar la identificación.',
		another: 'Otra más',
		back: 'Volver',
		unavailable:
			'Snap necesita el índice visual, que aún no se ha generado para este despliegue — o el modelo no pudo descargarse. Inténtalo más tarde.'
	},

	memory: {
		title: 'Recordar',
		empty:
			'Marca obras con "Quiero recordarla" durante las sesiones y reaparecerán aquí a intervalos crecientes.',
		dueCount: (n) => (n === 1 ? '1 obra por repasar' : `${n} obras por repasar`),
		prompt: '¿Recuerdas esta?',
		reveal: 'Revelar',
		gradePrompt: 'Sé honesta/o — solo ajusta los tiempos.',
		knewIt: 'La sabía',
		almost: 'Casi',
		notYet: 'Aún no',
		allDone: 'Nada pendiente ahora — tus obras marcadas volverán cuando toque.',
		knownTitle: (n) => `Obras que reconoces (${n})`
	},

	progress: {
		nextRecs: (k) =>
			k === 1
				? '1 elección más hasta las recomendaciones personales.'
				: `${k} elecciones más hasta las recomendaciones personales.`,
		nextPortrait: (k) =>
			k === 1
				? '1 elección más hasta tu primera lectura de perfil.'
				: `${k} elecciones más hasta tu primera lectura de perfil.`,
		nextCalibrated: (k) =>
			k === 1
				? '1 elección más y la calibración termina — las sesiones pasarán a poner a prueba tu mirada directamente.'
				: `${k} elecciones más y la calibración termina — las sesiones pasarán a poner a prueba tu mirada directamente.`
	},

	nav: {
		play: 'Jugar',
		discover: 'Descubrir',
		saved: 'Guardadas',
		profile: 'Tu mirada',
		settings: 'Ajustes',
		back: 'Atrás'
	},

	a11y: {
		artworkPair: 'Dos cuadros para comparar',
		choiceA: 'Elegir el primer cuadro',
		choiceB: 'Elegir el segundo cuadro',
		artworkImage: (alt) => `Cuadro: ${alt}`,
		artworkBlind: 'Cuadro',
		artworkBlindDescribed: (p) => {
			const subject =
				{
					people: 'escena con personas',
					land: 'paisaje',
					interior: 'escena de interior',
					still: 'naturaleza muerta',
					other: 'cuadro'
				}[p.subject] ?? 'cuadro';
			const mood = {
				serene: ' serena',
				dramatic: ' dramática',
				mysterious: ' misteriosa',
				melancholic: ' melancólica',
				'': ''
			}[p.mood ?? ''];
			// Género: paisaje/cuadro son masculinos; el resto, femeninos.
			const fem = p.subject !== 'land' && p.subject !== 'other';
			const moodTxt = p.mood ? (fem ? mood : mood.replace(/a$/, 'o')) : '';
			const night = p.night ? ' nocturna' : '';
			const nightTxt = p.night ? (fem ? night : ' nocturno') : '';
			const era =
				{
					pre1500: ', pintado antes de 1500',
					e1500: ', de los siglos XVI o XVII',
					e1700: ', del siglo XVIII o principios del XIX',
					e1850: ', de finales del siglo XIX',
					e1900: ', pintado después de 1900',
					unknown: ''
				}[p.era] ?? '';
			const eraTxt = fem && era.startsWith(', pintado') ? era.replace('pintado', 'pintada') : era;
			return `${fem ? 'Una' : 'Un'} ${subject}${nightTxt}${moodTxt}${eraTxt}`;
		}
	}
};
