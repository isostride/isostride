---
id: "c14dbde0-de4f-48ba-a569-779a0fdfc5c8"
type: "component"
label: "COROS Sync"
technology: "lib/coros, MCP over HTTP, OAuth 2.0 PKCE"
---

Connects the runner's COROS account (dynamic client registration, PKCE sign-in in a window of COROS, tokens renewed), calls the COROS MCP server's tools, reads the labelIds and FIT links out of their text, downloads the runs not fetched before into the folder and keeps what it fetched in user/coros.json.
