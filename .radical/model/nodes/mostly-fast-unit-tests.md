---
id: "21175535-2832-4a69-9b60-984a3f99b920"
type: "requirement"
label: "Mostly fast unit tests"
action: "keep at least 40% of the automated tests as unit tests that touch no network and run in under 100 ms each on the reference machine (the author's Mac), the limit scaled by the speed of the machine running them, at most 15% as end-to-end tests, and the tests on the author's FIT files as integration tests"
ears_type: "ubiquitous"
rationale: "The pack's threshold was 70% unit and 10% end-to-end; the author decided on 19 Nov 2026 to keep the tests on real FIT data as the core of the verification and to count them as integration tests, with 40% unit and 15% end-to-end. On GitHub's runner a unit test takes 3 to 5 times as long as on the author's Mac, and the runner asked to \"skaluj limit do szybksoci maszyny\". Model's choice: the speed from a fixed piece of work timed before the unit tests (17 ms on the reference machine), the limit never below 100 ms."
---
