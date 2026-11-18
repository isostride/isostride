---
id: "368d77bf-f7ca-4698-8943-e0f8518b648a"
type: "requirement"
label: "Supported browsers work"
action: "work in the last 2 versions of Chrome, Edge and Opera (the browsers with the File System Access API), with the main journeys tested in Chromium on every pull request and 0 unsupported language or web features shipped without a polyfill"
ears_type: "ubiquitous"
rationale: "The user's choice: only Chrome, Edge and Opera are supported; other browsers get a not-supported message. \"Last 2 versions\" and \"0 features without a polyfill\" are the Frontend stack pack's thresholds (the model's decision). An explicit browser list lets the build ship only the transpilation and polyfills needed, and the lint catch a feature the list does not have (Browserslist)."
---
