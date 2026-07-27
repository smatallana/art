/**
 * UI strings — single source so additional languages can be added without
 * touching components. English is the launch language (owner's choice).
 */
export const t = {
	appName: 'Beholder',
	tagline: 'Learn your own eye.',

	home: {
		start: 'Begin a session',
		continue: 'Continue your session',
		sessionsDone: (n: number) => (n === 1 ? '1 session held' : `${n} sessions held`),
		answersLogged: (n: number) => (n === 1 ? '1 choice recorded' : `${n} choices recorded`),
		saved: 'Saved works',
		settings: 'Settings',
		catalogOffline: 'Offline — using your cached collection',
		catalogError: 'The collection could not be loaded. Check your connection and try again.',
		catalogLoading: 'Hanging the gallery…'
	},

	session: {
		whichOne: 'Which draws you in?',
		both: 'Both',
		neither: 'Neither',
		unsure: 'Not sure',
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
		finish: 'Finish session',
		progress: (i: number, n: number) => `${i} of ${n}`,
		probeExplain: {
			'cross-era': 'This pairing crossed two different eras to see whether period matters to you.',
			'cross-subject': 'This pairing contrasted two kinds of subject matter.',
			'within-stratum': 'These two are close cousins — a finer comparison within one territory.',
			coverage: 'This pairing broadens the map of what you have seen.'
		},
		summaryTitle: 'Session complete',
		summaryBody: (n: number) => `${n} choices recorded. Your profile learns from every one.`,
		summaryAgain: 'One more session',
		summaryHome: 'Done for now',
		emptyPool: 'You have seen everything we can pair right now — the collection grows continuously.'
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
		remove: 'Remove'
	},

	settings: {
		title: 'Settings',
		data: 'Your data',
		exportBtn: 'Export my data (JSON)',
		exportHint: 'Everything: your responses, saves and notes. Yours to keep.',
		resetBtn: 'Erase local data',
		resetConfirm:
			'Erase all local responses, saves and cached works from this device? This cannot be undone.',
		resetDone: 'Local data erased.',
		about: 'About',
		aboutBody:
			'Beholder is an open, non-commercial project. All artworks are in the public domain; metadata and images come from the source museums under CC0.',
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
		observations: (n: number) => `${n} ${n === 1 ? 'observation' : 'observations'}`,
		honesty:
			'Beholder never invents precision: bars show relative confidence, and every claim carries its evidence level. Conclusions change as your choices accumulate.'
	},

	discover: {
		title: 'Discover',
		searchPlaceholder: 'Search artist, title, museum…',
		results: (n: number) => (n === 1 ? '1 work found' : `${n} works found`),
		clear: 'Clear',
		close: 'Close to your eye',
		closeHint: 'Unseen works the model expects you to respond to — each card says why.',
		challenge: 'Challenges your eye',
		challengeHint: 'Outside your comfort zone on purpose — the map stays honest this way.',
		needSessions:
			'Personal recommendations unlock after a few sessions — the explorer below works right away.',
		surprise: 'Surprise me',
		artists: 'Artists you have not met',
		artistsHint: 'Predicted from their whole body of work in the collection.',
		explore: 'Explore the collection'
	},

	work: {
		whyTitle: 'Why this might speak to you',
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

	nav: {
		home: 'Home',
		discover: 'Discover',
		saved: 'Saved',
		profile: 'Your eye',
		settings: 'Settings'
	},

	a11y: {
		artworkPair: 'Two paintings to compare',
		choiceA: 'Choose the first painting',
		choiceB: 'Choose the second painting',
		artworkImage: (alt: string) => `Painting: ${alt}`
	}
};

export type Strings = typeof t;
