---
id: "961feea9-55c8-4ef8-8e18-3ef6ab1ed842"
type: "scenario"
label: "Site in Polish from the browser"
given: "a browser set to Polish (pl-PL) that has not been on the site"
then: "it lands on /pl, in Polish (html lang pl, the heading in Polish, a link to the English page for search engines); English shows the English page and stays after a reload; after Polish, / leads to /pl again"
when: "it opens the site at /, switches to English in the header, reloads, switches back to Polish and opens / again"
---
