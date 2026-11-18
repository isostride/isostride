---
id: "62453160-130b-4517-ae25-023829dea55e"
type: "adr"
label: "Built with React"
alternatives: |
  1. Angular: everything included and one way of doing it, heavier.
  2. Vue with Nuxt: similar capabilities, gentler learning curve, smaller ecosystem.
  3. Svelte with SvelteKit: smaller bundles, smaller ecosystem.
concern: "frontend-stack"
consequences: |
  • The largest ecosystem of components and libraries, and the largest hiring pool.
  • React itself is only the view: routing, data, forms and state are choices to make and keep current.
  • Server components cut the JavaScript sent, but add a server and a new mental model.
  • Next.js majors arrive roughly yearly and change conventions; upgrades are planned work.
context: "This element is a web front end that people use in their own browsers, on their own devices and networks. The forces: every kilobyte of JavaScript is downloaded, parsed and run on the user's phone, and mid-range phones on mobile networks are where most budgets break; search engines and first visits reward content in the first HTML response, while app-like screens favour rendering in the browser; a framework brings its ecosystem, hiring pool and release cadence, and its majors reach end of support on published dates; a shared design system keeps screens consistent and accessible, but costs effort to build and keep; the browsers to support decide which features and polyfills ship; and accessibility is a legal duty in many markets (European Accessibility Act, ADA, Section 508), cheap when built in and expensive when retrofitted."
date: "2026-11-18"
decision: "The front end is built with React in TypeScript (strict). Rendering: at build time: Next.js static export (output: 'export'), no server components or server-side code, runs from any static host or the local disk. Design system: an established component library. Browsers: the last 2 versions of Chrome, Edge and Opera only (File System Access API); other browsers get a not-supported message. Budget: LCP 2500 ms, INP 200 ms, CLS 0.1 at the 75th percentile of page loads, 200 KB of JavaScript per route; WCAG 2.2 AA. Dependency updates: as decided in the Dependency hygiene pack. Versions tracked through endoflife.date (react, nextjs), each major replaced at least 180 days before its end of support."
status: "accepted"
---
