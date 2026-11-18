---
id: "dc45eb83-afe1-437f-abdb-68b169199144"
type: "scenario"
label: "No data sent out"
given: "the application is open on \"my-folder\" with 3 sample FIT files"
then: "the browser records no network request to any origin other than the one serving the application's static files"
when: "the user imports the folder, opens a Trend, runs an A/B Comparison and exports to CSV"
---
