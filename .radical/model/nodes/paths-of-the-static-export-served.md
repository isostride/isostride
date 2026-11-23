---
id: "79c59153-cd4d-4b15-81fe-de41f4378eed"
type: "scenario"
label: "Paths of the static export served"
given: "the CloudFront Functions of the app and the site"
then: "the app reads index.html, run.html twice, settings.html and the files as they are; the site reads about.html; www is sent with 301 to the bare domain, its path and query kept"
when: "a browser asks for /, /run, /run/, /settings, /run.txt, a hashed script and the icon of the app at app.isostride.com, /about of the site, and /pricing with a query of www.isostride.com"
---
