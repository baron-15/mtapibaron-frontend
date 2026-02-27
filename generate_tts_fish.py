"""
Batch TTS Generator for MTA Subway Announcements
Uses Fish Audio Text-to-Speech API (S1 model)

Prerequisites:
1. pip install ormsgpack httpx
2. Run: python generate_tts_fish.py

Voice Model ID: 4f942ae62f85423c9e2fadc4b0df2b02
Model: S1 | Speed: 1x | Volume: 0 | Temp: 0.9 | Top P: 0.9
Latency: normal (high quality)
"""

import os
import re
import httpx
import ormsgpack

API_KEY = "a84917d1d3d34032a7350a1beec396a4"
REFERENCE_ID = "4f942ae62f85423c9e2fadc4b0df2b02"
OUTPUT_DIR = "audio8"

TTS_URL = "https://api.fish.audio/v1/tts"
HEADERS = {
    "authorization": f"Bearer {API_KEY}",
    "content-type": "application/msgpack",
    "model": "s1",
}

TTS_PARAMS = {
    "reference_id": REFERENCE_ID,
    "format": "mp3",
    "mp3_bitrate": 128,
    "chunk_length": 300,
    "normalize": True,
    "latency": "normal",
    "temperature": 0.75,
    "top_p": 0.9,
    "prosody": {
        "speed": 1,
        "volume": 0,
    },
}

# ── Clip definitions ──

phrases = {
    "there_is": "There is",
    "a": "a",
    "an": "an",
    "train": "train",
    "train_to": "train, to",
    "approaching": "approaching the station. Please stand away from the platform edge!",
    "approaching2": "approaching the station. Please stand away from the platform edge.",
}

directions = {
    "uptown": "Uptown",
    "downtown": "Downtown",
    "brooklyn_bound": "Brooklyn-bound",
    "bronx_bound": "Bronx-bound",
    "queens_bound": "Queens-bound",
    "manhattan_bound": "Manhattan-bound",
    "bound": "bound",
}

services = {
    "local": "local",
    "express": "express",
}

routes = {
    "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
    "A": "A", "B": "B", "C": "C", "D": "D", "E": "E", "F": "F", "G": "G",
    "J": "J", "L": "L", "M": "M", "N": "N", "Q": "Q", "R": "R",
    "S": "S", "W": "W", "Z": "Z",
}

# ── Number to words conversion ──

def number_to_words(n):
    """Convert a number (1-999) to words."""
    ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
    teens = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
             "sixteen", "seventeen", "eighteen", "nineteen"]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

    num = int(n)
    if num == 0:
        return "zero"

    result = []

    # Hundreds
    if num >= 100:
        result.append(ones[num // 100])
        result.append("hundred")
        num %= 100

    # Tens and ones
    if num >= 20:
        result.append(tens[num // 10])
        if num % 10 > 0:
            result.append(ones[num % 10])
    elif num >= 10:
        result.append(teens[num - 10])
    elif num > 0:
        result.append(ones[num])

    return " ".join(result)

def number_to_ordinal_words(n):
    """Convert a number to ordinal words (e.g., 1 -> 'first', 175 -> 'one hundred seventy fifth')."""
    num = int(n)

    # Special cases for first, second, third
    if num == 1:
        return "first"
    elif num == 2:
        return "second"
    elif num == 3:
        return "third"
    elif num == 5:
        return "fifth"
    elif num == 8:
        return "eighth"
    elif num == 9:
        return "ninth"
    elif num == 12:
        return "twelfth"

    # For numbers ending in -ty (20, 30, etc.), change to -tieth
    words = number_to_words(num)

    # Handle special ordinal endings
    if words.endswith("one"):
        return words[:-3] + "first"
    elif words.endswith("two"):
        return words[:-3] + "second"
    elif words.endswith("three"):
        return words[:-5] + "third"
    elif words.endswith("five"):
        return words[:-4] + "fifth"
    elif words.endswith("eight"):
        return words[:-5] + "eighth"
    elif words.endswith("nine"):
        return words[:-4] + "ninth"
    elif words.endswith("twelve"):
        return words[:-6] + "twelfth"
    elif words.endswith("twenty"):
        return words[:-1] + "ieth"
    elif words.endswith("thirty"):
        return words[:-1] + "ieth"
    elif words.endswith("forty"):
        return words[:-1] + "ieth"
    elif words.endswith("fifty"):
        return words[:-1] + "ieth"
    elif words.endswith("sixty"):
        return words[:-1] + "ieth"
    elif words.endswith("seventy"):
        return words[:-1] + "ieth"
    elif words.endswith("eighty"):
        return words[:-1] + "ieth"
    elif words.endswith("ninety"):
        return words[:-1] + "ieth"
    else:
        return words + "th"

# ── Minutes: "1 minute away" through "99 minutes away" ──

minutes = {}
for i in range(1, 100):
    num_words = number_to_words(i)
    word = "minute" if i == 1 else "minutes"
    minutes[str(i)] = f"{num_words} {word} away."

# ── Station names ──
# We pronounce them with ordinals and expanded abbreviations

def pronounce_station_name(name):
    """Convert station name to TTS-friendly pronunciation with full word numbers."""
    result = name
    # Expand WTC abbreviation
    result = result.replace('WTC', 'World Trade Center')
    # Expand directional prefixes first
    result = re.sub(r'\bW\b', 'West', result)
    result = re.sub(r'\bE\b', 'East', result)
    result = re.sub(r'\bN\b(?!\s*$)', 'North', result)
    # Convert number ranges with dash: "47-50 Sts" -> "forty seventh through fiftieth Streets"
    result = re.sub(r'(\d+)-(\d+)\s*Sts\b', lambda m: number_to_ordinal_words(m.group(1)) + ' through ' + number_to_ordinal_words(m.group(2)) + ' Streets', result)
    # Convert "Sts" (plural) without number range
    result = re.sub(r'(\d+)\s*Sts\b', lambda m: number_to_ordinal_words(m.group(1)) + ' Streets', result)
    # Convert numbered streets: "242 St" -> "two hundred forty second Street"
    result = re.sub(r'(\d+)\s*St\b', lambda m: number_to_ordinal_words(m.group(1)) + ' Street', result)
    # Convert numbered avenues: "3 Av" -> "third Avenue"
    result = re.sub(r'(\d+)\s*Av\b', lambda m: number_to_ordinal_words(m.group(1)) + ' Avenue', result)
    # Convert numbered drives: "63 Dr" -> "sixty third Drive"
    result = re.sub(r'(\d+)\s*Dr\b', lambda m: number_to_ordinal_words(m.group(1)) + ' Drive', result)
    # Expand "Avs" plural
    result = re.sub(r'(\w+)\s*Avs\b', r'\1 Avenues', result)
    # "St" as "Saint" when before a name (St Mary's, St George, St Lawrence)
    result = re.sub(r'\bSt\b(?=\s+[A-Z][a-z])', 'Saint', result)
    # Replace dashes with period + space for natural pause
    result = result.replace('-', '. ')
    # Expand common abbreviations
    result = result.replace('Blvd', 'Boulevard')
    result = result.replace('Pkwy', 'Parkway')
    result = result.replace('Pky', 'Parkway')
    result = result.replace('Ctr', 'Center')
    result = result.replace('Hts', 'Heights')
    result = result.replace('Hwy', 'Highway')
    result = re.sub(r'\bAv\b', 'Avenue', result)
    result = re.sub(r'\bSq\b', 'Square', result)
    result = re.sub(r'\bPl\b', 'Place', result)
    result = re.sub(r'\bDr\b', 'Drive', result)
    result = re.sub(r'\bRd\b', 'Road', result)
    result = re.sub(r'\bLn\b', 'Lane', result)
    result = re.sub(r'\bPkwy\b', 'Parkway', result)
    result = re.sub(r'\bSt\b', 'Street', result)
    result = result.replace('Tpke', 'Turnpike')
    result = result.replace('Tpk', 'Turnpike')
    result = result.replace('Wash ', 'Washington ')
    return result

def sanitize_filename(name):
    """Convert station name to a safe filename."""
    return re.sub(r'[^a-zA-Z0-9]', '_', name).lower().strip('_')

station_names_raw = [
    "1 Av",
    "103 St",
    "103 St-Corona Plaza",
    "104 St",
    "110 St",
    "110 St-Malcolm X Plaza",
    "111 St",
    "116 St",
    "116 St-Columbia University",
    "121 St",
    "125 St",
    "135 St",
    "137 St-City College",
    "138 St-Grand Concourse",
    "14 St",
    "14 St-Union Sq",
    "145 St",
    "149 St-Grand Concourse",
    "15 St-Prospect Park",
    "155 St",
    "157 St",
    "161 St-Yankee Stadium",
    "163 St-Amsterdam Av",
    "167 St",
    "168 St",
    "168 St-Washington Hts",
    "169 St",
    "170 St",
    "174 St",
    "174-175 Sts",
    "175 St",
    "176 St",
    "18 Av",
    "18 St",
    "181 St",
    "182-183 Sts",
    "183 St",
    "190 St",
    "191 St",
    "2 Av",
    "20 Av",
    "207 St",
    "21 St",
    "21 St-Queensbridge",
    "215 St",
    "219 St",
    "225 St",
    "23 St",
    "23 St-Baruch College",
    "231 St",
    "233 St",
    "238 St",
    "25 Av",
    "25 St",
    "28 St",
    "3 Av",
    "3 Av-138 St",
    "3 Av-149 St",
    "30 Av",
    "33 St",
    "33 St-Rawson St",
    "34 St-Herald Sq",
    "34 St-Hudson Yards",
    "34 St-Penn Station",
    "36 Av",
    "36 St",
    "39 Av-Dutch Kills",
    "4 Av-9 St",
    "40 St-Lowery St",
    "42 St-Bryant Pk",
    "42 St-Port Authority Bus Terminal",
    "45 St",
    "46 St",
    "46 St-Bliss St",
    "47-50 Sts-Rockefeller Ctr",
    "49 St",
    "5 Av",
    "5 Av/53 St",
    "5 Av/59 St",
    "50 St",
    "51 St",
    "52 St",
    "53 St",
    "55 St",
    "57 St",
    "57 St-7 Av",
    "59 St",
    "59 St-Columbus Circle",
    "6 Av",
    "61 St-Woodside",
    "62 St",
    "63 Dr-Rego Park",
    "65 St",
    "66 St-Lincoln Center",
    "67 Av",
    "68 St-Hunter College",
    "69 St",
    "7 Av",
    "71 St",
    "72 St",
    "74 St-Broadway",
    "75 Av",
    "75 St-Elderts Ln",
    "77 St",
    "79 St",
    "8 Av",
    "8 St-NYU",
    "80 St",
    "81 St-Museum of Natural History",
    "82 St-Jackson Hts",
    "85 St-Forest Pkwy",
    "86 St",
    "88 St",
    "9 Av",
    "90 St-Elmhurst Av",
    "96 St",
    "Alabama Av",
    "Allerton Av",
    "Annadale",
    "Aqueduct Racetrack",
    "Aqueduct-N Conduit Av",
    "Arthur Kill",
    "Astor Pl",
    "Astoria Blvd",
    "Astoria-Ditmars Blvd",
    "Atlantic Av",
    "Atlantic Av-Barclays Ctr",
    "Avenue H",
    "Avenue I",
    "Avenue J",
    "Avenue M",
    "Avenue N",
    "Avenue P",
    "Avenue U",
    "Avenue X",
    "Bay 50 St",
    "Bay Pkwy",
    "Bay Ridge Av",
    "Bay Ridge-95 St",
    "Bay Terrace",
    "Baychester Av",
    "Beach 105 St",
    "Beach 25 St",
    "Beach 36 St",
    "Beach 44 St",
    "Beach 60 St",
    "Beach 67 St",
    "Beach 90 St",
    "Beach 98 St",
    "Bedford Av",
    "Bedford Park Blvd",
    "Bedford Park Blvd-Lehman College",
    "Bedford-Nostrand Avs",
    "Bergen St",
    "Beverley Rd",
    "Beverly Rd",
    "Bleecker St",
    "Borough Hall",
    "Botanic Garden",
    "Bowery",
    "Bowling Green",
    "Briarwood",
    "Brighton Beach",
    "Broad Channel",
    "Broad St",
    "Broadway",
    "Broadway Junction",
    "Broadway-Lafayette St",
    "Bronx Park East",
    "Brook Av",
    "Brooklyn Bridge-City Hall",
    "Buhre Av",
    "Burke Av",
    "Burnside Av",
    "Bushwick Av-Aberdeen St",
    "Canal St",
    "Canarsie-Rockaway Pkwy",
    "Carroll St",
    "Castle Hill Av",
    "Cathedral Pkwy (110 St)",
    "Central Av",
    "Chambers St",
    "Chauncey St",
    "Christopher St-Stonewall",
    "Church Av",
    "City Hall",
    "Clark St",
    "Classon Av",
    "Cleveland St",
    "Clifton",
    "Clinton-Washington Avs",
    "Coney Island-Stillwell Av",
    "Cortelyou Rd",
    "Cortlandt St",
    "Court Sq",
    "Court Sq-23 St",
    "Court St",
    "Crescent St",
    "Crown Hts-Utica Av",
    "Cypress Av",
    "Cypress Hills",
    "DeKalb Av",
    "Delancey St-Essex St",
    "Ditmas Av",
    "Dongan Hills",
    "Dyckman St",
    "E 143 St-St Mary's St",
    "E 149 St",
    "E 180 St",
    "East 105 St",
    "East Broadway",
    "Eastchester-Dyre Av",
    "Eastern Pkwy-Brooklyn Museum",
    "Elder Av",
    "Elmhurst Av",
    "Eltingville",
    "Euclid Av",
    "Far Rockaway-Mott Av",
    "Flatbush Av-Brooklyn College",
    "Flushing Av",
    "Flushing-Main St",
    "Fordham Rd",
    "Forest Av",
    "Forest Hills-71 Av",
    "Fort Hamilton Pkwy",
    "Franklin Av",
    "Franklin Av-Medgar Evers College",
    "Franklin St",
    "Freeman St",
    "Fresh Pond Rd",
    "Fulton St",
    "Gates Av",
    "Graham Av",
    "Grand Army Plaza",
    "Grand Av-Newtown",
    "Grand Central-42 St",
    "Grand St",
    "Grant Av",
    "Grant City",
    "Grasmere",
    "Great Kills",
    "Greenpoint Av",
    "Gun Hill Rd",
    "Halsey St",
    "Harlem-148 St",
    "Hewes St",
    "High St",
    "Houston St",
    "Howard Beach-JFK Airport",
    "Hoyt St",
    "Hoyt-Schermerhorn Sts",
    "Huguenot",
    "Hunters Point Av",
    "Hunts Point Av",
    "Intervale Av",
    "Inwood-207 St",
    "Jackson Av",
    "Jackson Hts-Roosevelt Av",
    "Jamaica Center-Parsons/Archer",
    "Jamaica-179 St",
    "Jamaica-Van Wyck",
    "Jay St-MetroTech",
    "Jefferson Av",
    "Jefferson St",
    "Junction Blvd",
    "Junius St",
    "Kew Gardens-Union Tpke",
    "Kings Hwy",
    "Kingsbridge Rd",
    "Kingston Av",
    "Kingston-Throop Avs",
    "Knickerbocker Av",
    "Kosciuszko St",
    "Lafayette Av",
    "Lexington Av/53 St",
    "Lexington Av/59 St",
    "Lexington Av/63 St",
    "Liberty Av",
    "Livonia Av",
    "Longwood Av",
    "Lorimer St",
    "Marble Hill-225 St",
    "Marcy Av",
    "Metropolitan Av",
    "Mets-Willets Point",
    "Middle Village-Metropolitan Av",
    "Middletown Rd",
    "Montrose Av",
    "Morgan Av",
    "Morris Park",
    "Morrison Av-Soundview",
    "Mosholu Pkwy",
    "Mt Eden Av",
    "Myrtle Av",
    "Myrtle-Willoughby Avs",
    "Myrtle-Wyckoff Avs",
    "Nassau Av",
    "Neck Rd",
    "Neptune Av",
    "Nereid Av",
    "Nevins St",
    "New Dorp",
    "New Lots Av",
    "New Utrecht Av",
    "Newkirk Av-Little Haiti",
    "Newkirk Plaza",
    "Northern Blvd",
    "Norwood Av",
    "Norwood-205 St",
    "Nostrand Av",
    "Oakwood Heights",
    "Ocean Pkwy",
    "Old Town",
    "Ozone Park-Lefferts Blvd",
    "Park Pl",
    "Park Place",
    "Parkchester",
    "Parkside Av",
    "Parsons Blvd",
    "Pelham Bay Park",
    "Pelham Pkwy",
    "Pennsylvania Av",
    "Pleasant Plains",
    "President St-Medgar Evers College",
    "Prince St",
    "Prince's Bay",
    "Prospect Av",
    "Prospect Park",
    "Queens Plaza",
    "Queensboro Plaza",
    "Ralph Av",
    "Rector St",
    "Richmond Valley",
    "Rockaway Av",
    "Rockaway Blvd",
    "Rockaway Park-Beach 116 St",
    "Roosevelt Island",
    "Saratoga Av",
    "Seneca Av",
    "Sheepshead Bay",
    "Shepherd Av",
    "Simpson St",
    "Smith-9 Sts",
    "South Ferry",
    "Spring St",
    "St George",
    "St Lawrence Av",
    "Stapleton",
    "Steinway St",
    "Sterling St",
    "Sutphin Blvd",
    "Sutphin Blvd-Archer Av-JFK Airport",
    "Sutter Av",
    "Sutter Av-Rutland Rd",
    "Times Sq-42 St",
    "Tompkinsville",
    "Tottenville",
    "Tremont Av",
    "Union St",
    "Utica Av",
    "Van Cortlandt Park-242 St",
    "Van Siclen Av",
    "Vernon Blvd-Jackson Av",
    "W 4 St-Wash Sq",
    "W 8 St-NY Aquarium",
    "WTC Cortlandt",
    "Wakefield-241 St",
    "Wall St",
    "West Farms Sq-E Tremont Av",
    "Westchester Sq-E Tremont Av",
    "Whitehall St-South Ferry",
    "Whitlock Av",
    "Wilson Av",
    "Winthrop St",
    "Woodhaven Blvd",
    "Woodlawn",
    "World Trade Center",
    "York St",
    "Zerega Av",
]

stations = {}
for name in station_names_raw:
    key = sanitize_filename(name)
    stations[key] = pronounce_station_name(name) + "."

# Add station name parts for stations with dashes (for use with "_bound")
for name in station_names_raw:
    if '-' in name:
        last_part = name.split('-')[-1].strip()
        key = sanitize_filename(last_part)
        # Only add if not already in stations (avoid duplicates)
        if key not in stations:
            stations[key] = pronounce_station_name(last_part) + "."

# Add special exceptions for stations that use first part instead of last part
stations['coney_island'] = pronounce_station_name('Coney Island') + "."
stations['van_cortlandt_park'] = pronounce_station_name('Van Cortlandt Park') + "."

# ── Generate all clips ──

def generate_clip(client, text, filepath):
    """Generate a single TTS clip via Fish Audio API and save to filepath."""
    try:
        request_data = {
            "text": text,
            **TTS_PARAMS,
        }

        response = client.post(
            TTS_URL,
            content=ormsgpack.packb(request_data),
            headers=HEADERS,
            timeout=30.0,
        )

        if response.status_code != 200:
            print(f"  ERROR: {filepath} - HTTP {response.status_code}: {response.text[:200]}")
            return

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "wb") as out:
            out.write(response.content)
        print(f"  OK: {filepath} <- \"{text}\"")
    except Exception as e:
        print(f"  ERROR: {filepath} - {e}")


def main():
    client = httpx.Client()

    all_clips = {
        "phrases": phrases,
        "directions": directions,
        "services": services,
        "routes": routes,
        "minutes": minutes,
        "stations": stations,
    }

    total = sum(len(v) for v in all_clips.values())
    generated = 0

    print(f"Fish Audio TTS Generator")
    print(f"Model: S1 | Voice: {REFERENCE_ID}")
    print(f"Output directory: {OUTPUT_DIR}/")
    print(f"Total clips to generate: {total}")
    print()

    for category, clips in all_clips.items():
        print(f"\n=== {category.upper()} ({len(clips)} clips) ===")
        for filename, text in clips.items():
            filepath = os.path.join(OUTPUT_DIR, category, f"{filename}.mp3")
            # Skip if file already exists
            if os.path.exists(filepath):
                print(f"  SKIP (exists): {filepath}")
            else:
                generate_clip(client, text, filepath)
            generated += 1
            if generated % 50 == 0:
                print(f"  ... {generated}/{total} processed")

    client.close()

    print(f"\nDone! Generated {total} clips in '{OUTPUT_DIR}/' directory.")

    # Save a JSON mapping: original station name -> filename
    import json
    station_map = {}
    for name in station_names_raw:
        station_map[name] = sanitize_filename(name)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    map_path = os.path.join(OUTPUT_DIR, "station_map.json")
    with open(map_path, "w") as f:
        json.dump(station_map, f, indent=2)
    print(f"Station name -> filename mapping saved to {map_path}")


if __name__ == "__main__":
    main()
