// Baked clips handle authored greetings. These profiles choose the closest
// installed system voice for generated locals and guide the offline Kokoro pass.
const FAMILY = {
  isles: {
    lang: 'en-GB', kokoroVoices: ['bf_emma', 'bm_george', 'bf_isabella', 'bm_lewis'],
    voiceHints: ['British', 'England', 'English UK'], rate: 1.0, pitch: 1.0,
  },
  liberty: {
    lang: 'en-US', kokoroVoices: ['af_heart', 'am_michael', 'af_bella', 'am_adam'],
    voiceHints: ['United States', 'American', 'English US'], rate: 1.01, pitch: 1.0,
  },
  sunward: {
    lang: 'en-AU', kokoroVoices: ['bf_emma', 'am_michael', 'bf_isabella', 'am_adam'],
    voiceHints: ['Australian', 'Australia'], rate: 1.0, pitch: 1.0,
  },
};

const SPECIFIC = {
  uk_scouse: { voiceHints: ['Liverpool', 'Scouse', 'Northern'] },
  uk_geordie: { voiceHints: ['Newcastle', 'Geordie', 'Northern'] },
  uk_yorkshire: { voiceHints: ['Yorkshire', 'Northern'] },
  uk_brummie: { voiceHints: ['Birmingham', 'Midlands'] },
  uk_mancunian: { voiceHints: ['Manchester', 'Northern'] },
  sco_scots: { lang: 'en-GB', voiceHints: ['Scottish', 'Scotland'] },
  sco_glaswegian: { lang: 'en-GB', voiceHints: ['Glasgow', 'Scottish'] },
  sco_edinburgh: { lang: 'en-GB', voiceHints: ['Edinburgh', 'Scottish'] },
  sco_highland: { lang: 'en-GB', voiceHints: ['Highland', 'Scottish'] },
  ie_irish: { lang: 'en-IE', voiceHints: ['Irish', 'Ireland'] },
  ie_dublin: { lang: 'en-IE', voiceHints: ['Dublin', 'Irish'] },
  ie_belfast: { lang: 'en-GB', voiceHints: ['Belfast', 'Northern Irish', 'Irish'] },
  ie_cork: { lang: 'en-IE', voiceHints: ['Cork', 'Irish'] },
  ca_canadian: { lang: 'en-CA', voiceHints: ['Canadian', 'Canada'] },
  ca_quebec: { lang: 'en-CA', voiceHints: ['Canadian', 'Canada'] },
  ca_newfoundland: { lang: 'en-CA', voiceHints: ['Newfoundland', 'Canadian'] },
  nz_nze: { lang: 'en-NZ', voiceHints: ['New Zealand', 'Kiwi'] },
  nz_maori: { lang: 'en-NZ', voiceHints: ['New Zealand', 'Maori'] },
  za_white: { lang: 'en-ZA', voiceHints: ['South African', 'South Africa'] },
  za_black: { lang: 'en-ZA', voiceHints: ['South African', 'South Africa'] },
  za_indian: { lang: 'en-ZA', voiceHints: ['South African', 'South Africa', 'Indian'] },
  za_cape_flats: { lang: 'en-ZA', voiceHints: ['South African', 'Cape'] },
  car_caribbean: { lang: 'en-JM', voiceHints: ['Caribbean', 'Jamaican'] },
  car_jamaican: { lang: 'en-JM', voiceHints: ['Jamaican', 'Jamaica', 'Caribbean'] },
  car_trinidadian: { lang: 'en-TT', voiceHints: ['Trinidad', 'Caribbean'] },
  car_barbadian: { lang: 'en-BB', voiceHints: ['Barbadian', 'Caribbean'] },
};

const LOCAL_GUIDES = [
  'Amara Clarke', 'Theo Mercer', 'Nadia Brooks', 'Elliot Shaw', 'Maya Khan', 'Jonah Price',
  'Leila Morgan', 'Caleb Singh', 'Iris Bennett', 'Noah Campbell', 'Zara McLeod', 'Finlay Ross',
  'Ailsa Grant', 'Callum Fraser', 'Orla Byrne', 'Cian Murphy', "Maeve O'Donnell", 'Ronan Walsh',
  'Sofia Reyes', 'Miles Carter', 'Imani Lewis', 'Lena Romano', 'Owen Sullivan', 'Avery Kim',
  'Jordan Ellis', 'Piper Hayes', 'Riley Dawson', 'Morgan Reed', 'Camille Tremblay', 'Evan Laurent',
  'Tessa Doyle', 'Matilda Chen', 'Lachlan Wright', 'Evie Nguyen', 'Anika Patel', 'Wiremu Taylor',
  'Naledi Mokoena', 'Thabo Dlamini', 'Priya Naidoo', 'Ayesha Daniels', 'Micah Grant', 'Zuri Bennett',
  'Kieran Joseph', 'Alana Browne',
];

const LOCAL_ROLES = [
  'cafe regular', 'flower seller', 'tram commuter', 'bookshop clerk',
  'food-stall owner', 'street photographer', 'office worker', 'local student',
];

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function familyFor(code) {
  if (/^(uk|sco|ie)_/.test(code)) return 'isles';
  if (/^(us|ca)_/.test(code)) return 'liberty';
  return 'sunward';
}

export function accentProfileFor(code, speakerIndex = 0) {
  const familyName = familyFor(code);
  const base = FAMILY[familyName];
  const specific = SPECIFIC[code] || {};
  const variation = ((hash(`${code}:${speakerIndex}`) % 7) - 3) * 0.008;
  return {
    family: familyName,
    lang: specific.lang || base.lang,
    kokoroVoice: base.kokoroVoices[speakerIndex % base.kokoroVoices.length],
    voiceHints: [...(specific.voiceHints || []), ...base.voiceHints],
    rate: (specific.rate || base.rate) + variation,
    pitch: (specific.pitch || base.pitch) + (speakerIndex % 2 ? -0.025 : 0.025),
  };
}

// A named face for one of the district's street locals. Deterministic per
// (district, slot) so the same person is standing outside the same shop every
// time you come back to that stop. `taken` (a Set of names already used in
// this district: the quest locals and earlier slots) is skipped so no district
// has two Lachlan Wrights on one terrace or a passer-by who is also the third
// quest local.
export function streetLocalFor(code, index, taken = null) {
  const h = hash(`${code}#${index}`);
  let ni = h % LOCAL_GUIDES.length;
  for (let tries = 0; taken && taken.has(LOCAL_GUIDES[ni]) && tries < LOCAL_GUIDES.length; tries++) {
    ni = (ni + 7) % LOCAL_GUIDES.length;   // 7 is coprime with 44
  }
  return {
    name: LOCAL_GUIDES[ni],
    role: LOCAL_ROLES[(h >>> 8) % LOCAL_ROLES.length],
  };
}

export function districtCastFor(data, zoneIndex) {
  const cast = data.npcs.slice();
  if (cast.length < 3) {
    const name = LOCAL_GUIDES[zoneIndex % LOCAL_GUIDES.length];
    cast.push({
      name,
      role: LOCAL_ROLES[zoneIndex % LOCAL_ROLES.length],
      greeting: `Welcome to ${data.zoneName}. I'm ${name.split(' ')[0]}; listen for the ${data.dialect} rhythm while you explore the neighbourhood.`,
      generated: true,
    });
  }
  return cast;
}
