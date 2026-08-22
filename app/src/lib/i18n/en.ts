/**
 * English strings — the reference language. Components import the reactive
 * facade from '$lib/i18n' (never this file directly); es.ts mirrors this
 * shape exactly, enforced by `Strings` and a key-tree parity test.
 */
import { ENGLISH_PHRASES } from '../engine/profile';

export const t = {
	appName: 'Beholder',
	tagline: 'Learn your own eye.',

	welcome: {
		how: 'Choose between pairs of paintings. Beholder learns what your eye loves — and shows you why.',
		journey: 'Your first read appears after 8 choices; a calibrated profile after about 40.',
		begin: 'Begin',
		heroCredit: (artist: string, title: string, museum: string) =>
			`${artist} — ${title} · ${museum}`
	},

	home: {
		start: 'Begin a session',
		continue: 'Continue your session',
		sessionsDone: (n: number) => (n === 1 ? '1 session held' : `${n} sessions held`),
		answersLogged: (n: number) => (n === 1 ? '1 choice recorded' : `${n} choices recorded`),
		saved: 'Saved works',
		settings: 'Settings',
		catalogOffline: 'Offline — using your cached collection',
		catalogError: 'The collection could not be loaded. Check your connection and try again.',
		catalogLoading: 'Hanging the gallery…',
		catalogProgress: (loaded: number, total: number) =>
			total > 0 ? `Hanging the gallery — ${loaded} of ${total} walls` : 'Hanging the gallery…',
		catalogDegraded: 'Part of the collection could not be loaded — you can still begin.',
		retry: 'Try again'
	},

	session: {
		whichOne: 'Which draws you in?',
		firstHint: 'Pick the one that pulls you — every answer teaches Beholder your eye.',
		both: 'Both',
		neither: 'Neither',
		unsure: "Can't decide",
		more: 'More options',
		skipPair: 'Skip this pair',
		reportProblem: 'Report a problem',
		reportPrompt: 'What was wrong with this pair?',
		reportImage: 'Hard to see the image',
		reportFormat: 'The format is hard to compare',
		reportRepeat: 'Shown too often',
		reportOther: 'Something else',
		strengthPrompt: 'How clearly?',
		strengthSlight: 'Slightly',
		strengthClear: 'Clearly',
		strengthStrong: 'Strongly',
		reactionPrompt: 'Leave a reaction (optional)',
		elementPrompt: 'What drew you? (optional)',
		save: 'Save',
		saved: 'Saved',
		remember: 'Remember this',
		remembered: 'Marked to remember',
		next: 'Next',
		undo: 'Undo choice',
		skip: 'Skip',
		finish: 'Finish session',
		progress: (i: number, n: number) => `${i} of ${n}`,
		probeExplain: {
			'cross-era': 'This pairing crossed two different eras to see whether period matters to you.',
			'cross-subject': 'This pairing contrasted two kinds of subject matter.',
			'within-stratum': 'These two are close cousins — a finer comparison within one territory.',
			coverage: 'This pairing broadens the map of what you have seen.'
		},
		summaryTitle: 'Session complete',
		summaryAgain: 'Test this pattern',
		summaryAgainNeutral: 'Another session',
		summaryHome: 'End session',
		sharpen: 'Sharpen this read — 4 more choices',
		seeMyEye: 'See my eye',
		longerSession: 'Prefer a longer sitting? Start 12 pairs',
		endedEarly: (n: number) =>
			`Ended early — your ${n} ${n === 1 ? 'choice' : 'choices'} still count.`,
		summarySaved: 'Your choices are saved.',
		emptyPool:
			'You have seen everything we can pair right now — the collection grows continuously.',
		// Session-close insight (always evidence-backed, never invented)
		insightHeadline: 'A pattern is emerging',
		insightHeadlineEarly: 'An early signal',
		insightHeadlineNone: 'Still mapping your eye',
		// Pattern lines take pre-built phrases ("works with vivid color",
		// "works from the late 1800s") so era and tag patterns both read well.
		patternPhrase: (dimId: string, label: string) =>
			dimId.startsWith('era.')
				? `works from ${label.toLowerCase()}`
				: `works with ${label.toLowerCase()}`,
		insightPattern: (phrases: string) => `You kept choosing ${phrases}.`,
		insightPatternEarly: (phrases: string) =>
			`An early signal: you may respond to ${phrases}. Too soon to be sure.`,
		insightCounter: (label: string) => `You also pushed back on ${label} — noted.`,
		// No-pattern ending: concrete session facts, composed per session —
		// never the same fixed line twice (first real-user testing).
		factsAnswered: (n: number, eras: number) =>
			eras >= 2
				? `You answered ${n} ${n === 1 ? 'pair' : 'pairs'} spanning ${eras} eras of painting.`
				: `You answered ${n} ${n === 1 ? 'pair' : 'pairs'}.`,
		factsTopEra: (label: string, n: number) => `${n} of your picks came from ${label}.`,
		factsSaved: (n: number) =>
			n === 1 ? 'One work is saved to revisit.' : `${n} works are saved to revisit.`,
		factsNoThread: 'No single thread dominated — your eye is not one-note. The map keeps growing.',
		insightOpen: (dim: string) => `Still open: where you stand on ${dim}.`,
		insightNext: (dim: string) => `The next session can test ${dim} directly.`,
		insightEvidence: 'From this session',
		// Calibration progress (real thresholds — see engine/progress.ts).
		calibrationProgress: (n: number, target: number) => `${n} of ${target} calibration choices.`,
		galleryGrew: (n: number) =>
			n === 1 ? 'Your gallery grew to 1 work seen.' : `Your gallery grew to ${n} works seen.`,
		// Session-close recommendations: heading gated by evidence (never
		// claim a confident read the model does not have).
		nextWorks: 'For your next visit',
		nextWorksEarly: 'Early possibilities for your next visit',
		nextWorksHint:
			'First guesses from your choices so far — each card says why. They will sharpen.',
		insightRejection: (phrase: string, n: number) =>
			`You pushed pairs away ${n} times over the same thing: ${phrase.toLowerCase()}.`,
		insightShared: (phrase: string) =>
			`When both works drew you in, what they shared was ${phrase.toLowerCase()}.`,
		insightCounterExample: 'You also once chose the opposite:',
		objectiveActive: (label: string) => `Testing: ${label.toLowerCase()}`,
		changeDirection: "Let's change direction.",
		consistencyNote: 'Shown again on purpose — a consistency check.',
		microPrefix: 'So far:',
		micro: (label: string) => `you are leaning toward ${label.toLowerCase()}.`,
		// Reveal branches
		bothTitle: 'Both drew you in',
		bothPrompt: 'What did they share? (optional)',
		neitherTitle: 'Neither connected — that is useful',
		neitherPrompt: 'What pushed you away? (optional)',
		unsureTitle: 'No clear preference',
		unsurePrompt: 'Why was it hard? (optional)',
		neitherLearning: 'We will lean away from pairings like this while we check why.',
		neitherLearningFlagged: 'We will not count this pair — thanks for flagging it.',
		addContext: 'Add context to this choice',
		learnMore: 'About this work',
		whyPairSpecific: (a: string, b?: string) =>
			b
				? `This pairing contrasts ${a.toLowerCase()} against ${b.toLowerCase()}.`
				: `This pairing contrasts ${a.toLowerCase()}.`,
		whyPairEra: (centuries: number) => ` They also sit ${centuries} centuries apart.`
	},

	aspects: {
		subject: 'The subject',
		color: 'The color',
		style: 'The style',
		atmosphere: 'The atmosphere',
		emotion: 'The emotion',
		composition: 'The composition',
		technique: 'The technique',
		'too-decorative': 'Too decorative',
		'too-abstract': 'Too abstract',
		'too-busy': 'Too busy',
		flat: 'Left me flat',
		'no-pull': 'No emotional pull',
		'too-similar': 'Too similar',
		'image-quality': 'Poor image',
		'hard-to-judge': 'Hard to judge',
		'not-sure': 'Not sure'
	},

	reveal: {
		unknownDate: 'date unknown',
		viewAtMuseum: 'View at museum',
		whyThisPair: 'Why this pairing?'
	},

	emotions: {
		moved: 'Moved',
		calm: 'Calmed',
		unsettled: 'Unsettled',
		intrigued: 'Intrigued',
		delighted: 'Delighted',
		melancholic: 'Wistful',
		awed: 'Awed',
		indifferent: 'Unmoved'
	},

	elements: {
		color: 'Color',
		atmosphere: 'Atmosphere',
		composition: 'Composition',
		subject: 'Subject',
		face: 'A face',
		mystery: 'Mystery',
		story: 'The story',
		technique: 'Technique',
		light: 'Light'
	},

	saved: {
		title: 'Saved works',
		empty: 'Nothing saved yet. When a work stays with you, save it here.',
		remove: 'Remove',
		seenTitle: 'Works you have seen',
		seenCount: (n: number, total: number) => `${n} of ${total} works in the collection.`,
		seenEras: (n: number, total: number) => `Your eye has crossed ${n} of ${total} painting eras.`,
		seenChosen: 'chosen',
		seenLatest: 'Showing the most recent.',
		notebook: 'Field notebook',
		notebookHint:
			'Paintings you photographed that are not in the collection yet. Photos never leave this device; as the collection grows they can be re-identified.',
		notebookAlt: 'Your photo of a painting'
	},

	settings: {
		title: 'Settings',
		reportsTitle: 'Reported works',
		reportsHint:
			'Problems you flagged on individual works. They stay on this device — export the list to send it to the curator.',
		reportsExport: 'Export reports (JSON)',
		reportReason: {
			'wrong-image': 'wrong image',
			'not-a-painting': 'not a painting',
			'bad-metadata': 'wrong title or artist',
			other: 'other'
		} as Record<string, string>,
		data: 'Your data',
		exportBtn: 'Export my data (JSON)',
		exportHint: 'Everything: your responses, saves and notes. Yours to keep.',
		resetBtn: 'Erase local data',
		resetConfirm:
			'Erase all local responses, saves and cached works from this device? This cannot be undone.',
		resetDone: 'Local data erased.',
		about: 'About',
		aboutBody:
			'Beholder is an open, personal, non-commercial project. Most artworks are public domain, with CC0 metadata from the source museums or Wikimedia Commons; a small number of in-copyright landmark works are linked from Wikipedia at fair-use size and never redistributed.',
		attributions: 'Collections',
		priorHint:
			'Have starting hypotheses from earlier comparisons? Import them as a low-confidence prior - the sessions ahead will test them, not confirm them.',
		priorBtn: 'Import starting profile (JSON)',
		priorDone: 'Starting profile imported as provisional hypotheses.',
		priorFailed: 'That file does not look like a Beholder starting profile.',
		privacy:
			'No analytics, no tracking. Your responses stay on this device until you create an account and choose to sync.'
	},

	profile: {
		title: 'Your eye',
		empty: 'No choices yet — your profile begins with your first session.',
		// Portrait lead (tramo 9): one synthesis line, works, a test to run.
		portrait: (top: string, tier: string, away: string | null) =>
			away
				? `Your eye leans toward ${top.toLowerCase()} (${tier}) and tends to pass on ${away.toLowerCase()}.`
				: `Your eye leans toward ${top.toLowerCase()} (${tier}).`,
		representative: 'Works your eye kept choosing',
		testThis: 'Test this',
		testQueued: 'Queued for your next session',
		testLater: (k: number) =>
			`These become testable once calibration completes — ${k} ${k === 1 ? 'choice' : 'choices'} to go.`,
		wellTested: 'well tested',
		lightlyTested: 'lightly tested',
		artistLowExposure: 'not enough encounters yet',
		snapCta: 'Photograph a painting you loved ↗',
		pastSessions: 'Past sessions',
		pastFacts: (n: number) => `${n} answered`,
		pastNoPattern: 'no single pattern',
		statusStrengthened: 'stronger since',
		statusWeakened: 'weaker since',
		statusChanged: 'has reversed',
		statusHolds: 'still holds',
		statusUnresolved: 'still open',
		basis: (n: number) =>
			`Built from ${n} recorded ${n === 1 ? 'choice' : 'choices'} and your saves, reactions and skips.`,
		drawsYou: 'What draws you in',
		leavesYou: 'What you tend to pass on',
		contradictions: 'Where your responses disagree',
		conflictLine: (label: string) =>
			`${label}: your responses pull in both directions — possibly context-dependent.`,
		stillOpen: 'Still an open question',
		artists: 'Artists',
		seeded: 'imported',
		evolution: 'How your eye has moved',
		afterChoices: (n: number) => `after ${n} choices`,
		artistRecord: (w: number, l: number, s: number) =>
			`${w}–${l} in comparisons${s > 0 ? `, ${s} saved` : ''}`,
		noObservations: 'no encounters yet',
		provisional: 'provisional',
		tierStrong: 'strong evidence',
		tierModerate: 'moderate',
		tierWeak: 'early signal',
		tierInsufficient: 'not enough yet',
		phrases: ENGLISH_PHRASES,
		observations: (n: number) => `${n} ${n === 1 ? 'observation' : 'observations'}`,
		honesty:
			'Beholder never invents precision: bars show relative confidence, and every claim carries its evidence level. Conclusions change as your choices accumulate.'
	},

	discover: {
		title: 'Discover',
		searchPlaceholder: 'Search artist, title, museum…',
		results: (n: number) => (n === 1 ? '1 work found' : `${n} works found`),
		clear: 'Clear',
		close: 'For your eye',
		closeHint: 'Unseen works the model expects you to respond to — each card says why.',
		closeEarly: 'Early possibilities',
		closeEarlyHint:
			'First guesses from your choices so far — each card says why. They will sharpen.',
		challenge: 'Challenges your eye',
		challengeHint: 'Outside your comfort zone on purpose — each card names what it pushes against.',
		needSessions: (k: number) =>
			`Personal recommendations unlock after ${k} more ${k === 1 ? 'choice' : 'choices'} — the explorer below works right away.`,
		surprise: 'Surprise me',
		artists: 'Artists you have not met',
		artistsHint: 'Predicted from their whole body of work in the collection.',
		explore: 'Explore the collection'
	},

	work: {
		whyTitle: 'Why this might speak to you',
		imageUnavailable: 'The image could not be loaded.',
		imageRetry: 'Try again',
		reportTitle: 'Report a problem with this work',
		reportWrongImage: 'Wrong image',
		reportNotPainting: 'Not a painting',
		reportBadMetadata: 'Wrong title or artist',
		reportOther: 'Something else',
		reportDone: 'Reported — thank you. Your reports live in Settings.',
		viewFull: 'View full screen',
		closeFull: 'Close full screen',
		seenInPerson: 'Seen in person',
		seenInPersonDone: 'Seen in person ✓',
		notes: 'Your notes',
		notePlaceholder: 'A thought to keep with this work…',
		noteSave: 'Keep note',
		noteSaved: 'Kept',
		notFound: 'This work is not in the current collection.'
	},

	account: {
		title: 'Account & sync',
		guestHint:
			'You are using Beholder as a guest — everything lives on this device. Sign in to sync your eye across devices.',
		signIn: 'Sign in with Google',
		signedInAs: (label: string) => `Signed in as ${label}`,
		signOut: 'Sign out',
		deleteBtn: 'Delete account & data',
		deleteConfirm:
			'Delete your account and every synced response from the server? Local data on this device stays until you erase it. This cannot be undone.',
		syncing: 'Syncing…',
		syncOffline: 'Offline — will sync when you return',
		syncError: 'Sync hit a snag — it will retry',
		lastSync: (when: string) => `Last synced ${when}`,
		signingIn: 'Completing sign-in…',
		signInFailed: 'Sign-in did not complete',
		signInFailedHint: 'The sign-in link expired or was already used. Please try again.',
		notConfigured: 'Accounts are not available yet on this deployment.',
		authPending: 'Sign-in is being set up - sync will be available shortly.'
	},

	snap: {
		title: 'Snap',
		intro:
			'Saw a painting in the wild? Photograph it and Beholder will try to find it in the collection - your confirmation is the signal.',
		takePhoto: 'Photograph a painting',
		priorHint:
			'Have starting hypotheses from earlier comparisons? Import them as a low-confidence prior - the sessions ahead will test them, not confirm them.',
		priorBtn: 'Import starting profile (JSON)',
		priorDone: 'Starting profile imported as provisional hypotheses.',
		priorFailed: 'That file does not look like a Beholder starting profile.',
		privacy: 'Photos never leave this device. No location is recorded.',
		loadingCatalog: 'Loading the visual index…',
		loadingModel: 'First time: downloading the vision model (~30 MB, cached after this)…',
		matching: 'Looking through the collection…',
		firstTime: 'The first snap takes longer while the model downloads.',
		isItOne: 'Is it one of these?',
		likely: 'strong resemblance',
		maybe: 'possible match',
		itsThis: 'It is this one',
		noneOfThese: 'None of these',
		noCandidates: 'Nothing in the collection resembles this photo closely enough to guess.',
		confirmedNote: (artist: string) =>
			`Recorded: seen in person, loved, and saved - a strong signal for your eye. (${artist})`,
		archivedNote:
			'Kept in your private field notebook on this device. As the collection grows, future versions can retry the match.',
		another: 'Another one',
		back: 'Back',
		unavailable:
			'Snap needs the visual index, which has not been generated for this deployment yet - or the model could not download. Try again later.'
	},

	memory: {
		title: 'Remember',
		empty:
			'Mark works with "Remember this" during sessions and they will resurface here at widening intervals.',
		dueCount: (n: number) => (n === 1 ? '1 work to revisit' : `${n} works to revisit`),
		prompt: 'Do you remember this one?',
		reveal: 'Reveal',
		gradePrompt: 'Be honest - it only tunes the timing.',
		knewIt: 'Knew it',
		almost: 'Almost',
		notYet: 'Not yet',
		allDone: 'Nothing due right now - your remembered works will return when the time is right.',
		knownTitle: (n: number) => `Works you recognize (${n})`
	},

	// Progress-toward-value milestone lines (numbers from engine/progress.ts).
	progress: {
		nextRecs: (k: number) =>
			`${k} more ${k === 1 ? 'choice' : 'choices'} until personal recommendations.`,
		nextPortrait: (k: number) =>
			`${k} more ${k === 1 ? 'choice' : 'choices'} until your first profile read.`,
		nextCalibrated: (k: number) =>
			`${k} more ${k === 1 ? 'choice' : 'choices'} until calibration completes — sessions then test your eye directly.`
	},

	nav: {
		play: 'Play',
		discover: 'Discover',
		saved: 'Saved',
		profile: 'Your eye',
		settings: 'Settings',
		back: 'Back'
	},

	a11y: {
		artworkPair: 'Two paintings to compare',
		choiceA: 'Choose the first painting',
		choiceB: 'Choose the second painting',
		artworkImage: (alt: string) => `Painting: ${alt}`,
		// Blind phase: the identity of the work must not leak before the reveal.
		artworkBlind: 'Painting',
		// Identity-neutral visual description composed from tags — content
		// parity for screen readers without naming the work or artist.
		artworkBlindDescribed: (p: {
			era: 'pre1500' | 'e1500' | 'e1700' | 'e1850' | 'e1900' | 'unknown';
			subject: 'people' | 'land' | 'interior' | 'still' | 'other';
			night: boolean;
			mood: 'serene' | 'dramatic' | 'mysterious' | 'melancholic' | null;
		}) => {
			const subject = {
				people: 'scene with people',
				land: 'landscape',
				interior: 'interior scene',
				still: 'still life',
				other: 'painting'
			}[p.subject];
			const noun = `${p.mood ? `${p.mood} ` : ''}${p.night ? 'night ' : ''}${subject}`;
			const article = /^[aeiou]/.test(noun) ? 'An' : 'A';
			const era = {
				pre1500: ', painted before 1500',
				e1500: ', from the 1500s or 1600s',
				e1700: ', from the 1700s or early 1800s',
				e1850: ', from the late 1800s',
				e1900: ', painted after 1900',
				unknown: ''
			}[p.era];
			return `${article} ${noun}${era}`;
		}
	}
};

export type Strings = typeof t;
