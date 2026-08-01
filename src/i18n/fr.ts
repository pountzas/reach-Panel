import { en } from "./en";

export const fr: Record<keyof typeof en, string> = {
  appTitle: "ReachPanel",

  collapse: "Réduire",

  expand: "Développer",

  minimizeSection: "Réduire",

  dockSection: "Ancrer la section",

  undockSection: "Détacher la section",

  settings: "Paramètres",

  close: "Fermer",

  add: "Ajouter",

  appNotInstalled: "{app} n’est pas installé.",

  installApp: "Installer",

  profile: "Profil",

  accessibilityScreen: "Écran d’accessibilité",

  largeHeaders: "En-têtes larges pour un redimensionnement plus facile",

  largeHeadersHint:
    "Double la hauteur des en-têtes et des boutons. Faites glisser la zone vide de l’en-tête pour changer la hauteur de la section ou de la fenêtre.",

  primary: "Principal",

  mouse: "Souris",

  numpad: "Pavé numérique",

  mousePanelLeft: "À gauche du clavier",

  mousePanelRight: "À droite du clavier",

  showMouseSection: "Afficher la section souris",

  hideMouseSection: "Masquer la section souris",

  speed: "Vitesse",

  speedSlow: "Lente",

  speedVerySlow: "Très lente",

  speedMedium: "Moyenne",

  speedFast: "Rapide",

  speedVeryFast: "Très rapide",

  quickActions: "Actions rapides",

  showQuickActionsBar: "Afficher la barre d’actions rapides",

  phrasesAndSuggestions: "Phrases et suggestions",

  showPhrasesSection: "Afficher la section phrases",

  showSuggestionsBar: "Afficher la barre de suggestions",

  predictionDictionaries: "Dictionnaires de prédiction",

  predictionDictionariesHint:
    "L’anglais est inclus. Téléchargez d’autres langues au besoin. Les suggestions suivent la langue de saisie.",

  wordPackInstalled: "Installé",

  wordPackNotInstalled: "Non installé",

  wordPackInstall: "Installer",

  wordPackUninstall: "Supprimer",

  wordPackInstalling: "Installation…",

  wordPackUninstalling: "Suppression…",

  wordPackRequired: "Obligatoire",

  wordPackInstallFailed: "Impossible d’installer le dictionnaire",

  wordPackUninstallFailed: "Impossible de supprimer le dictionnaire",

  showDictationControl: "Afficher la dictée (micro)",

  opacity: "Opacité",

  appLanguage: "Langue de l’application",

  appLanguageHint: "Menus, phrases et parole",

  typingLanguage: "Langue de saisie",

  typingLanguageHint: "Langue du clavier Windows pour la saisie",

  onscreenLayout: "Disposition à l’écran",

  onscreenLayoutHint: "Disposition des touches du clavier virtuel",

  onscreenLayoutAuto: "Auto (suivre Windows)",

  languageEnglish: "Anglais",

  languageGreek: "Grec",

  languageGerman: "Allemand",

  languageFrench: "Français",

  languageItalian: "Italien",

  languageSpanish: "Espagnol",

  languagePortuguese: "Portugais",


  resetSettings: "Réinitialiser les paramètres",

  resetSettingsHint:
    "Restaure la disposition, la position du moniteur, les tailles des panneaux et tous les autres paramètres par défaut.",

  resetUi: "Réinitialiser l’interface",

  resetUiHint:
    "Restaure tous les paramètres (thème, visibilité, disposition, langues). Conserve les actions rapides, macros, phrases et prédictions.",

  wipeProfile: "Effacer le profil",

  wipeProfileHint:
    "Efface les actions rapides, macros, phrases, prédictions et suivi de tête, et réinitialise tous les paramètres.",

  wipeProfileConfirm:
    "Effacer ce profil ? Toutes les actions rapides, macros, phrases, prédictions et paramètres seront réinitialisés.",

  saveProfile: "Enregistrer le profil",

  profileSaved: "Profil enregistré.",

  deleteProfile: "Supprimer le profil",

  deleteProfileConfirm: "Supprimer ce profil ? S’il est actif, un nouveau profil par défaut sera créé.",

  profileDeleted: "Profil supprimé.",

  profileWiped: "Profil effacé.",

  layoutEdit: "Modifier la disposition",

  layoutEditDone: "Terminé",

  dragToMove: "Glisser pour déplacer",

  macroBuilder: "Créateur de macros",

  headTracking: "Suivi de tête",

  phrases: "Phrases",

  emergency: "Urgence",

  showEmergency: "Urgence",

  predictionsOff: "Prédictions désactivées",

  enable: "Activer",

  suggest: "Suggestion :",

  turnOff: "Désactiver",

  inputError: "Erreur de saisie :",

  dismiss: "Fermer",

  appearance: "Apparence",

  colorProfile: "Profil de couleurs",

  colorProfileLightGrey: "Gris clair",

  colorProfileDarkGrey: "Gris foncé",

  colorProfileCustom: "Personnalisé",

  headerTextColor: "Texte de l’en-tête",

  appBackgroundColor: "Arrière-plan de l’app",

  headerColor: "Barre d’en-tête",

  keyboardBackgroundColor: "Arrière-plan du clavier",

  keyboard: "Clavier",

  fnKeyMode: "Comportement de la touche Fn",

  fnKeyModeOneShot: "Une fois (Fn s’éteint après chaque touche F)",

  fnKeyModeLatched: "Verrouillé (Fn reste actif jusqu’à un nouvel appui)",

  synthesizer: "Synthétiseur",

  synthesizerHint: "Appuyez sur les touches pour jouer des notes",

  synthesizerVolume: "Volume",

  dictationStart: "Démarrer la dictée",

  dictationStop: "Arrêter la dictée",

  dictationListening: "Écoute…",

  dictationErrorNoLanguage:
    "La reconnaissance vocale pour cette langue de saisie n’est pas installée. Ajoutez le pack vocal dans Paramètres Windows → Heure et langue → Parole, puis réessayez.",

  dictationErrorUnavailable: "La dictée vocale n’est disponible que sous Windows.",

  dictationErrorSpeechPrivacy:
    "La reconnaissance vocale en ligne est désactivée dans Windows. Activez-la dans Confidentialité et sécurité → Parole, puis réessayez. (Ce n’est pas une demande d’autorisation du micro.)",

  dictationErrorGroqKey:
    "La reconnaissance vocale Windows ne prend pas en charge cette langue. Ajoutez une clé API Groq gratuite dans les Paramètres (console.groq.com).",

  dictationErrorGroqApi:
    "Échec de la dictée cloud. Vérifiez votre connexion Internet et votre clé API Groq, puis réessayez.",

  dictationUnavailableUnsupported:
    "Dictée indisponible — ajoutez une clé API Groq gratuite dans les Paramètres pour cette langue",

  dictationUnavailableOffline: "Dictée indisponible — une connexion Internet est requise",

  dictationOpenSpeechSettings: "Ouvrir les paramètres de parole",

  dictationOpenSpeechLanguageSettings: "Installer la langue de parole",

  dictationOpenAppSettings: "Ouvrir les Paramètres",

  groqApiKeyLabel: "Clé API Groq (dictée cloud)",

  groqApiKeyHint:
    "Nécessaire pour les langues non prises en charge par Windows (ex. grec). Clé gratuite sur console.groq.com. Vous pouvez aussi définir la variable d’environnement GROQ_API_KEY.",

  mute: "Muet",

  unmute: "Réactiver le son",

  teachMusic: "Enseigner",

  stopTeaching: "Arrêter l’enseignement",

  musicLesson: "Leçon de musique",

  partiture: "Partition",

  selectSong: "Chanson",

  restartLesson: "Recommencer",

  playSong: "Lire",

  stopSong: "Arrêter",

  loadSong: "Charger",

  deleteSong: "Supprimer",

  confirmDeleteSong: "Supprimer la chanson importée « {title} » ?",

  builtInSongs: "Intégrées",

  importedSongs: "Importées",

  playingNote: "Lecture",

  waitingForNote: "Jouer",

  lessonComplete: "Chanson terminée !",

  upcomingNotes: "Notes à venir",

  songNeedsOctaves: "Déplacez le piano sur {range} pour couvrir cette chanson",

  songWiderThanPiano:
    "Cette chanson dépasse 5 octaves — certaines notes sont hors fenêtre. Utilisez ◀ ▶ pour décaler.",

  pianoRange: "Piano",

  songRange: "Chanson",

  shiftPianoLower: "Décaler le piano plus bas",

  shiftPianoHigher: "Décaler le piano plus haut",

  octavesShort: "octaves",

  mouseHiddenForWidePiano: "Souris masquée avec 5 octaves",

  octaveCount2: "2 octaves",

  octaveCount3: "3 octaves",

  octaveCount4: "4 octaves",

  octaveCount5: "5 octaves",

  showKeyboardModeToggle: "Afficher la bascule clavier / synthétiseur",

  keyboardSectionMode: "Mode de la section clavier",

  inputAreaNormal: "Vue normale",

  inputAreaCompact: "Maximiser clavier et pavé tactile",

  showMouseBottomRow: "Afficher la ligne glisser, précision et défilement",

  resizeInputRow: "Redimensionner les panneaux clavier et souris",

  keyColor: "Couleur des touches",

  keyTextColor: "Couleur du texte des touches",

  mousePanelColor: "Panneau souris",

  chooseBackgroundImage: "Choisir une image de fond",

  removeBackgroundImage: "Supprimer l’image de fond",

  backgroundImageOpacity: "Visibilité de l’image de fond",

  newProfileFileName: "Nom du nouveau fichier de profil",

  createProfile: "Créer un fichier de profil",

  updateAvailable: "Mise à jour disponible",

  updateVersionInfo: "Une nouvelle version est disponible :",

  updateNow: "Mettre à jour maintenant",

  updateLater: "Plus tard",

  skipThisVersion: "Ignorer cette version",

  updateDownloading: "Téléchargement de la mise à jour…",

  updatePreparing: "Préparation du téléchargement…",

  updateFailed: "Échec de la mise à jour :",

  updateRetry: "Réessayer",

  checkForUpdates: "Rechercher les mises à jour",

  updateUpToDate: "Vous avez la dernière version.",

  updateCheckFailed: "Impossible de vérifier les mises à jour.",

  settingsVisibleSections: "Sections visibles",

  settingsGeneral: "Général",

  settingsToolsMaintenance: "Outils et maintenance",

  quickActionLabel: "Libellé",

  quickActionTarget: "Cible (app ou URL)",

  quickActionTypeApp: "App",

  quickActionTypeUrl: "URL",

  quickActionAdd: "Ajouter une action",

  quickActionDelete: "Supprimer",

  quickActionSearchApps: "Rechercher des programmes installés…",

  quickActionBrowse: "Parcourir…",

  quickActionLoadingApps: "Chargement des programmes installés…",

  quickActionNoApps: "Aucun programme correspondant.",

  settingsAbout: "À propos",

  aboutDescription: "Clavier et souris virtuels d’assistance pour Windows.",

  aboutVersion: "Version",

  aboutCreatedBy: "Créé par",

  aboutGitHub: "GitHub",

  aboutSource: "Source",

  aboutTwitter: "X",

  aboutLinkedIn: "LinkedIn",

  aboutWebsite: "Site web",

  aboutEmail: "E-mail",

};
