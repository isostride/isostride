---
id: "f1caed16-5140-4c23-8191-35d22546562a"
type: "adr"
label: "Languages without a library"
alternatives: |
  1. next-intl or react-i18next: a dependency for what a hundred lines do; next-intl's routing by language needs a server or a path per language in the static export.
  2. Keys as ids (runs.title) with an English dictionary too: every English text moved out of the code, and the tests' names read from a dictionary.
  3. A path per language (/pl/...): every link and the folder's saved links change; the runner asked for a switch, not addresses.
consequences: |
  • No dependency; the English of the screens and the end-to-end tests stay as they were.
  • A new language: a dictionary and a line in LOCALES; the check of the texts lists what it lacks.
  • Texts made in the worker are made in English and translated where they are shown.
  • A text built from pieces is one key with placeholders, so each language orders its words.
  • The static pages are built in English: a page in Polish is hidden for the moment of hydration.
context: "The runner asked for the app in English and Polish, more languages later, the whole of it at once, the language from the browser with a switch in Settings and the wizard, numbers and dates following it. The app is a static export (Next.js output: export): no server picks a language and Next's own routing by language is not there; a framework of its own adds weight and is checked by the frameworks' fitness functions."
date: "2026-11-24"
decision: "A part lib/i18n (both threads, no dependency) holds the languages (LOCALES: en-US, pl-PL), the language in use and its listeners, t(text, vars) with the English text as the key and {name} placeholders, tn(n, one, other) taking the form by Intl.PluralRules (one, few, many, other for Polish), msg() marking a constant's text as a key, number() and dateText() through Intl. Each other language is a dictionary of English text → its own (lib/i18n/pl/, a file per part of the app). lib/client keeps the choice in localStorage (isostride.language), applies it in a layout effect of the shell after hydration and on a change; the shell, Settings and the wizard subscribe to it (useLocale) and render again at once, other screens take it when opened. A head script sets html lang and, in a language other than English, hides the page until the app has put it in that language (1.5 s at most) and preloads the font's latin-ext part. The integration test No text left untranslated parses the code (TypeScript's parser) and fails on a shown text outside t(), tn() or msg(), a key without its translation, a translation no code uses, or one text with two translations."
status: "accepted"
---
