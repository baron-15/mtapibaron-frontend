// Normal route order for the stop picker, using parent GTFS stop IDs.
// Source: https://www.mta.info/developers (Regular GTFS), retrieved 2026-09-20.
// Feed: 20260826-X-long-term-supplement-trip-ids. See README.md for maintenance.
// Branches and separate shuttles are grouped; station membership stays in the CSV.
var routeStopOrder = {
    '1': [
        {
            stops: '101 103 104 106 107 108 109 110 111 112 113 114 115 116 117 118 119 120 121 122 123 124 125 126 127 128 129 130 131 132 133 134 135 136 137 138 139 142'.split(' ')
        },
    ],
    '2': [
        {
            stops: '201 204 205 206 207 208 209 210 211 212 213 214 215 216 217 218 219 220 221 222 224 225 226 227 120 123 127 128 132 137 228 229 230 231 232 233 234 235 236 237 238 239 241 242 243 244 245 246 247'.split(' ')
        },
    ],
    '3': [
        {
            stops: '301 302 224 225 226 227 120 123 127 128 132 137 228 229 230 231 232 233 234 235 236 237 238 239 248 249 250 251 252 253 254 255 256 257'.split(' ')
        },
    ],
    '4': [
        {
            stops: '401 402 405 406 407 408 409 410 411 412 413 414 415 416 621 626 629 631 635 640 418 419 420 423 234 235 239 250'.split(' ')
        },
    ],
    '5': [
        {
            label: 'Eastchester-Dyre Av branch',
            stops: '501 502 503 504 505'.split(' ')
        },
        {
            label: 'Nereid Av branch',
            stops: '204 205 206 207 208 209 210 211 212'.split(' ')
        },
        {
            label: 'E 180 St to Flatbush Av-Brooklyn College',
            stops: '213 214 215 216 217 218 219 220 221 222 416 621 626 629 631 635 640 418 419 420 423 234 235 239 241 242 243 244 245 246 247'.split(' ')
        },
    ],
    '6': [
        {
            stops: '601 602 603 604 606 607 608 609 610 611 612 613 614 615 616 617 618 619 621 622 623 624 625 626 627 628 629 630 631 632 633 634 635 636 637 638 639 640'.split(' ')
        },
    ],
    '7': [
        {
            stops: '701 702 705 706 707 708 709 710 711 712 713 714 715 716 718 719 720 721 723 724 725 726'.split(' ')
        },
    ],
    'A': [
        {
            label: 'Inwood-207 St to Rockaway Blvd',
            stops: 'A02 A03 A05 A06 A07 A09 A12 A15 A24 A27 A28 A31 A32 A34 A36 A38 A40 A41 A42 A46 A48 A51 A55 A57 A59 A60 A61'.split(' ')
        },
        {
            label: 'Ozone Park-Lefferts Blvd branch',
            stops: 'A63 A64 A65'.split(' ')
        },
        {
            label: 'Rockaway branches to Broad Channel',
            stops: 'H01 H02 H03 H04'.split(' ')
        },
        {
            label: 'Far Rockaway-Mott Av branch',
            stops: 'H06 H07 H08 H09 H10 H11'.split(' ')
        },
        {
            label: 'Rockaway Park-Beach 116 St branch',
            stops: 'H12 H13 H14 H15'.split(' ')
        },
    ],
    'B': [
        {
            stops: 'D03 D04 D05 D06 D07 D08 D09 D10 D11 D12 D13 A14 A15 A16 A17 A18 A19 A20 A21 A22 A24 D14 D15 D16 D17 D20 D21 D22 R30 D24 D25 D26 D28 D31 D35 D39 D40'.split(' ')
        },
    ],
    'C': [
        {
            stops: 'A09 A10 A11 A12 A14 A15 A16 A17 A18 A19 A20 A21 A22 A24 A25 A27 A28 A30 A31 A32 A33 A34 A36 A38 A40 A41 A42 A43 A44 A45 A46 A47 A48 A49 A50 A51 A52 A53 A54 A55'.split(' ')
        },
    ],
    'D': [
        {
            stops: 'D01 D03 D04 D05 D06 D07 D08 D09 D10 D11 D12 D13 A15 A24 D14 D15 D16 D17 D20 D21 D22 R31 R36 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 D43'.split(' ')
        },
    ],
    'E': [
        {
            stops: 'G05 G06 G07 F05 F06 F07 G08 G14 G21 F09 F11 F12 D14 A25 A27 A28 A30 A31 A32 A33 A34 E01'.split(' ')
        },
    ],
    'F': [
        {
            stops: 'F01 F02 F03 F04 F05 F06 F07 G08 G14 G21 F09 F11 F12 D15 D16 D17 D18 D19 D20 D21 F14 F15 F16 F18 A41 F20 F21 F22 F23 F24 F25 F26 F27 F29 F30 F31 F32 F33 F34 F35 F36 F38 F39 D42 D43'.split(' ')
        },
    ],
    'G': [
        {
            stops: 'G22 G24 G26 G28 G29 G30 G31 G32 G33 G34 G35 G36 A42 F20 F21 F22 F23 F24 F25 F26 F27'.split(' ')
        },
    ],
    'J': [
        {
            stops: 'G05 G06 J12 J13 J14 J15 J16 J17 J19 J20 J21 J22 J23 J24 J27 J28 J29 J30 J31 M11 M12 M13 M14 M16 M18 M19 M20 M21 M22 M23'.split(' ')
        },
    ],
    'L': [
        {
            stops: 'L01 L02 L03 L05 L06 L08 L10 L11 L12 L13 L14 L15 L16 L17 L19 L20 L21 L22 L24 L25 L26 L27 L28 L29'.split(' ')
        },
    ],
    'M': [
        {
            stops: 'G08 G09 G10 G11 G12 G13 G14 G15 G16 G18 G19 G20 B04 B06 B08 B10 D15 D16 D17 D18 D19 D20 D21 M18 M16 M14 M13 M12 M11 M10 M09 M08 M06 M05 M04 M01'.split(' ')
        },
    ],
    'N': [
        {
            stops: 'R01 R03 R04 R05 R06 R08 R09 R11 R13 R14 R15 R16 R17 R20 Q01 R31 R36 R41 N02 N03 N04 N05 N06 N07 N08 N09 N10 D43'.split(' ')
        },
    ],
    'Q': [
        {
            stops: 'Q05 Q04 Q03 B08 R14 R16 R17 R20 Q01 R30 D24 D25 D26 D27 D28 D29 D30 D31 D32 D33 D34 D35 D37 D38 D39 D40 D41 D42 D43'.split(' ')
        },
    ],
    'R': [
        {
            stops: 'G08 G09 G10 G11 G12 G13 G14 G15 G16 G18 G19 G20 G21 R11 R13 R14 R15 R16 R17 R18 R19 R20 R21 R22 R23 R24 R25 R26 R27 R28 R29 R30 R31 R32 R33 R34 R35 R36 R39 R40 R41 R42 R43 R44 R45'.split(' ')
        },
    ],
    'S': [
        {
            label: '42 St Shuttle',
            stops: '902 901'.split(' ')
        },
        {
            label: 'Franklin Av Shuttle',
            stops: 'S01 S03 S04 D26'.split(' ')
        },
        {
            label: 'Rockaway Park Shuttle',
            stops: 'H04 H12 H13 H14 H15'.split(' ')
        },
    ],
    'SIR': [
        {
            stops: 'S31 S30 S29 S28 S27 S26 S25 S24 S23 S22 S21 S20 S19 S18 S17 S16 S15 S14 S13 S11 S09'.split(' ')
        },
    ],
    'W': [
        {
            stops: 'R01 R03 R04 R05 R06 R08 R09 R11 R13 R14 R15 R16 R17 R18 R19 R20 R21 R22 R23 R24 R25 R26 R27'.split(' ')
        },
    ],
    'Z': [
        {
            stops: 'G05 G06 J12 J14 J15 J17 J20 J21 J23 J24 J27 J28 J30 M11 M16 M18 M19 M20 M21 M22 M23'.split(' ')
        },
    ],
};
