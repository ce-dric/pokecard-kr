export interface CardRef {
  id: number;
  serial: number;
  playerIndex?: number;
}

export interface PokemonState extends CardRef {
  hp: number;
  maxHp: number;
  energies: number[];
}

export interface PlayerView {
  active: (PokemonState | null)[];
  bench: PokemonState[];
  benchMax: number;
  deckCount: number;
  discard: CardRef[];
  prize: (CardRef | null)[];
  handCount: number;
  hand: CardRef[] | null;
  poisoned: boolean;
  burned: boolean;
  asleep: boolean;
  paralyzed: boolean;
  confused: boolean;
}

export interface Option {
  type: number;
  number?: number;
  area?: number;
  index?: number;
  playerIndex?: number;
  count?: number;
  inPlayArea?: number;
  inPlayIndex?: number;
  attackId?: number;
}

export interface SelectState {
  type: number;
  context: number;
  minCount: number;
  maxCount: number;
  option: Option[];
}

export interface BattleLog {
  type: number;
  playerIndex?: number;
  cardId?: number;
  attackId?: number;
  value?: number;
  head?: boolean;
  result?: number;
  reason?: number;
  isRecover?: boolean;
  fromArea?: number;
  toArea?: number;
}

export interface Observation {
  select: SelectState | null;
  logs: BattleLog[];
  current: {
    turn: number;
    yourIndex: number;
    result: number;
    energyAttached: boolean;
    stadium: CardRef[];
    looking?: CardRef[];
    players: PlayerView[];
  };
}

export interface CardData {
  cardId: number;
  name: string;
  cardType: number;
  hp: number;
  energyType: number;
  basic: boolean;
  ex: boolean;
  megaEx: boolean;
  weakness: number | null;
  resistance: number | null;
}

export interface AttackData {
  attackId: number;
  name: string;
  damage: number;
}

export interface Catalogs {
  cards: Map<number, CardData>;
  attacks: Map<number, AttackData>;
}

export interface CardLink {
  setId: string;
  slug: string;
  number: string;
  nameKo: string | null;
  image: string | null;
}

export interface FallbackImage {
  thumb: string;
  full: string;
  page: string;
}

export interface MappedCard {
  id: number;
  setCode: string;
  number: string;
  nameJa: string | null;
  link: CardLink | null;
  picture: FallbackImage | null;
}

export interface CardMapping {
  source: {
    repo: string;
    commit: string;
    csv: string;
    matches: Record<string, number>;
    linked: Record<string, number>;
  };
  cards: Record<string, MappedCard>;
}

export interface DeckFile {
  id: string;
  titleKo: string;
  faceEn: string;
  cards: number[];
}

export interface PtcgModule {
  _GameInitialize: () => void;
  _BattleStart: (outPtr: number, cardsPtr: number) => void;
  _GetBattleData: (outPtr: number, battlePtr: number) => void;
  _Select: (battlePtr: number, selectPtr: number, count: number) => number;
  _BattleFinish: (battlePtr: number) => void;
  _AllCard: () => number;
  _AllAttack: () => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  UTF8ToString: (ptr: number) => string;
  getValue: (ptr: number, type: string) => number;
  setValue: (ptr: number, value: number, type: string) => void;
}
