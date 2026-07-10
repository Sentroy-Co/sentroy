import type { Bank } from "./index"

/**
 * English sentence bank. Doubles as the fallback for languages whose bank has
 * not been generated yet (engine falls back to BANKS.en).
 */
export const en: Bank = {
  leads: [
    "Instead of searching endlessly for {keyword}, get it done in one step: paste the link and {brand} prepares your file in seconds. No install, no signup, no hidden fees.",
    "Just paste a {platform} link into the box — {keyword} could not be simpler. Fast, free, and entirely in your browser.",
    "There are dozens of sites for {keyword}, but most are ad traps. {brand} is different: a clean interface, real speed, and no forced registration.",
    "We built a single-page solution for anyone who wants {keyword} the fastest, easiest way. Paste the link, pick the quality, download.",
    "Need the video, or just the audio? Whatever your {keyword} need is, {brand} handles both — smoothly on phone and desktop alike.",
    "{Keyword} should mean speed, safety, and simplicity. This guide shows the most practical way to save {platform} content to your device in seconds.",
    "No app to install, no extension, no account: with {brand}, your file starts preparing the moment you paste the link.",
  ],

  whatHeadings: [
    "What is {keyword} and how does it work?",
    "How {keyword} works with {brand}",
    "In short: {keyword}",
    "What you should know about {keyword}",
  ],
  whatBodies: [
    "{brand} takes a {platform} link, prepares the file on its own servers, and hands you a direct download link. Everything happens in the browser; you never install anything.",
    "{Keyword} comes down to three parts: resolving the link, preparing the format you want, and delivering the file. {brand} completes all three on one screen, in seconds.",
    "A powerful conversion engine runs in the background; you only paste the link and pick a quality. {brand} takes care of the rest.",
    "Unlike classic download sites, {brand} doesn't bury you under fake 'Download' buttons. There's a single field: the link box. Paste it and you're done.",
    "When you want a copy of a {platform} video or sound on your device, {brand} steps in. It recognizes the link, resolves the content, and turns it into a downloadable file.",
    "{Keyword} may look like it needs technical skill, but it doesn't. {brand} hides all the complexity; all that's left for you is to paste and download.",
  ],

  howHeadings: [
    "{Keyword}: step by step",
    "{Keyword} in 3 steps",
    "How to download",
    "The steps for {keyword}",
  ],
  howIntros: [
    "The whole process is three simple steps — about half a minute on average:",
    "Follow the steps below; no account and no install required:",
    "Even if it's your first time, you'll finish in under a minute:",
    "Here are the three easy steps for {keyword}:",
  ],
  steps: [
    {
      title: ["Copy the link", "Grab the URL", "Copy the {platform} address"],
      body: [
        "Copy the link of the {platform} content you want. You can get it from the browser's address bar or the share menu.",
        "In the {platform} app or site, tap 'Share → Copy link'; or select and copy the URL from the address bar.",
        "Put the full link of the video or sound on your clipboard — shortened share links work too.",
      ],
    },
    {
      title: ["Paste it in the box", "Paste the link", "Drop the URL in the field"],
      body: [
        "Paste the copied link into the box on {domain}. {brand} recognizes the content instantly and shows the available quality options.",
        "Paste the link into the download area; the title, thumbnail, and download options appear within seconds.",
        "The moment you paste the URL, {brand} resolves the video and lists the formats you can download.",
      ],
    },
    {
      title: ["Pick a format and download", "Choose the quality", "Hit Download"],
      body: [
        "Choose a video quality (up to 1080p) or an audio format (MP3, WAV, M4A) and hit 'Download'. Your file is prepared and saved to your device.",
        "Pick a high-resolution MP4 or just the MP3 audio; {brand} prepares the file and gives you the download link.",
        "Select the format that fits your need and click download. Files are auto-deleted from our servers within an hour, keeping you private.",
      ],
    },
  ],

  qualityHeadings: [
    "Which qualities and formats are supported?",
    "Quality and format options",
    "MP4, MP3 and more",
    "What you can download",
  ],
  qualityBodies: [
    "On the video side you can download MP4 from 360p up to 1080p. For audio, choose MP3, WAV, or M4A and save music and podcasts as pure sound.",
    "{brand} aims to serve the video at the best quality available at the source. Mindful of your bandwidth, you can also pick a smaller resolution — it's entirely your call.",
    "Want audio only? MP3 conversion is one tap and the result is a clean, player-friendly file. Ideal for archiving lectures, music, or interviews.",
    "Format selection happens before downloading, so you never get the wrong file. MP4 for video, MP3/WAV/M4A for audio — set on one screen, your way.",
    "High-resolution video or space-saving audio? {brand} supports both scenarios and preserves quality as much as possible during conversion.",
    "Downloaded MP3 files come at a standard bitrate, compatible with every device and player. MP4 videos arrive with sound, in a single file.",
  ],

  benefitsHeading: [
    "Why {brand}?",
    "Advantages of {keyword} with {brand}",
    "What makes this tool different?",
    "Highlights",
  ],
  benefits: [
    "Completely free — no hidden plan, credit card, or subscription.",
    "No signup required; we don't even ask for an email.",
    "No app or browser extension to install.",
    "Works at the same speed on phone, tablet, and computer.",
    "MP4 video support up to 1080p.",
    "Conversion to MP3, WAV, and M4A audio formats.",
    "Prepared files are auto-deleted from servers within 1 hour.",
    "No ad traps, fake download buttons, or redirects.",
    "Results in seconds — no waiting, queues, or throttling.",
    "Paste the link, let {brand} do the rest — zero technical know-how.",
    "Your download history stays in your browser; re-download in any format.",
    "A clear, minimal interface; no guessing what to do next.",
  ],

  safetyHeadings: [
    "Is it safe and legal?",
    "Privacy and security",
    "Things to keep in mind",
    "Responsible use",
  ],
  safetyBodies: [
    "{brand} doesn't store your files. Every file prepared for download is auto-deleted from the servers within an hour at most; no trace is left behind.",
    "Only download content you own or have permission to download. Complying with each platform's terms of service is the user's responsibility.",
    "Take care not to use downloaded content in ways that infringe copyright, beyond personal use, archiving, or offline viewing.",
    "The entire process runs over an encrypted connection (HTTPS). {brand} never asks for a password, payment info, or personal data.",
    "Since you don't create an account, you leave no personal data behind. Your download history is kept only in your own browser, for one hour.",
    "If you see fake 'virus cleaner' or 'driver updater' pop-ups, know they don't belong to {brand}; we give you a single download link, nothing more.",
  ],

  faqs: [
    {
      q: "Is {keyword} really free?",
      a: "Yes. {keyword} with {brand} is completely free; there's no subscription, credit card, or hidden fee.",
    },
    {
      q: "Do I need to create an account?",
      a: "No. No signup, login, or email required. Paste the link and download directly.",
    },
    {
      q: "Which formats can I download?",
      a: "MP4 video up to 1080p, or MP3, WAV, and M4A audio. You choose before downloading.",
    },
    {
      q: "Do you store my downloaded files?",
      a: "No. Prepared files are auto-deleted from our servers within 1 hour at most.",
    },
    {
      q: "Does it work on mobile?",
      a: "Yes. {brand} is browser-based and works the same on Android, iPhone, tablet, and computer.",
    },
    {
      q: "Do I need to install an app or extension?",
      a: "No. Nothing to install — it all happens inside your browser.",
    },
    {
      q: "Is there a faster way than pasting the link each time?",
      a: "Yes. Add 'sentroy' to the {platform} address; for example, type {domain} instead of youtube.com to land straight on the download page.",
    },
    {
      q: "Why does the download take a few seconds?",
      a: "The file is prepared at your chosen quality on our servers. This usually takes a few seconds; then the download starts instantly.",
    },
    {
      q: "Can I re-download the same video in a different format?",
      a: "Yes. Your download history is kept in your browser for an hour; from there you can re-download any item in a different format.",
    },
  ],

  ctaHeading: [
    "Try it now",
    "Ready for {keyword}?",
    "Paste the link, leave the rest to us",
    "Download in seconds",
  ],
  ctaBody: [
    "Copy a {platform} link and paste it into the box below — {keyword} doesn't get easier than this.",
    "No signup, no install. Paste the link, pick the format, download.",
    "Try {brand} free now; you'll see the result in seconds.",
    "Open the video you have in mind, grab its link, and start downloading on {domain}.",
  ],
  ctaButton: ["Download now", "Try it free", "Start downloading", "Paste a link"],

  metaTitleSuffix: [
    "{Keyword} — Free, Fast, No Signup | {brand}",
    "{Keyword} | {platform} Downloader — {brand}",
    "{Keyword}: The Easiest Way | {brand}",
    "{Keyword} (MP4 & MP3) — Free with {brand}",
  ],
  metaDescription: [
    "Looking for {keyword}? With {brand}, paste the link and download MP4 video or MP3 audio in seconds. Free, fast, no signup.",
    "The easiest way to download {platform} content: for {keyword}, paste the link, pick the quality, download. No install, no account.",
    "Do {keyword} for free and fast. {brand} supports MP4 up to 1080p and MP3/WAV/M4A audio — all in the browser.",
    "{Keyword} with {brand}: no ad traps, no signup, no hidden fees. Paste the link and get your file in seconds.",
  ],
}
