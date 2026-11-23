# Garmin FIT files for the tests

Real Garmin activity files used as test data, not the runner's own:

| File | Watch | What it holds | Source |
| --- | --- | --- | --- |
| `fenix2-run.fit` | Garmin fenix 2 | a 9 km run, nearly every second, with running dynamics and temperature | `tests/files/activity-small-fenix2-run.fit` of [python-fitparse](https://github.com/dtcooper/python-fitparse) and [fitdecode](https://github.com/polyvertex/fitdecode) |
| `fenix5-smart-recording-run.fit` | Garmin fenix 5 | a 57 s run in Smart recording (a record every 1 to 9 s), with vertical ratio, stance time balance and percent, step length | `tests/files/garmin-fenix-5-run.fit` of the same |
| `fr935-swim.fit` | Garmin Forerunner 935 | a swim with developer fields (depth and the like): not a run | `tests/files/garmin-fr935-cr.fit` of [fitdecode](https://github.com/polyvertex/fitdecode) |

Both projects are under the MIT License:

- python-fitparse: Copyright (c) 2011-2025, David Cooper; Copyright (c) 2017-2025, Carey Metcalfe (https://github.com/dtcooper/python-fitparse/blob/master/LICENSE)
- fitdecode: Copyright (c) 2018-present Jean-Charles Lefebvre (https://github.com/polyvertex/fitdecode/blob/master/LICENSE.txt)

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
