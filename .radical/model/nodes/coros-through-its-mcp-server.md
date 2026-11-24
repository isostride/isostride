---
id: "49a7c174-419c-4933-9340-17ca2c617bb6"
type: "adr"
label: "COROS through its MCP server"
alternatives: "Partner API: webhooks and full history, but only for an established company with users, after COROS's approval. COROS's private web endpoints (unofficial libraries): no approval, but a password handed to IsoStride and no promise they keep working. Export by hand (as before): stays, for runners without COROS or who prefer it."
consequences: "No server, no secret, nothing of the runner's sent anywhere but to COROS. The tools answer in text meant for a language model: IsoStride reads the labelIds and links out of it, and a change of that text breaks the fetch (the parsing is tested against the text seen on 24 Nov 2026). No webhooks: the runner asks for a fetch. 50 files a day: a long history comes over several days. COROS documents the MCP server for AI platforms; whether its terms allow an app such as IsoStride is to be asked of COROS before the fetch is offered to others: a prototype until then."
context: "The runner wants the FIT files of their COROS account in the data folder without exporting them by hand. IsoStride has no server (ADR \"Folder via File System Access\"): whatever fetches must run in the browser. COROS offers a Partner API (multi-user OAuth, webhooks) only to registered companies with a user base, and an official MCP server (https://mcp.coros.com/mcp) to anyone: OAuth 2.0 with PKCE and dynamic client registration, CORS open to the browser, tools that list activities (querySportRecords) and give FIT download links (queryActivityFitFileDownloadUrls), 50 files a day for a user."
date: "2026-11-24"
decision: "We will fetch from COROS through its official MCP server, from the browser: register IsoStride as a public client (no secret) on the first connect, sign the runner in with PKCE in a window of COROS, list the runs with querySportRecords (free of the file limit), ask for the link of each run not fetched before with queryActivityFitFileDownloadUrls, download it and write it into the folder; the tokens stay in IndexedDB."
status: "proposed"
---
