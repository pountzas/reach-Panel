import { en } from "./en";



export const el: Record<keyof typeof en, string> = {

  appTitle: "ReachPanel",

  collapse: "Σύμπτυξη",

  expand: "Ανάπτυξη",

  minimizeSection: "Σμίκρυνση",

  settings: "Ρυθμίσεις",

  close: "Κλείσιμο",

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

  dictationErrorWhisperModel:
    "Το τοπικό μοντέλο ομιλίας δεν είναι έτοιμο ακόμα. Κατεβάστε το για υπαγόρευση εκτός σύνδεσης ή σε γλώσσες που δεν υποστηρίζει η Windows (όπως τα ελληνικά).",

  dictationErrorWinrtUnsupported:
    "Η αναγνώριση ομιλίας των Windows δεν υποστηρίζει αυτή τη γλώσσα. Κατεβάστε το τοπικό μοντέλο ομιλίας για υπαγόρευση.",

  dictationUnavailableUnsupported:
    "Η υπαγόρευση δεν είναι διαθέσιμη — κατεβάστε το τοπικό μοντέλο ομιλίας για αυτή τη γλώσσα",

  dictationUnavailableOffline:
    "Η υπαγόρευση δεν είναι διαθέσιμη εκτός σύνδεσης — κατεβάστε το τοπικό μοντέλο ομιλίας",

  dictationDownloadModel: "Λήψη μοντέλου ομιλίας",

  dictationDownloadingModel: "Λήψη μοντέλου ομιλίας…",

  dictationOpenSpeechSettings: "Άνοιγμα ρυθμίσεων ομιλίας",

  dictationOpenSpeechLanguageSettings: "Εγκατάσταση γλώσσας ομιλίας",

  mute: "Σίγαση",

  unmute: "Ξεσίγαση",

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
