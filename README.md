# mtapibaron-frontend

The stop picker uses `route-stop-order.js` to follow each route from its northern
terminal toward its southern terminal (the MTA schedule direction, including
east/west routes). The A and 5 branches and the three S shuttles have labeled
groups. Each existing station appears once; station names and route membership
still come from `MTA_Subway_Stations.csv`.

Stop order was checked against the [MTA regular GTFS feed](https://www.mta.info/developers)
on 2026-09-20, feed version `20260826-X-long-term-supplement-trip-ids`.
The orders use `stop_times.txt` sequences with platform suffixes removed, reverse
northbound trips to the same direction, and retain only the CSV's daytime stops.
Northbound trips include the A's northbound-only Aqueduct Racetrack stop.

When updating station membership, update the corresponding sequences in
`route-stop-order.js` using the regular schedule. Keep branch segments separate
and retain each station once. Stops missing from the order remain selectable at
the end of the list, alphabetically; the coverage test flags these for correction.

Each arrival refresh requests only the selected station from
`https://mtapibaron.onrender.com/by-id/<station>`. Render is the sole API host;
failed requests use the existing retry/error display.

V2 renders the backend's `terminalPrimary` and optional `terminalSecondary` as
plain text. Borough headings show one next borough; Uptown/Downtown can still
include a destination borough (including `Uptown & The Bronx`). The backend
adds `via Roosevelt Island` when that station appears ahead of the current stop
and before the terminal in the actual trip's supplied stop sequence, for any
line and either direction. The browser does not match trips or derive these
labels from its station CSV or stop-picker order.

Deploy the `mtapibaron` backend on Render before publishing this frontend.
Older responses without the new fields show just `terminalName`; a null or
empty secondary field produces no subtitle. V1 and audio keep using the
original `terminalName` and `directionLabel` fields.

Run checks with `node --test tests/*.test.cjs`.
