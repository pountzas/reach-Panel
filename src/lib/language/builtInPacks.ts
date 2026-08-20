import type { LanguagePack, LanguageSpellTask } from "./types";

function spell(answer: string, hint?: string): LanguageSpellTask {
  return hint ? { type: "spell", answer, hint } : { type: "spell", answer };
}

export const BUILT_IN_LANGUAGE_PACKS: LanguagePack[] = [
  {
    id: "el-spell-early-01",
    title: "Ελληνικά — Πρώτες λέξεις",
    lessonLanguage: "el",
    ageBand: "early",
    tasks: [
      spell("μαμά"),
      spell("μπαμπά"),
      spell("σπίτι"),
      spell("γάτα"),
      spell("σκύλος"),
      spell("ήλιος"),
      spell("φεγγάρι"),
      spell("νερό"),
    ],
  },
  {
    id: "el-spell-primary-01",
    title: "Ελληνικά — Ορθογραφία",
    lessonLanguage: "el",
    ageBand: "primary",
    tasks: [
      spell("βιβλίο", "Διαβάζω ένα ___."),
      spell("σχολείο", "Πηγαίνω στο ___ κάθε πρωί."),
      spell("φίλος"),
      spell("οικογένεια"),
      spell("ημέρα"),
      spell("νερό"),
      spell("γάλα"),
      spell("παιχνίδι"),
      spell("χαρά"),
      spell("ελπίδα"),
    ],
  },
  {
    id: "en-spell-early-01",
    title: "English — First words",
    lessonLanguage: "en",
    ageBand: "early",
    tasks: [
      spell("cat"),
      spell("dog"),
      spell("sun"),
      spell("book"),
      spell("home"),
      spell("mum"),
      spell("dad"),
      spell("water"),
    ],
  },
  {
    id: "en-spell-primary-01",
    title: "English — Spelling",
    lessonLanguage: "en",
    ageBand: "primary",
    tasks: [
      spell("friend", "My best ___ lives next door."),
      spell("school", "We learn at ___."),
      spell("family"),
      spell("water"),
      spell("book"),
      spell("happy"),
      spell("garden"),
      spell("morning"),
      spell("teacher"),
      spell("student"),
    ],
  },
];
