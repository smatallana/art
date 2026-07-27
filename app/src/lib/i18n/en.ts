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
		privacy:
			'No analytics, no tracking. Your responses stay on this device until you create an account and choose to sync.'
	},

	nav: {
		home: 'Home',
		saved: 'Saved',
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
