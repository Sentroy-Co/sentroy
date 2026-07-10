import type { Locale } from "@/i18n/routing"
import type { BlogTopicLocale } from "./topics"

/**
 * Çeviri workflow'u ile üretilen topic locale'leri (es, pt, de, fr, ru, ar, hi, id).
 * topics.ts bunu BLOG_TOPICS'e merge eder. tr + en elle topics.ts'te.
 */
export const TRANSLATED_TOPIC_LOCALES: Record<string, Partial<Record<Locale, BlogTopicLocale>>> = {
  "yt-video-download": {
    "es": {
      "slug": "descargar-videos-de-youtube",
      "keyword": "descargar videos de youtube",
      "title": "Descargar Videos de YouTube"
    },
    "pt": {
      "slug": "baixar-video-do-youtube",
      "keyword": "baixar vídeo do youtube",
      "title": "Baixar Vídeo do YouTube"
    },
    "de": {
      "slug": "youtube-video-herunterladen",
      "keyword": "youtube video herunterladen",
      "title": "YouTube Video Herunterladen"
    },
    "fr": {
      "slug": "telecharger-video-youtube",
      "keyword": "télécharger vidéo youtube",
      "title": "Télécharger une Vidéo YouTube"
    },
    "ru": {
      "slug": "skachat-video-s-youtube",
      "keyword": "скачать видео с youtube",
      "title": "Скачать Видео С YouTube"
    },
    "ar": {
      "slug": "tahmil-fidyu-youtube",
      "keyword": "تحميل فيديو يوتيوب",
      "title": "تحميل فيديو يوتيوب"
    },
    "hi": {
      "slug": "youtube-video-download-karein",
      "keyword": "youtube video download करें",
      "title": "YouTube वीडियो डाउनलोडर"
    },
    "id": {
      "slug": "download-video-youtube",
      "keyword": "download video youtube",
      "title": "Download Video YouTube"
    }
  },
  "yt-to-mp3": {
    "es": {
      "slug": "youtube-a-mp3",
      "keyword": "youtube a mp3",
      "title": "YouTube a MP3"
    },
    "pt": {
      "slug": "youtube-para-mp3",
      "keyword": "youtube para mp3",
      "title": "YouTube para MP3"
    },
    "de": {
      "slug": "youtube-zu-mp3",
      "keyword": "youtube zu mp3",
      "title": "YouTube Zu MP3"
    },
    "fr": {
      "slug": "youtube-en-mp3",
      "keyword": "youtube en mp3",
      "title": "YouTube en MP3"
    },
    "ru": {
      "slug": "youtube-v-mp3",
      "keyword": "youtube в mp3",
      "title": "YouTube В MP3"
    },
    "ar": {
      "slug": "youtube-ila-mp3",
      "keyword": "يوتيوب الى mp3",
      "title": "تحويل يوتيوب إلى MP3"
    },
    "hi": {
      "slug": "youtube-se-mp3",
      "keyword": "youtube से mp3",
      "title": "YouTube से MP3"
    },
    "id": {
      "slug": "youtube-ke-mp3",
      "keyword": "youtube ke mp3",
      "title": "YouTube ke MP3"
    }
  },
  "yt-mp3-converter": {
    "es": {
      "slug": "convertidor-de-youtube-a-mp3",
      "keyword": "convertidor de youtube a mp3",
      "title": "Convertidor de YouTube a MP3"
    },
    "pt": {
      "slug": "conversor-youtube-mp3",
      "keyword": "conversor youtube mp3",
      "title": "Conversor de YouTube para MP3"
    },
    "de": {
      "slug": "youtube-mp3-converter",
      "keyword": "youtube mp3 converter",
      "title": "YouTube MP3 Converter"
    },
    "fr": {
      "slug": "convertisseur-youtube-mp3",
      "keyword": "convertisseur youtube mp3",
      "title": "Convertisseur YouTube MP3"
    },
    "ru": {
      "slug": "konverter-youtube-v-mp3",
      "keyword": "конвертер youtube в mp3",
      "title": "Конвертер YouTube В MP3"
    },
    "ar": {
      "slug": "muhawwil-youtube-mp3",
      "keyword": "محول يوتيوب mp3",
      "title": "محول يوتيوب MP3"
    },
    "hi": {
      "slug": "youtube-mp3-converter",
      "keyword": "youtube mp3 कन्वर्टर",
      "title": "YouTube MP3 कन्वर्टर"
    },
    "id": {
      "slug": "konverter-youtube-mp3",
      "keyword": "konverter youtube mp3",
      "title": "Konverter YouTube MP3"
    }
  },
  "yt-mp4-download": {
    "es": {
      "slug": "descargar-youtube-en-mp4",
      "keyword": "descargar youtube en mp4",
      "title": "Descargar YouTube en MP4"
    },
    "pt": {
      "slug": "baixar-youtube-mp4",
      "keyword": "baixar youtube mp4",
      "title": "Baixar YouTube em MP4"
    },
    "de": {
      "slug": "youtube-mp4-herunterladen",
      "keyword": "youtube mp4 herunterladen",
      "title": "YouTube MP4 Herunterladen"
    },
    "fr": {
      "slug": "telecharger-youtube-mp4",
      "keyword": "télécharger youtube mp4",
      "title": "Télécharger YouTube en MP4"
    },
    "ru": {
      "slug": "skachat-youtube-mp4",
      "keyword": "скачать youtube mp4",
      "title": "Скачать YouTube В MP4"
    },
    "ar": {
      "slug": "tahmil-youtube-mp4",
      "keyword": "تحميل يوتيوب mp4",
      "title": "تحميل يوتيوب MP4"
    },
    "hi": {
      "slug": "youtube-mp4-download-karein",
      "keyword": "youtube mp4 download करें",
      "title": "YouTube MP4 डाउनलोड करें"
    },
    "id": {
      "slug": "download-youtube-mp4",
      "keyword": "download youtube mp4",
      "title": "Download YouTube MP4"
    }
  },
  "yt-music-download": {
    "es": {
      "slug": "descargar-musica-de-youtube",
      "keyword": "descargar musica de youtube",
      "title": "Descargar Música de YouTube"
    },
    "pt": {
      "slug": "baixar-musica-do-youtube",
      "keyword": "baixar música do youtube",
      "title": "Baixar Música do YouTube"
    },
    "de": {
      "slug": "youtube-musik-herunterladen",
      "keyword": "youtube musik herunterladen",
      "title": "YouTube Musik Herunterladen"
    },
    "fr": {
      "slug": "telecharger-musique-youtube",
      "keyword": "télécharger musique youtube",
      "title": "Télécharger de la Musique YouTube"
    },
    "ru": {
      "slug": "skachat-muzyku-s-youtube",
      "keyword": "скачать музыку с youtube",
      "title": "Скачать Музыку С YouTube"
    },
    "ar": {
      "slug": "tahmil-musiqa-youtube",
      "keyword": "تحميل موسيقى يوتيوب",
      "title": "تحميل موسيقى يوتيوب"
    },
    "hi": {
      "slug": "youtube-music-download-karein",
      "keyword": "youtube music download करें",
      "title": "YouTube Music डाउनलोड"
    },
    "id": {
      "slug": "download-musik-youtube",
      "keyword": "download musik youtube",
      "title": "Download Musik YouTube"
    }
  },
  "yt-1080p": {
    "es": {
      "slug": "descargar-youtube-en-1080p",
      "keyword": "descargar youtube en 1080p",
      "title": "Descargar YouTube en 1080p"
    },
    "pt": {
      "slug": "baixar-youtube-1080p",
      "keyword": "baixar youtube 1080p",
      "title": "Baixar Vídeo do YouTube em 1080p"
    },
    "de": {
      "slug": "youtube-1080p-herunterladen",
      "keyword": "youtube 1080p herunterladen",
      "title": "YouTube In 1080p Herunterladen"
    },
    "fr": {
      "slug": "telecharger-youtube-1080p",
      "keyword": "télécharger youtube 1080p",
      "title": "Télécharger YouTube en 1080p"
    },
    "ru": {
      "slug": "skachat-youtube-1080p",
      "keyword": "скачать youtube в 1080p",
      "title": "Скачать Видео С YouTube В 1080p"
    },
    "ar": {
      "slug": "tahmil-youtube-1080p",
      "keyword": "تحميل يوتيوب 1080p",
      "title": "تحميل يوتيوب بدقة 1080p"
    },
    "hi": {
      "slug": "youtube-1080p-download-karein",
      "keyword": "youtube 1080p download करें",
      "title": "YouTube 1080p डाउनलोड करें"
    },
    "id": {
      "slug": "download-youtube-1080p",
      "keyword": "download youtube 1080p",
      "title": "Download YouTube 1080p"
    }
  },
  "yt-shorts": {
    "es": {
      "slug": "descargar-shorts-de-youtube",
      "keyword": "descargar shorts de youtube",
      "title": "Descargar Shorts de YouTube"
    },
    "pt": {
      "slug": "baixar-youtube-shorts",
      "keyword": "baixar youtube shorts",
      "title": "Baixar YouTube Shorts"
    },
    "de": {
      "slug": "youtube-shorts-downloader",
      "keyword": "youtube shorts downloader",
      "title": "YouTube Shorts Downloader"
    },
    "fr": {
      "slug": "telecharger-youtube-shorts",
      "keyword": "télécharger youtube shorts",
      "title": "Télécharger des YouTube Shorts"
    },
    "ru": {
      "slug": "skachat-youtube-shorts",
      "keyword": "скачать youtube shorts",
      "title": "Скачать YouTube Shorts"
    },
    "ar": {
      "slug": "tahmil-youtube-shorts",
      "keyword": "تحميل يوتيوب شورتس",
      "title": "أداة تحميل يوتيوب شورتس"
    },
    "hi": {
      "slug": "youtube-shorts-download-karein",
      "keyword": "youtube shorts download करें",
      "title": "YouTube Shorts डाउनलोडर"
    },
    "id": {
      "slug": "download-youtube-shorts",
      "keyword": "download youtube shorts",
      "title": "Download YouTube Shorts"
    }
  },
  "yt-audio": {
    "es": {
      "slug": "descargar-audio-de-youtube",
      "keyword": "descargar audio de youtube",
      "title": "Descargar Audio de YouTube"
    },
    "pt": {
      "slug": "baixar-audio-do-youtube",
      "keyword": "baixar áudio do youtube",
      "title": "Baixar Áudio do YouTube"
    },
    "de": {
      "slug": "youtube-audio-herunterladen",
      "keyword": "youtube audio herunterladen",
      "title": "YouTube Audio Herunterladen"
    },
    "fr": {
      "slug": "telecharger-audio-youtube",
      "keyword": "télécharger audio youtube",
      "title": "Télécharger l'Audio d'une Vidéo YouTube"
    },
    "ru": {
      "slug": "skachat-audio-s-youtube",
      "keyword": "скачать аудио с youtube",
      "title": "Скачать Аудио С YouTube"
    },
    "ar": {
      "slug": "tahmil-sawt-youtube",
      "keyword": "تحميل صوت يوتيوب",
      "title": "تحميل صوت يوتيوب"
    },
    "hi": {
      "slug": "youtube-audio-download-karein",
      "keyword": "youtube audio download करें",
      "title": "YouTube ऑडियो डाउनलोड"
    },
    "id": {
      "slug": "download-audio-youtube",
      "keyword": "download audio youtube",
      "title": "Download Audio YouTube"
    }
  },
  "yt-free-downloader": {
    "es": {
      "slug": "descargador-de-youtube-gratis",
      "keyword": "descargador de youtube gratis",
      "title": "Descargador de YouTube Gratis"
    },
    "pt": {
      "slug": "baixar-youtube-gratis",
      "keyword": "baixar youtube grátis",
      "title": "Baixar do YouTube Grátis"
    },
    "de": {
      "slug": "youtube-downloader-kostenlos",
      "keyword": "youtube downloader kostenlos",
      "title": "YouTube Downloader Kostenlos"
    },
    "fr": {
      "slug": "telechargeur-youtube-gratuit",
      "keyword": "téléchargeur youtube gratuit",
      "title": "Téléchargeur YouTube Gratuit"
    },
    "ru": {
      "slug": "besplatnyy-zagruzchik-youtube",
      "keyword": "бесплатный загрузчик youtube",
      "title": "Бесплатный Загрузчик YouTube"
    },
    "ar": {
      "slug": "tahmil-youtube-majani",
      "keyword": "تحميل يوتيوب مجاني",
      "title": "أداة تحميل يوتيوب مجانية"
    },
    "hi": {
      "slug": "muft-youtube-downloader",
      "keyword": "मुफ़्त youtube downloader",
      "title": "मुफ़्त YouTube डाउनलोडर"
    },
    "id": {
      "slug": "pengunduh-youtube-gratis",
      "keyword": "pengunduh youtube gratis",
      "title": "Pengunduh YouTube Gratis"
    }
  },
  "yt-to-mp4-converter": {
    "es": {
      "slug": "convertidor-de-youtube-a-mp4",
      "keyword": "convertidor de youtube a mp4",
      "title": "Convertidor de YouTube a MP4"
    },
    "pt": {
      "slug": "conversor-youtube-mp4",
      "keyword": "conversor youtube mp4",
      "title": "Conversor de YouTube para MP4"
    },
    "de": {
      "slug": "youtube-zu-mp4-converter",
      "keyword": "youtube zu mp4 converter",
      "title": "YouTube Zu MP4 Converter"
    },
    "fr": {
      "slug": "convertisseur-youtube-mp4",
      "keyword": "convertisseur youtube mp4",
      "title": "Convertisseur YouTube MP4"
    },
    "ru": {
      "slug": "konverter-youtube-v-mp4",
      "keyword": "конвертер youtube в mp4",
      "title": "Конвертер YouTube В MP4"
    },
    "ar": {
      "slug": "muhawwil-youtube-mp4",
      "keyword": "محول يوتيوب mp4",
      "title": "محول يوتيوب إلى MP4"
    },
    "hi": {
      "slug": "youtube-se-mp4-converter",
      "keyword": "youtube से mp4 कन्वर्टर",
      "title": "YouTube से MP4 कन्वर्टर"
    },
    "id": {
      "slug": "konverter-youtube-ke-mp4",
      "keyword": "konverter youtube ke mp4",
      "title": "Konverter YouTube ke MP4"
    }
  },
  "ig-reels-download": {
    "es": {
      "slug": "descargar-reels-de-instagram",
      "keyword": "descargar reels de instagram",
      "title": "Descargar Reels de Instagram"
    },
    "pt": {
      "slug": "baixar-reels-do-instagram",
      "keyword": "baixar reels do instagram",
      "title": "Baixar Reels do Instagram"
    },
    "de": {
      "slug": "instagram-reels-downloader",
      "keyword": "instagram reels downloader",
      "title": "Instagram Reels Downloader"
    },
    "fr": {
      "slug": "telecharger-reels-instagram",
      "keyword": "télécharger reels instagram",
      "title": "Télécharger des Reels Instagram"
    },
    "ru": {
      "slug": "skachat-reels-iz-instagram",
      "keyword": "скачать reels из instagram",
      "title": "Скачать Reels Из Instagram"
    },
    "ar": {
      "slug": "tahmil-rils-instagram",
      "keyword": "تحميل ريلز انستغرام",
      "title": "أداة تحميل ريلز إنستغرام"
    },
    "hi": {
      "slug": "instagram-reels-download-karein",
      "keyword": "instagram reels download करें",
      "title": "Instagram Reels डाउनलोडर"
    },
    "id": {
      "slug": "download-reels-instagram",
      "keyword": "download reels instagram",
      "title": "Download Reels Instagram"
    }
  },
  "ig-video-download": {
    "es": {
      "slug": "descargar-videos-de-instagram",
      "keyword": "descargar videos de instagram",
      "title": "Descargar Videos de Instagram"
    },
    "pt": {
      "slug": "baixar-video-do-instagram",
      "keyword": "baixar vídeo do instagram",
      "title": "Baixar Vídeo do Instagram"
    },
    "de": {
      "slug": "instagram-video-herunterladen",
      "keyword": "instagram video herunterladen",
      "title": "Instagram Video Herunterladen"
    },
    "fr": {
      "slug": "telecharger-video-instagram",
      "keyword": "télécharger vidéo instagram",
      "title": "Télécharger une Vidéo Instagram"
    },
    "ru": {
      "slug": "skachat-video-iz-instagram",
      "keyword": "скачать видео из instagram",
      "title": "Скачать Видео Из Instagram"
    },
    "ar": {
      "slug": "tahmil-fidyu-instagram",
      "keyword": "تحميل فيديو انستغرام",
      "title": "تحميل فيديو إنستغرام"
    },
    "hi": {
      "slug": "instagram-video-download-karein",
      "keyword": "instagram video download करें",
      "title": "Instagram वीडियो डाउनलोडर"
    },
    "id": {
      "slug": "download-video-instagram",
      "keyword": "download video instagram",
      "title": "Download Video Instagram"
    }
  },
  "ig-photo-download": {
    "es": {
      "slug": "descargar-fotos-de-instagram",
      "keyword": "descargar fotos de instagram",
      "title": "Descargar Fotos de Instagram"
    },
    "pt": {
      "slug": "baixar-foto-do-instagram",
      "keyword": "baixar foto do instagram",
      "title": "Baixar Foto do Instagram"
    },
    "de": {
      "slug": "instagram-foto-herunterladen",
      "keyword": "instagram foto herunterladen",
      "title": "Instagram Foto Herunterladen"
    },
    "fr": {
      "slug": "telecharger-photo-instagram",
      "keyword": "télécharger photo instagram",
      "title": "Télécharger une Photo Instagram"
    },
    "ru": {
      "slug": "skachat-foto-iz-instagram",
      "keyword": "скачать фото из instagram",
      "title": "Скачать Фото Из Instagram"
    },
    "ar": {
      "slug": "tahmil-suwar-instagram",
      "keyword": "تحميل صور انستغرام",
      "title": "تحميل صور إنستغرام"
    },
    "hi": {
      "slug": "instagram-photo-download-karein",
      "keyword": "instagram photo download करें",
      "title": "Instagram फ़ोटो डाउनलोड"
    },
    "id": {
      "slug": "download-foto-instagram",
      "keyword": "download foto instagram",
      "title": "Download Foto Instagram"
    }
  },
  "sc-to-mp3": {
    "es": {
      "slug": "soundcloud-a-mp3",
      "keyword": "soundcloud a mp3",
      "title": "SoundCloud a MP3"
    },
    "pt": {
      "slug": "soundcloud-para-mp3",
      "keyword": "soundcloud para mp3",
      "title": "SoundCloud para MP3"
    },
    "de": {
      "slug": "soundcloud-zu-mp3",
      "keyword": "soundcloud zu mp3",
      "title": "SoundCloud Zu MP3"
    },
    "fr": {
      "slug": "soundcloud-en-mp3",
      "keyword": "soundcloud en mp3",
      "title": "SoundCloud en MP3"
    },
    "ru": {
      "slug": "soundcloud-v-mp3",
      "keyword": "soundcloud в mp3",
      "title": "SoundCloud В MP3"
    },
    "ar": {
      "slug": "soundcloud-ila-mp3",
      "keyword": "ساوندكلاود الى mp3",
      "title": "تحويل ساوندكلاود إلى MP3"
    },
    "hi": {
      "slug": "soundcloud-se-mp3",
      "keyword": "soundcloud से mp3",
      "title": "SoundCloud से MP3"
    },
    "id": {
      "slug": "soundcloud-ke-mp3",
      "keyword": "soundcloud ke mp3",
      "title": "SoundCloud ke MP3"
    }
  },
  "sc-track-download": {
    "es": {
      "slug": "descargar-canciones-de-soundcloud",
      "keyword": "descargar canciones de soundcloud",
      "title": "Descargar Canciones de SoundCloud"
    },
    "pt": {
      "slug": "baixar-musica-do-soundcloud",
      "keyword": "baixar música do soundcloud",
      "title": "Baixar Música do SoundCloud"
    },
    "de": {
      "slug": "soundcloud-track-herunterladen",
      "keyword": "soundcloud track herunterladen",
      "title": "SoundCloud Track Herunterladen"
    },
    "fr": {
      "slug": "telecharger-musique-soundcloud",
      "keyword": "télécharger musique soundcloud",
      "title": "Télécharger une Musique SoundCloud"
    },
    "ru": {
      "slug": "skachat-trek-s-soundcloud",
      "keyword": "скачать трек с soundcloud",
      "title": "Скачать Трек С SoundCloud"
    },
    "ar": {
      "slug": "tahmil-maqta-soundcloud",
      "keyword": "تحميل مقطع ساوندكلاود",
      "title": "أداة تحميل مقاطع ساوندكلاود"
    },
    "hi": {
      "slug": "soundcloud-track-download-karein",
      "keyword": "soundcloud track download करें",
      "title": "SoundCloud ट्रैक डाउनलोडर"
    },
    "id": {
      "slug": "download-lagu-soundcloud",
      "keyword": "download lagu soundcloud",
      "title": "Download Lagu SoundCloud"
    }
  },
  "ig-story-download": {
    "es": {
      "slug": "descargar-historias-instagram",
      "keyword": "descargar historias de instagram",
      "title": "Descargar Historias de Instagram"
    },
    "pt": {
      "slug": "baixar-stories-instagram",
      "keyword": "baixar stories do instagram",
      "title": "Baixar Stories do Instagram"
    },
    "de": {
      "slug": "instagram-story-download",
      "keyword": "instagram story download",
      "title": "Instagram Story Herunterladen"
    },
    "fr": {
      "slug": "telecharger-story-instagram",
      "keyword": "télécharger story instagram",
      "title": "Télécharger une Story Instagram"
    },
    "ru": {
      "slug": "skachat-istorii-instagram",
      "keyword": "скачать историю инстаграм",
      "title": "Скачать Истории Instagram"
    },
    "ar": {
      "slug": "tahmil-story-instagram",
      "keyword": "تحميل ستوري instagram",
      "title": "تحميل ستوري Instagram"
    },
    "hi": {
      "slug": "instagram-story-download-hindi",
      "keyword": "instagram story download kaise kare",
      "title": "Instagram Story Download Karein"
    },
    "id": {
      "slug": "download-instagram-story",
      "keyword": "download instagram story",
      "title": "Download Instagram Story"
    }
  },
  "ig-profile-pic": {
    "es": {
      "slug": "descargar-foto-de-perfil-instagram",
      "keyword": "descargar foto de perfil de instagram",
      "title": "Descargar Foto de Perfil de Instagram"
    },
    "pt": {
      "slug": "baixar-foto-de-perfil-instagram",
      "keyword": "baixar foto de perfil do instagram",
      "title": "Baixar Foto de Perfil do Instagram"
    },
    "de": {
      "slug": "instagram-profilbild-herunterladen",
      "keyword": "instagram profilbild herunterladen",
      "title": "Instagram Profilbild Herunterladen"
    },
    "fr": {
      "slug": "telecharger-photo-de-profil-instagram",
      "keyword": "télécharger photo de profil instagram",
      "title": "Télécharger une Photo de Profil Instagram"
    },
    "ru": {
      "slug": "skachat-foto-profilya-instagram",
      "keyword": "скачать фото профиля инстаграм",
      "title": "Скачать Фото Профиля Instagram"
    },
    "ar": {
      "slug": "tahmil-sourat-profile-instagram",
      "keyword": "تحميل صورة البروفايل instagram",
      "title": "تحميل صورة البروفايل في Instagram"
    },
    "hi": {
      "slug": "instagram-profile-photo-download-hindi",
      "keyword": "instagram profile photo download",
      "title": "Instagram Profile Photo Download Karein"
    },
    "id": {
      "slug": "download-foto-profil-instagram",
      "keyword": "download foto profil instagram",
      "title": "Download Foto Profil Instagram"
    }
  },
  "ig-dp-download": {
    "es": {
      "slug": "descargar-foto-perfil-instagram-hd",
      "keyword": "descargar imagen de perfil de instagram",
      "title": "Descargar Imagen de Perfil de Instagram en HD"
    },
    "pt": {
      "slug": "baixar-foto-de-perfil-dp-instagram",
      "keyword": "baixar dp do instagram",
      "title": "Baixar DP do Instagram (Foto de Perfil)"
    },
    "de": {
      "slug": "instagram-profilbild-anzeigen",
      "keyword": "instagram profilbild vergroessern",
      "title": "Instagram Profilbild In Voller Groesse Ansehen"
    },
    "fr": {
      "slug": "telecharger-photo-profil-instagram-dp",
      "keyword": "télécharger dp instagram",
      "title": "Télécharger la Photo de Profil (DP) Instagram"
    },
    "ru": {
      "slug": "skachat-avatarku-instagram",
      "keyword": "скачать аватарку инстаграм",
      "title": "Скачать Аватарку Instagram"
    },
    "ar": {
      "slug": "tahmil-sourat-shakhsiyya-instagram",
      "keyword": "تحميل الصورة الشخصية instagram",
      "title": "تحميل الصورة الشخصية من Instagram"
    },
    "hi": {
      "slug": "instagram-dp-download-hindi",
      "keyword": "instagram dp download",
      "title": "Instagram DP Download Karein"
    },
    "id": {
      "slug": "download-dp-instagram",
      "keyword": "download dp instagram",
      "title": "Download DP Instagram"
    }
  },
  "ig-carousel-download": {
    "es": {
      "slug": "descargar-carrusel-instagram",
      "keyword": "descargar carrusel de instagram",
      "title": "Descargar Carrusel de Instagram"
    },
    "pt": {
      "slug": "baixar-carrossel-instagram",
      "keyword": "baixar carrossel do instagram",
      "title": "Baixar Carrossel do Instagram"
    },
    "de": {
      "slug": "instagram-karussell-download",
      "keyword": "instagram karussell herunterladen",
      "title": "Instagram Karussell Herunterladen"
    },
    "fr": {
      "slug": "telecharger-carrousel-instagram",
      "keyword": "télécharger carrousel instagram",
      "title": "Télécharger un Carrousel Instagram"
    },
    "ru": {
      "slug": "skachat-karusel-instagram",
      "keyword": "скачать карусель инстаграм",
      "title": "Скачать Карусель Instagram"
    },
    "ar": {
      "slug": "tahmil-album-suwar-instagram",
      "keyword": "تحميل ألبوم صور instagram",
      "title": "تحميل ألبوم الصور (الكاروسيل) من Instagram"
    },
    "hi": {
      "slug": "instagram-carousel-photos-download-hindi",
      "keyword": "instagram carousel photos download",
      "title": "Instagram Carousel Photos Download Karein"
    },
    "id": {
      "slug": "download-carousel-instagram",
      "keyword": "download carousel instagram",
      "title": "Download Carousel Instagram"
    }
  }
}
