---
id: "e33c968e-d259-4fcd-92de-9dc619ba5771"
type: "fitness-fn"
label: "No text left untranslated"
cadence: "triggered"
characteristic: "interaction-capability"
combine: "all"
invocation: "automated"
metrics: |
  i18n.texts.untranslated == 0
  i18n.translations.missing == 0
scope: "holistic"
trigger: "pull-request"
---

Every text the app shows goes through a translation and has one in every language (ADR "Languages without a library"). Measured by the integration test "No text left untranslated", which parses the code of app/, components/ and lib/ and counts the shown texts outside t(), tn() and msg(), and the keys without a translation, translations no code uses and texts with two translations.
