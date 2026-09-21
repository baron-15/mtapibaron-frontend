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

Run checks with `node --test tests/*.test.cjs`.
