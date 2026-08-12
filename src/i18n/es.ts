import { en } from "./en";

export const es: Record<keyof typeof en, string> = {
  appTitle: "ReachPanel",

  collapse: "Contraer",

  expand: "Expandir",

  minimizeSection: "Minimizar",

  dockSection: "Anclar sección",

  undockSection: "Desanclar sección",

  settings: "Configuración",

  close: "Cerrar",

  add: "Añadir",

  appNotInstalled: "{app} no está instalado.",

  installApp: "Instalar",

  profile: "Perfil",

  accessibilityScreen: "Pantalla de accesibilidad",

  miniMode: "Modo Mini",

  miniModeAutoDescription:
    "En una sola pantalla o configuración reflejada, el teclado aparece automáticamente al tocar un campo de entrada.",

  miniModeOverrideLabel: "Modo Mini",

  miniModeOverrideAuto: "Automático",

  miniModeOverrideOn: "Activado",

  miniModeOverrideOff: "Desactivado",

  miniModeTransparent: "Teclado transparente",

  miniModeTransparentDescription:
    "Mostrar teclas solo con contornos para ver las aplicaciones detrás.",

  miniModeCollapse: "Volver al Modo Mini",

  largeHeaders: "Encabezados grandes para redimensionar más fácilmente",

  largeHeadersHint:
    "Duplica la altura de los encabezados y sus botones. Arrastra el área vacía del encabezado para cambiar la altura de la sección o ventana.",

  primary: "Principal",

  mouse: "Ratón",

  numpad: "Teclado numérico",

  mousePanelLeft: "A la izquierda del teclado",

  mousePanelRight: "A la derecha del teclado",

  showMouseSection: "Mostrar sección del ratón",

  hideMouseSection: "Ocultar sección del ratón",

  speed: "Velocidad",

  speedSlow: "Lenta",

  speedVerySlow: "Muy lenta",

  speedMedium: "Media",

  speedFast: "Rápida",

  speedVeryFast: "Muy rápida",

  quickActions: "Acciones rápidas",

  showQuickActionsBar: "Mostrar barra de acciones rápidas",

  phrasesAndSuggestions: "Frases y sugerencias",

  showPhrasesSection: "Mostrar sección de frases",

  showSuggestionsBar: "Mostrar barra de sugerencias",

  predictionDictionaries: "Diccionarios de predicción",

  predictionDictionariesHint:
    "El inglés viene incluido. Descarga otros idiomas según necesites. Las sugerencias siguen el idioma de escritura.",

  wordPackInstalled: "Instalado",

  wordPackNotInstalled: "No instalado",

  wordPackInstall: "Instalar",

  wordPackUninstall: "Quitar",

  wordPackInstalling: "Instalando…",

  wordPackUninstalling: "Quitando…",

  wordPackRequired: "Obligatorio",

  wordPackInstallFailed: "No se pudo instalar el diccionario",

  wordPackUninstallFailed: "No se pudo quitar el diccionario",

  showDictationControl: "Mostrar dictado (micrófono)",

  opacity: "Opacidad",

  appLanguage: "Idioma de la aplicación",

  appLanguageHint: "Menús, frases y voz",

  typingLanguage: "Idioma de escritura",

  typingLanguageHint: "Idioma del teclado de Windows para escribir",

  onscreenLayout: "Diseño en pantalla",

  onscreenLayoutHint: "Disposición de teclas del teclado virtual",

  onscreenLayoutAuto: "Auto (seguir Windows)",

  languageEnglish: "English",

  languageGreek: "Griego",

  languageGerman: "Alemán",

  languageFrench: "Francés",

  languageItalian: "Italiano",

  languageSpanish: "Español",

  languagePortuguese: "Portugués",


  resetSettings: "Restablecer configuración",

  resetSettingsHint:
    "Restaura el diseño, la posición del monitor, los tamaños de panel y el resto de ajustes a sus valores predeterminados.",

  resetUi: "Restablecer interfaz",

  resetUiHint:
    "Restaura todos los ajustes (tema, visibilidad, diseño, idiomas). Conserva acciones rápidas, macros, frases y predicciones.",

  wipeProfile: "Borrar perfil",

  wipeProfileHint:
    "Borra acciones rápidas, macros, frases, predicciones y seguimiento de cabeza, y restablece todos los ajustes.",

  wipeProfileConfirm:
    "¿Borrar este perfil? Se restablecerán todas las acciones rápidas, macros, frases, predicciones y ajustes.",

  saveProfile: "Guardar perfil",

  profileSaved: "Perfil guardado.",

  deleteProfile: "Eliminar perfil",

  deleteProfileConfirm: "¿Eliminar este perfil? Si está activo, se creará un perfil predeterminado nuevo.",

  profileDeleted: "Perfil eliminado.",

  profileWiped: "Perfil borrado.",

  layoutEdit: "Editar diseño",

  layoutEditDone: "Listo",

  dragToMove: "Arrastrar para mover",

  macroBuilder: "Creador de macros",

  headTracking: "Seguimiento de cabeza",

  phrases: "Frases",

  emergency: "Emergencia",

  showEmergency: "Emergencia",

  predictionsOff: "Predicciones desactivadas",

  enable: "Activar",

  suggest: "Sugerencia:",

  turnOff: "Desactivar",

  inputError: "Error de entrada:",

  dismiss: "Descartar",

  appearance: "Apariencia",

  colorProfile: "Perfil de color",

  colorProfileLightGrey: "Gris claro",

  colorProfileDarkGrey: "Gris oscuro",

  colorProfileCustom: "Personalizado",

  headerTextColor: "Texto del encabezado",

  appBackgroundColor: "Fondo de la aplicación",

  headerColor: "Barra de encabezado",

  keyboardBackgroundColor: "Fondo del teclado",

  keyboard: "Teclado",

  fnKeyMode: "Comportamiento de la tecla Fn",

  fnKeyModeOneShot: "Una vez (Fn se apaga tras cada tecla F)",

  fnKeyModeLatched: "Bloqueado (Fn permanece activo hasta pulsar de nuevo)",

  synthesizer: "Sintetizador",

  synthesizerHint: "Pulsa las teclas para tocar notas",

  synthesizerVolume: "Volumen",

  dictationStart: "Iniciar dictado",

  dictationStop: "Detener dictado",

  dictationListening: "Escuchando…",

  dictationErrorNoLanguage:
    "El reconocimiento de voz para este idioma de escritura no está instalado. Añade el paquete de voz en Configuración de Windows → Hora e idioma → Voz e inténtalo de nuevo.",

  dictationErrorUnavailable: "El dictado por voz solo está disponible en Windows.",

  dictationErrorSpeechPrivacy:
    "El reconocimiento de voz en línea está desactivado en Windows. Actívalo en Privacidad y seguridad → Voz e inténtalo de nuevo. (No es un permiso del micrófono.)",

  dictationErrorGroqKey:
    "El reconocimiento de voz de Windows no admite este idioma. Añade una clave API Groq gratuita en Configuración (console.groq.com).",

  dictationErrorGroqApi:
    "Error en el dictado en la nube. Comprueba la conexión a Internet y la clave API Groq e inténtalo de nuevo.",

  dictationUnavailableUnsupported:
    "Dictado no disponible — añade una clave API Groq gratuita en Configuración para este idioma",

  dictationUnavailableOffline: "Dictado no disponible — se requiere conexión a Internet",

  dictationOpenSpeechSettings: "Abrir configuración de voz",

  dictationOpenSpeechLanguageSettings: "Instalar idioma de voz",

  dictationOpenAppSettings: "Abrir Configuración",

  groqApiKeyLabel: "Clave API Groq (dictado en la nube)",

  groqApiKeyHint:
    "Necesaria para idiomas que Windows no admite (p. ej. griego). Clave gratuita en console.groq.com. También puedes definir la variable de entorno GROQ_API_KEY.",

  mute: "Silenciar",

  unmute: "Activar sonido",

  teachMusic: "Enseñar",

  stopTeaching: "Dejar de enseñar",

  musicLesson: "Lección de música",

  partiture: "Partitura",

  selectSong: "Canción",

  restartLesson: "Reiniciar",

  playSong: "Reproducir",

  stopSong: "Detener",

  loadSong: "Cargar",

  deleteSong: "Eliminar",

  confirmDeleteSong: "¿Eliminar la canción importada «{title}»?",

  builtInSongs: "Integradas",

  importedSongs: "Importadas",

  playingNote: "Reproduciendo",

  waitingForNote: "Toca",

  lessonComplete: "¡Canción completada!",

  upcomingNotes: "Próximas notas",

  songNeedsOctaves: "Mueve el piano a {range} para cubrir esta canción",

  songWiderThanPiano:
    "Esta canción supera 5 octavas — algunas notas quedan fuera. Usa ◀ ▶ para desplazar.",

  pianoRange: "Piano",

  songRange: "Canción",

  shiftPianoLower: "Desplazar piano más bajo",

  shiftPianoHigher: "Desplazar piano más alto",

  octavesShort: "octavas",

  mouseHiddenForWidePiano: "Ratón oculto con 5 octavas",

  octaveCount2: "2 octavas",

  octaveCount3: "3 octavas",

  octaveCount4: "4 octavas",

  octaveCount5: "5 octavas",

  showKeyboardModeToggle: "Mostrar conmutador teclado / sintetizador",

  keyboardSectionMode: "Modo de la sección del teclado",

  inputAreaNormal: "Vista normal",

  inputAreaCompact: "Maximizar teclado y trackpad",

  showMouseBottomRow: "Mostrar fila arrastrar, precisión y desplazamiento",

  resizeInputRow: "Redimensionar paneles de teclado y ratón",

  keyColor: "Color de teclas",

  keyTextColor: "Color del texto de teclas",

  mousePanelColor: "Panel del ratón",

  chooseBackgroundImage: "Elegir imagen de fondo",

  removeBackgroundImage: "Quitar imagen de fondo",

  backgroundImageOpacity: "Visibilidad de la imagen de fondo",

  newProfileFileName: "Nombre del nuevo archivo de perfil",

  createProfile: "Crear archivo de perfil",

  updateAvailable: "Actualización disponible",

  updateVersionInfo: "Hay una nueva versión disponible:",

  updateNow: "Actualizar ahora",

  updateLater: "Más tarde",

  skipThisVersion: "Omitir esta versión",

  updateDownloading: "Descargando actualización…",

  updatePreparing: "Preparando descarga…",

  updateFailed: "Error de actualización:",

  updateRetry: "Reintentar",

  checkForUpdates: "Buscar actualizaciones",

  updateUpToDate: "Tienes la última versión.",

  updateCheckFailed: "No se pudieron buscar actualizaciones.",

  settingsVisibleSections: "Secciones visibles",

  settingsGeneral: "General",

  settingsToolsMaintenance: "Herramientas y mantenimiento",

  quickActionLabel: "Etiqueta",

  quickActionTarget: "Destino (app o URL)",

  quickActionTypeApp: "App",

  quickActionTypeUrl: "URL",

  quickActionAdd: "Añadir acción",

  quickActionDelete: "Eliminar",

  quickActionSearchApps: "Buscar programas instalados…",

  quickActionBrowse: "Examinar…",

  quickActionLoadingApps: "Cargando programas instalados…",

  quickActionNoApps: "No se encontraron programas.",

  settingsAbout: "Acerca de",

  aboutDescription: "Teclado y ratón virtuales de asistencia para Windows.",

  aboutVersion: "Versión",

  aboutCreatedBy: "Creado por",

  aboutGitHub: "GitHub",

  aboutSource: "Código fuente",

  aboutTwitter: "X",

  aboutLinkedIn: "LinkedIn",

  aboutWebsite: "Sitio web",

  aboutEmail: "Correo",

};
