---
id: "0cc6539e-3293-4327-970f-e394a053c69a"
type: "requirement"
label: "Export to CSV"
action: "write them to a CSV file"
ears_type: "event-driven"
rationale: "F15. On 26 Nov 2026 a review of the whole app (the runner's \"przegladnij aplikacje raz jeszcze ... pod katem modeli ale nie tylko\"), found the cells of the exports written as they are, so a name from someone else's file (a device, a segment, a tag, gear) beginning with =, +, - or @ is run as a formula by a spreadsheet; the runner: \"tak zacznij od poczzatku ... i przejdz przez wszystkie\". Model's choices: such a text, when it is no number, gets an apostrophe before it; a cell holding a quote, a comma or a line end is quoted."
trigger: "the user exports instances or a result"
---
