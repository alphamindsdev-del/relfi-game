export type Category = {
  id: string;
  name: string;
  color: string; // hex
  icon: string; // lucide name key
  definition: string;
};

export type ClueVariant =
  | { kind: "none" }
  | { kind: "narrowed"; categoryIds: string[] }
  | { kind: "partial"; text: string }
  | { kind: "exact"; categoryId: string }
  | { kind: "image"; url: string };

export type StatementCard = {
  id: string;
  text: string;
  correctCategoryId: string;
  clue: ClueVariant;
  friction?: string;
};

export type Deck = {
  id: string;
  title: string;
  description: string;
  categoryIds: string[];
  cards: StatementCard[];
};

export type Player = {
  id: string;
  name: string;
  avatarHue: number;
  tokens: number;
  connected: boolean;
  ready: boolean;
};

export const MOCK_CATEGORIES: Category[] = [
  { id: "fact", name: "Cold Fact", color: "#8B5CF6", icon: "ScrollText", definition: "Verifiable, no spin." },
  { id: "opinion", name: "Hot Take", color: "#F59E0B", icon: "Flame", definition: "A personal view stated as truth." },
  { id: "rumor", name: "Rumor", color: "#EC4899", icon: "MessagesSquare", definition: "Unverified, widely repeated." },
  { id: "myth", name: "Myth", color: "#22D3EE", icon: "Sparkles", definition: "Believed but demonstrably false." },
  { id: "spin", name: "Spin", color: "#84CC16", icon: "Wind", definition: "True facts arranged to mislead." },
  { id: "lie", name: "Bald Lie", color: "#EF4444", icon: "Skull", definition: "Fabricated. Full stop." },
];

export const MOCK_DECK: Deck = {
  id: "deck-launch",
  title: "The House Deck",
  description: "50 hand-picked statements from politics, science, sports, and the internet.",
  categoryIds: MOCK_CATEGORIES.map((c) => c.id),
  cards: [
    {
      id: "c1",
      text: "Humans only use 10% of their brain. The other 90% is untapped potential.",
      correctCategoryId: "myth",
      clue: { kind: "narrowed", categoryIds: ["myth", "opinion"] },
      friction:
        "Neuroimaging shows activity across virtually all of the brain over a normal day. The 10% figure has no scientific basis.",
    },
    {
      id: "c2",
      text: "A well-known tech CEO once claimed self-driving cars would be fully autonomous 'by next year', every year for eight years running.",
      correctCategoryId: "spin",
      clue: { kind: "partial", text: "The statement is technically citing real quotes, but arranged to mislead about the underlying trajectory." },
    },
    {
      id: "c3",
      text: "The Great Wall of China is visible from the Moon with the naked eye.",
      correctCategoryId: "myth",
      clue: { kind: "exact", categoryId: "myth" },
      friction: "Astronauts have repeatedly confirmed it is not visible from lunar distance without aid.",
    },
    {
      id: "c4",
      text: "The player wearing #23 will drop 40 tonight. Book it.",
      correctCategoryId: "opinion",
      clue: { kind: "narrowed", categoryIds: ["opinion", "rumor"] },
    },
    {
      id: "c5",
      text: "Water boils at 100°C at sea level.",
      correctCategoryId: "fact",
      clue: { kind: "none" },
    },
    {
      id: "c6",
      text: "A source close to the situation says the deal is done. Announcement Monday.",
      correctCategoryId: "rumor",
      clue: { kind: "partial", text: "Trace it back and you'll find the primary source is a single anonymous tweet." },
    },
  ],
};

export const MOCK_PLAYERS: Player[] = [
  { id: "p1", name: "Nia", avatarHue: 280, tokens: 7, connected: true, ready: true },
  { id: "p2", name: "Marco", avatarHue: 40, tokens: 5, connected: true, ready: true },
  { id: "p3", name: "Kenji", avatarHue: 160, tokens: 9, connected: true, ready: true },
  { id: "p4", name: "Amara", avatarHue: 340, tokens: 3, connected: true, ready: false },
  { id: "p5", name: "Ovi", avatarHue: 200, tokens: 6, connected: true, ready: true },
];

export const YOU_ID = "p1";
