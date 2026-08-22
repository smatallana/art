import { describe, expect, it } from 'vitest';
import { suspectImageFilename, wdRights } from '../src/rights.js';

describe('wdRights (conservative PD rule)', () => {
	it('artists dead before 1956 are public domain', () => {
		expect(wdRights({ name: 'Claude Monet', died: 1926 }, 1891).status).toBe('public-domain');
		expect(wdRights({ name: 'Rembrandt', died: 1669 }, null).status).toBe('public-domain');
	});

	it('20th-century artists are in-copyright with a linked-image attribution', () => {
		const miro = wdRights({ name: 'Joan Miró', died: 1983 }, 1978);
		expect(miro.status).toBe('in-copyright');
		expect(miro.attribution).toContain('Joan Miró');
		expect(miro.attribution).toContain('linked');
		// An early work does not rescue a late-dying artist: Picasso's 1896
		// painting stays under copyright until 70 years after his 1973 death.
		expect(wdRights({ name: 'Pablo Picasso', died: 1973 }, 1896).status).toBe('in-copyright');
	});

	it('unknown death year falls back to the work date', () => {
		expect(wdRights({ name: 'Anonymous', died: null }, 1890).status).toBe('public-domain');
		expect(wdRights({ name: 'Anonymous', died: null }, 1950).status).toBe('in-copyright');
		expect(wdRights({ name: 'Anonymous', died: null }, null).status).toBe('in-copyright');
	});
});

describe('suspectImageFilename', () => {
	it('hard-rejects unambiguous exhibition/installation/museum-room shots', () => {
		expect(
			suspectImageFilename('Remember_Me_exhibition,_Rijksmuseum_101.jpg', 'A group of militia men')
		).toBe('reject');
		expect(suspectImageFilename('Louvre_Salle_221_photo.jpg', 'Marcus Aurelius')).toBe('reject');
	});

	it('keeps real painting reproductions untouched', () => {
		expect(suspectImageFilename('Jakobs_droom_Rijksmuseum_SK-A-704.jpeg', "Jacob's Dream")).toBe(
			null
		);
		expect(suspectImageFilename('The_Night_Watch_-_HD.jpg', 'The Night Watch')).toBe(null);
	});

	it('flags room-ish filenames with zero title overlap as suspects, not rejects', () => {
		// Ambiguous by construction: 'interior' names real genre paintings
		// (De Hooch) AND real room photos (the Miró case). Suspects are
		// logged for the human audit; drops happen via overrides only.
		expect(suspectImageFilename('Interior_Palau_del_Parlament_de_Catalunya_1.JPG', 'Dona')).toBe(
			'suspect'
		);
		expect(
			suspectImageFilename(
				'Pieter_de_Hooch_-_Interior_with_Figures_-_WGA11705.jpg',
				'Leisure Time in an Elegant Setting'
			)
		).toBe('suspect');
		expect(suspectImageFilename('Palau_de_la_Musica_view_3.jpg', 'Seated Woman')).toBe('suspect');
	});
});
