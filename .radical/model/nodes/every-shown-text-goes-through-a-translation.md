---
id: "e232efa1-7487-41b7-9e39-9c67ce298813"
type: "scenario"
label: "Every shown text goes through a translation"
given: "the code of app/, components/ and lib/"
then: "none is outside t(), tn() or msg(), but those marked i18n-ignore"
when: "it is parsed for the texts it shows (JSX text, labels and titles, texts of objects, messages)"
---
