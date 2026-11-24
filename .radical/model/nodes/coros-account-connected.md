---
id: "c0171ff7-cd96-4397-bfa6-0dc87e93beb7"
type: "requirement"
label: "COROS account connected"
action: "let the runner sign in to COROS and allow IsoStride in a window of COROS, keep the authorization in this browser only (never in the data folder, never sent anywhere but to COROS), show the account as connected, and forget it when the runner chooses Disconnect"
ears_type: "event-driven"
rationale: "The runner asked to fetch the files \"od uzytkownika z coros\": each runner allows access to their own account. Model's choices: COROS's own sign-in (OAuth 2.0 with PKCE; IsoStride registers itself with COROS on the first connect, no secret, no server of its own); a window of its own, so the app keeps its folder open; the tokens in IndexedDB of this browser, not in the folder, as a folder may be copied or shared; renewed by themselves (COROS gives 30 days to an access token, 180 to the renewal)."
trigger: "the runner chooses Connect COROS in the Integrations section of the Data screen"
---
