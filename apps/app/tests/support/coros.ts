/** The answers of COROS's MCP tools as COROS wrote them on 24 Nov 2026 (ids, places and coordinates made up). */

/** querySportRecords' answer, in COROS's layout. */
export const RECORDS = `Sport Records — 2026-11-01 to 2026-11-24 (3 records)
========================

1. Outdoor Run — 2026-11-23
   Location: Somewhere Park
   Start Coordinates: 10.000000, 20.000000
   Time Window: startTimestamp=1795463786 | endTimestamp=1795464219
   Duration: 5:59 | Distance: 994 m
   Average Pace: 6:01 /km | Avg HR: 133 bpm | Calories: 61 kcal
   LabelId: 100000000000000003 | SportType: 100

2. Trail Run — 2026-11-21
   Location: Some Hill
   Duration: 50:10 | Distance: 8120 m
   LabelId: 100000000000000002 | SportType: 102

3. Walk — 2026-11-20
   Duration: 0:03
 | Avg HR: 99 bpm | Calories: 0 kcal
   LabelId: 100000000000000001 | SportType: 900`;

/** queryActivityFitFileDownloadUrls' answer for one activity. */
export const linkText = (name: string) => `Activity FIT file download URL(s):
1. ${name}
   https://s3eu.coros.com/fit/v2/123/${name}`;

/** The list as COROS sends it through MCP: a quoted text, its line breaks written out as \\n (24 Nov 2026). */
export const RECORDS_QUOTED = JSON.stringify(RECORDS);
