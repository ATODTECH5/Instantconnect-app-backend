import type { IsoDate } from '../../common/utils/age.util';
import { KycStatus } from '../../users/entities/kyc-status.enum';

/** Reserved for fixtures. The seeder identifies and clears its own rows by it. */
export const SEED_EMAIL_DOMAIN = 'instantconnect.test';

/** Every seeded account shares this. It is a fixture, not a secret. */
export const DEV_PASSWORD = 'Password1';

type Neighbourhood = {
	label: string;
	latitude: number;
	longitude: number;
};

/**
 * Real coordinates, because the whole point of the fixture is to exercise the
 * radius filter and the distance sort. The last three sit outside a default
 * 50km search from anywhere in Lagos proper, so widening the radius visibly
 * changes the result instead of returning the same page.
 */
const NEIGHBOURHOODS: Neighbourhood[] = [
	{ label: 'Ikeja', latitude: 6.6018, longitude: 3.3515 },
	{ label: 'Maryland', latitude: 6.573, longitude: 3.366 },
	{ label: 'Gbagada', latitude: 6.554, longitude: 3.386 },
	{ label: 'Yaba', latitude: 6.5095, longitude: 3.3711 },
	{ label: 'Surulere', latitude: 6.4969, longitude: 3.3481 },
	{ label: 'Apapa', latitude: 6.449, longitude: 3.359 },
	{ label: 'Victoria Island', latitude: 6.4281, longitude: 3.4219 },
	{ label: 'Ikoyi', latitude: 6.455, longitude: 3.435 },
	{ label: 'Lekki Phase 1', latitude: 6.4474, longitude: 3.4736 },
	{ label: 'Ajah', latitude: 6.4667, longitude: 3.5667 },
	{ label: 'Magodo', latitude: 6.618, longitude: 3.373 },
	{ label: 'Ojota', latitude: 6.586, longitude: 3.38 },
	{ label: 'Oshodi', latitude: 6.555, longitude: 3.34 },
	{ label: 'Agege', latitude: 6.615, longitude: 3.321 },
	{ label: 'Festac', latitude: 6.465, longitude: 3.28 },
	{ label: 'Ikorodu', latitude: 6.6194, longitude: 3.5105 },
	{ label: 'Badagry', latitude: 6.415, longitude: 2.881 },
	{ label: 'Epe', latitude: 6.584, longitude: 3.983 },
	{ label: 'Abeokuta', latitude: 7.1475, longitude: 3.3619 },
];

const FIRST_NAMES = [
	'Halima',
	'Iyan',
	'Eva',
	'Calvin',
	'Lola',
	'Alex',
	'Adunni',
	'Seun',
	'Daniel',
	'Susan',
	'Jummy',
	'Tunde',
	'Ngozi',
	'Chidi',
	'Amaka',
	'Femi',
	'Zainab',
	'Emeka',
	'Bisi',
	'Kelechi',
];

/**
 * Deliberately 19 entries against 20 first names. The lengths being coprime is
 * what stops a pair repeating: at 20 and 20, person 1 and person 21 drew the
 * same full name.
 */
const LAST_NAMES = [
	'Lawal',
	'Filani',
	'Rose',
	'Osa',
	'Aziz',
	'Deen',
	'Coker',
	'Williams',
	'Nedu',
	'Okafor',
	'Adeyemi',
	'Bello',
	'Eze',
	'Nwosu',
	'Balogun',
	'Sani',
	'Obi',
	'Adeleke',
	'Danjuma',
];

/** Ids as they exist after the ProfileModule migration renamed two of them. */
const CATEGORY_IDS = ['talents', 'business', 'friendship', 'social', 'general'];

const OCCUPATION_IDS = [
	'product-manager',
	'artist',
	'accountant',
	'product-designer',
	'musician',
	'software-developer',
	'frontend-developer',
	'music-producer',
	'backend-developer',
	'graphic-designer',
	'motion-designer',
	'project-manager',
];

const HOBBY_IDS = [
	'music',
	'art',
	'travel',
	'photography',
	'reading',
	'dancing',
];

const BIOS = [
	'Building things that make local life a little easier.',
	'Here for good conversation and better coffee.',
	'Always up for a gallery, a gig, or a long walk.',
	'Looking to meet people working on interesting problems.',
	'New to the city and trying to actually meet my neighbours.',
];

export const PEOPLE_PER_NEIGHBOURHOOD = 2;

export type SeedPerson = {
	fullName: string;
	email: string;
	phone: string;
	username: string;
	bio: string;
	dateOfBirth: IsoDate;
	categoryId: string;
	occupationId: string;
	hobbyIds: string[];
	locationLabel: string;
	latitude: number;
	longitude: number;
	kycStatus: KycStatus;
};

/**
 * Deterministic rather than random, so a re-seed produces byte for byte the
 * same people and a bug found against one row stays reproducible.
 *
 * The offset spreads people a few hundred metres around their neighbourhood's
 * centre so distance ordering has something to order, instead of stacking
 * everyone on one identical point.
 */
export function buildSeedPeople(): SeedPerson[] {
	const people: SeedPerson[] = [];

	NEIGHBOURHOODS.forEach((area, areaIndex) => {
		for (let slot = 0; slot < PEOPLE_PER_NEIGHBOURHOOD; slot += 1) {
			const index = areaIndex * PEOPLE_PER_NEIGHBOURHOOD + slot;
			const offset = (slot + 1) * 0.004;

			people.push({
				fullName: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${
					LAST_NAMES[(index * 7) % LAST_NAMES.length]
				}`,
				email: `seed.${index + 1}@${SEED_EMAIL_DOMAIN}`,
				phone: `+234801${String(index + 1).padStart(7, '0')}`,
				username: `seed${index + 1}`,
				bio: BIOS[index % BIOS.length],
				dateOfBirth: `${1988 + (index % 18)}-0${(index % 9) + 1}-1${index % 9}`,
				categoryId: CATEGORY_IDS[index % CATEGORY_IDS.length],
				occupationId: OCCUPATION_IDS[index % OCCUPATION_IDS.length],
				hobbyIds: [
					HOBBY_IDS[index % HOBBY_IDS.length],
					HOBBY_IDS[(index + 2) % HOBBY_IDS.length],
				],
				locationLabel: `${area.label}, Lagos`,
				latitude: Number((area.latitude + offset).toFixed(6)),
				longitude: Number((area.longitude - offset).toFixed(6)),
				kycStatus:
					index % 3 === 0 ? KycStatus.Verified : KycStatus.None,
			});
		}
	});

	return people;
}
