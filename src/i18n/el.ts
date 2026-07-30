import { en } from "./en";



export const el: Record<keyof typeof en, string> = {

  appTitle: "ReachPanel",

  collapse: "Σύμπτυξη",

  expand: "Ανάπτυξη",

  minimizeSection: "Σμίκρυνση",

  dockSection: "Πρόσδεση ενότητας",

  undockSection: "Αποδέσμευση ενότητας",

  settings: "Ρυθμίσεις",

  close: "Κλείσιμο",

  add: "Προσθήκη",

  appNotInstalled: "Το {app} δεν είναι εγκατεστημένο.",

  installApp: "Εγκατάσταση",

  profile: "Προφίλ",

  accessibilityScreen: "Οθόνη προσβασιμότητας",

  largeHeaders: "Μεγάλα headers για εύκολη αλλαγή μεγέθους",

  largeHeadersHint:
    "Διπλασιάζει το ύψος των headers και τα κουμπιά τους. Σύρετε την κενή περιοχή του header για να αλλάξετε το ύψος ενότητας ή παραθύρου.",

  primary: "Κύρια",

  mouse: "Ποντίκι",

  numpad: "Αριθμητικό",

  mousePanelLeft: "Αριστερά του πληκτρολογίου",

  mousePanelRight: "Δεξιά του πληκτρολογίου",

  showMouseSection: "Εμφάνιση τμήματος ποντικιού",

  hideMouseSection: "Απόκρυψη τμήματος ποντικιού",

  speed: "Ταχύτητα",

  speedSlow: "Αργή",

  speedVerySlow: "Πολύ αργή",

  speedMedium: "Μέτρια",

  speedFast: "Γρήγορη",

  speedVeryFast: "Πολύ γρήγορη",

  quickActions: "Γρήγορες ενέργειες",

  showQuickActionsBar: "Εμφάνιση γρήγορων ενεργειών",

  phrasesAndSuggestions: "Φράσεις & Προτάσεις",

  showPhrasesSection: "Εμφάνιση φράσεων",

  showSuggestionsBar: "Εμφάνιση προτάσεων",

  showDictationControl: "Εμφάνιση υπαγόρευσης (μικρόφωνο)",

  opacity: "Διαφάνεια",

  appLanguage: "Γλώσσα εφαρμογής",

  appLanguageHint: "Μενού, φράσεις, προτάσεις και ομιλία",

  typingLanguage: "Γλώσσα πληκτρολογίου",

  typingLanguageHint: "Εισαγωγή κειμένου και διάταξη πλήκτρων",

  languageEnglish: "English",

  languageGreek: "Ελληνικά",

  resetSettings: "Επαναφορά ρυθμίσεων",

  resetSettingsHint:

    "Επαναφέρει διάταξη, θέση οθόνης, μεγέθη πάνελ και όλες τις ρυθμίσεις στις προεπιλογές.",

  resetUi: "Επαναφορά διεπαφής",

  resetUiHint:
    "Επαναφέρει όλες τις ρυθμίσεις (θέμα, ορατότητα, διάταξη, γλώσσες) στις προεπιλογές. Διατηρεί γρήγορες ενέργειες, μακροεντολές, φράσεις και προβλέψεις.",

  wipeProfile: "Εκκαθάριση προφίλ",

  wipeProfileHint:
    "Διαγράφει γρήγορες ενέργειες, μακροεντολές, φράσεις, προβλέψεις και παρακολούθηση κεφαλής, και επαναφέρει όλες τις ρυθμίσεις.",

  wipeProfileConfirm:
    "Εκκαθάριση αυτού του προφίλ; Όλες οι γρήγορες ενέργειες, μακροεντολές, φράσεις, προβλέψεις και ρυθμίσεις θα επαναφερθούν.",

  saveProfile: "Αποθήκευση προφίλ",

  profileSaved: "Το προφίλ αποθηκεύτηκε.",

  deleteProfile: "Διαγραφή προφίλ",

  deleteProfileConfirm:
    "Διαγραφή αυτού του προφίλ; Αν είναι ενεργό, θα δημιουργηθεί νέο προεπιλεγμένο προφίλ.",

  profileDeleted: "Το προφίλ διαγράφηκε.",

  profileWiped: "Το προφίλ εκκαθαρίστηκε.",

  layoutEdit: "Επεξεργασία διάταξης",

  layoutEditDone: "Τέλος",

  dragToMove: "Σύρετε για μετακίνηση",

  macroBuilder: "Δημιουργός μακροεντολών",

  headTracking: "Παρακολούθηση κεφαλής",

  phrases: "Φράσεις",

  emergency: "Επείγον",

  showEmergency: "Επείγον",

  predictionsOff: "Οι προτάσεις είναι απενεργοποιημένες",

  enable: "Ενεργοποίηση",

  suggest: "Πρόταση:",

  turnOff: "Απενεργοποίηση",

  inputError: "Σφάλμα εισόδου:",

  dismiss: "Απόρριψη",

  appearance: "Εμφάνιση",

  colorProfile: "Προφίλ χρωμάτων",

  colorProfileLightGrey: "Ανοιχτό γκρι",

  colorProfileDarkGrey: "Σκούρο γκρι",

  colorProfileCustom: "Προσαρμοσμένο",

  headerTextColor: "Κείμενο κεφαλίδας",

  appBackgroundColor: "Φόντο εφαρμογής",

  headerColor: "Γραμμή κεφαλίδας",

  keyboardBackgroundColor: "Φόντο πληκτρολογίου",

  keyboard: "Πληκτρολόγιο",

  fnKeyMode: "Συμπεριφορά πλήκτρου Fn",

  fnKeyModeOneShot: "Μίας χρήσης (το Fn απενεργοποιείται μετά από κάθε F-key)",

  fnKeyModeLatched: "Κλειδωμένο (το Fn μένει ενεργό μέχρι να το πατήσετε ξανά)",

  synthesizer: "Συνθετητής",

  synthesizerHint: "Πατήστε πλήκτρα για να παίξετε νότες",

  synthesizerVolume: "Ένταση",

  dictationStart: "Έναρξη υπαγόρευσης",

  dictationStop: "Διακοπή υπαγόρευσης",

  dictationListening: "Ακούει…",

  dictationErrorNoLanguage:
    "Η αναγνώριση ομιλίας για αυτή τη γλώσσα πληκτρολόγησης δεν είναι εγκατεστημένη. Προσθέστε το πακέτο ομιλίας στις Ρυθμίσεις Windows → Ώρα και γλώσσα → Ομιλία (ή Γλώσσα και περιοχή) και δοκιμάστε ξανά.",

  dictationErrorUnavailable:
    "Η υπαγόρευση φωνής είναι διαθέσιμη μόνο στα Windows.",

  dictationErrorSpeechPrivacy:
    "Η διαδικτυακή αναγνώριση ομιλίας είναι απενεργοποιημένη στα Windows. Ενεργοποιήστε την στις Ρυθμίσεις → Απόρρητο και ασφάλεια → Ομιλία και δοκιμάστε ξανά. (Δεν είναι αίτημα άδειας μικροφώνου.)",

  dictationErrorGroqKey:
    "Η αναγνώριση ομιλίας των Windows δεν υποστηρίζει αυτή τη γλώσσα. Προσθέστε ένα δωρεάν κλειδί Groq στις Ρυθμίσεις για υπαγόρευση (console.groq.com).",

  dictationErrorGroqApi:
    "Η υπαγόρευση cloud απέτυχε. Ελέγξτε τη σύνδεση στο διαδίκτυο και το κλειδί Groq και δοκιμάστε ξανά.",

  dictationUnavailableUnsupported:
    "Η υπαγόρευση δεν είναι διαθέσιμη — προσθέστε ένα δωρεάν κλειδί Groq στις Ρυθμίσεις για αυτή τη γλώσσα",

  dictationUnavailableOffline:
    "Η υπαγόρευση δεν είναι διαθέσιμη — απαιτείται σύνδεση στο διαδίκτυο",

  dictationOpenSpeechSettings: "Άνοιγμα ρυθμίσεων ομιλίας",

  dictationOpenSpeechLanguageSettings: "Εγκατάσταση γλώσσας ομιλίας",

  dictationOpenAppSettings: "Άνοιγμα ρυθμίσεων",

  groqApiKeyLabel: "Κλειδί Groq API (υπαγόρευση cloud)",

  groqApiKeyHint:
    "Απαιτείται για γλώσσες που δεν υποστηρίζουν τα Windows (π.χ. ελληνικά). Δωρεάν κλειδί στο console.groq.com. Μπορείτε επίσης να ορίσετε τη μεταβλητή περιβάλλοντος GROQ_API_KEY.",

  mute: "Σίγαση",

  unmute: "Ξεσίγαση",

  teachMusic: "Διδασκαλία",

  stopTeaching: "Διακοπή διδασκαλίας",

  musicLesson: "Μάθημα μουσικής",

  selectSong: "Τραγούδι",

  restartLesson: "Επανεκκίνηση",

  playSong: "Αναπαραγωγή",

  stopSong: "Διακοπή",

  loadSong: "Φόρτωση",

  deleteSong: "Διαγραφή",

  confirmDeleteSong: "Διαγραφή εισαγμένου τραγουδιού «{title}»;",

  builtInSongs: "Ενσωματωμένα",

  importedSongs: "Εισαγμένα",

  playingNote: "Παίζει",

  waitingForNote: "Παίξε",

  lessonComplete: "Το τραγούδι ολοκληρώθηκε!",

  upcomingNotes: "Επόμενες νότες",

  songNeedsOctaves: "Μετακινήστε το πιάνο στο {range} για να καλύψει το τραγούδι",

  songWiderThanPiano:
    "Το τραγούδι είναι μεγαλύτερο από 5 οκτάβες — κάποιες νότες είναι εκτός. Χρησιμοποιήστε ◀ ▶ για μετατόπιση.",

  pianoRange: "Πιάνο",

  songRange: "Τραγούδι",

  shiftPianoLower: "Μετατόπιση πιάνου χαμηλότερα",

  shiftPianoHigher: "Μετατόπιση πιάνου ψηλότερα",

  octavesShort: "οκτάβες",

  mouseHiddenForWidePiano: "Το ποντίκι κρύβεται με 5 οκτάβες",

  octaveCount2: "2 οκτάβες",

  octaveCount3: "3 οκτάβες",

  octaveCount4: "4 οκτάβες",

  octaveCount5: "5 οκτάβες",

  showKeyboardModeToggle: "Εμφάνιση εναλλαγής πληκτρολογίου / συνθετητή",

  keyboardSectionMode: "Λειτουργία τμήματος πληκτρολογίου",

  inputAreaNormal: "Κανονική προβολή",

  inputAreaCompact: "Μεγιστοποίηση πληκτρολογίου και trackpad",

  showMouseBottomRow: "Εμφάνιση σειράς drag, precision & scroll",

  resizeInputRow: "Αλλαγή μεγέθους πληκτρολογίου και ποντικιού",

  keyColor: "Χρώμα πλήκτρων",

  keyTextColor: "Χρώμα κειμένου πλήκτρων",

  mousePanelColor: "Πάνελ ποντικιού",

  chooseBackgroundImage: "Επιλογή εικόνας φόντου",

  removeBackgroundImage: "Αφαίρεση εικόνας φόντου",

  backgroundImageOpacity: "Ορατότητα εικόνας φόντου",

  newProfileFileName: "Όνομα νέου αρχείου προφίλ",

  createProfile: "Δημιουργία αρχείου προφίλ",

  updateAvailable: "Διαθέσιμη ενημέρωση",

  updateVersionInfo: "Υπάρχει νέα έκδοση:",

  updateNow: "Ενημέρωση τώρα",

  updateLater: "Αργότερα",

  skipThisVersion: "Παράλειψη αυτής της έκδοσης",

  updateDownloading: "Λήψη ενημέρωσης…",

  updatePreparing: "Προετοιμασία λήψης…",

  updateFailed: "Η ενημέρωση απέτυχε:",

  updateRetry: "Επανάληψη",

  checkForUpdates: "Έλεγχος για ενημερώσεις",

  updateUpToDate: "Έχετε την τελευταία έκδοση.",

  updateCheckFailed: "Δεν ήταν δυνατός ο έλεγχος για ενημερώσεις.",


  settingsVisibleSections: "Ορατά τμήματα",

  settingsGeneral: "Γενικά",

  settingsToolsMaintenance: "Εργαλεία & Συντήρηση",

  quickActionLabel: "Ετικέτα",

  quickActionTarget: "Στόχος (εφαρμογή ή URL)",

  quickActionTypeApp: "Εφαρμογή",

  quickActionTypeUrl: "URL",

  quickActionAdd: "Προσθήκη ενέργειας",

  quickActionDelete: "Διαγραφή",

  quickActionSearchApps: "Αναζήτηση εγκατεστημένων προγραμμάτων…",

  quickActionBrowse: "Εξερεύνηση…",

  quickActionLoadingApps: "Φόρτωση εγκατεστημένων προγραμμάτων…",

  quickActionNoApps: "Δεν βρέθηκαν προγράμματα.",

  settingsAbout: "Σχετικά",

  aboutDescription:
    "Εικονικό πληκτρολόγιο και ποντίκι προσβασιμότητας για Windows.",

  aboutVersion: "Έκδοση",

  aboutCreatedBy: "Δημιουργός",

  aboutGitHub: "GitHub",

  aboutSource: "Πηγαίος κώδικας",

  aboutTwitter: "X",

  aboutLinkedIn: "LinkedIn",

  aboutWebsite: "Ιστοσελίδα",

  aboutEmail: "Email",

};
