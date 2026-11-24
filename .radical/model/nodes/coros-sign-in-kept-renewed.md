---
id: "b29cedb1-7934-4e5e-ab3e-7ac1b8cf6d61"
type: "scenario"
label: "COROS sign-in kept renewed"
given: "COROS's metadata at https://mcp.coros.com, and an account connected whose access token has ended"
then: "the sign-in is COROS's page of the runner's region with PKCE (S256), the state and the scope openid mcp.tools offline_access; the ended token is renewed once by itself and the new tokens kept; a renewal COROS refuses asks the runner to connect again"
when: "the app finds the sign-in, and calls a tool of COROS"
---
