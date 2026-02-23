"""
Batch TTS Generator for MTA Subway Announcements
Uses Google Cloud Text-to-Speech API (Neural2)

Prerequisites:
1. pip install google-cloud-texttospeech
2. Create a Google Cloud project, enable the Text-to-Speech API
3. Create a service account key (JSON) and set:
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-key.json"
   OR pass the key path as an argument: python generate_tts.py /path/to/your-key.json

Voice: en-US-Neural2-J | Speed: 1.1 | Pitch: 0 | Style: firm
Free tier: 1M Neural2 characters/month
"""

import os
import sys
import re
from google.cloud import texttospeech

# If a service account key path is passed as argument, set it
if len(sys.argv) > 1:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = sys.argv[1]

OUTPUT_DIR = "audio3"
VOICE_NAME = "en-US-News-N"
SPEAKING_RATE = 1.0
PITCH = 0.0

# ── Clip definitions ──

phrases = {
    "there_is": "There is",
    "a": "a",
    "an": "an",
    "train_to": "train, to",
    "approaching": "approaching the station. Please stand away from the platform edge.",
}

directions = {
    "uptown": "Uptown",
    "downtown": "Downtown",
    "brooklyn_bound": "Brooklyn-bound",
    "bronx_bound": "Bronx-bound",
    "queens_bound": "Queens-bound",
    "manhattan_bound": "Manhattan-bound",
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

# ── Minutes: "1 minute away" through "99 minutes away" ──

minutes = {}
for i in range(1, 100):
    word = "minute" if i == 1 else "minutes"
    minutes[str(i)] = f"{i} {word} away."

# ── Station names ──
# We pronounce them with ordinals and expanded abbreviations

def to_ordinal(n):
    num = int(n)
    last_two = num % 100
    if 11 <= last_two <= 13:
        return f"{n}th"
    remainder = num % 10
    if remainder == 1:
        return f"{n}st"
    elif remainder == 2:
        return f"{n}nd"
    elif remainder == 3:
        return f"{n}rd"
    else:
        return f"{n}th"

def pronounce_station_name(name):
    """Convert station name to TTS-friendly pronunciation."""
    result = name
    # Expand directional prefixes first
    result = re.sub(r'\bW\b', 'West', result)
    result = re.sub(r'\bE\b', 'East', result)
    result = re.sub(r'\bN\b(?!\s*$)', 'North', result)
    # Convert number ranges with dash: "47-50 Sts" -> "47th through 50th Streets"
    result = re.sub(r'(\d+)-(\d+)\s*Sts\b', lambda m: to_ordinal(m.group(1)) + ' through ' + to_ordinal(m.group(2)) + ' Streets', result)
    # Convert "Sts" (plural) without number range
    result = re.sub(r'(\d+)\s*Sts\b', lambda m: to_ordinal(m.group(1)) + ' Streets', result)
    # Convert numbered streets: "242 St" -> "242nd Street"
    result = re.sub(r'(\d+)\s*St\b', lambda m: to_ordinal(m.group(1)) + ' Street', result)
    # Convert numbered avenues: "3 Av" -> "3rd Avenue"
    result = re.sub(r'(\d+)\s*Av\b', lambda m: to_ordinal(m.group(1)) + ' Avenue', result)
    # Convert numbered drives: "63 Dr" -> "63rd Drive"
    result = re.sub(r'(\d+)\s*Dr\b', lambda m: to_ordinal(m.group(1)) + ' Drive', result)
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
    stations[key] = pronounce_station_name(name)

# ── Generate all clips ──

def generate_clip(client, text, filepath):
    """Generate a single TTS clip and save to filepath."""
    if os.path.exists(filepath):
        print(f"  SKIP (exists): {filepath}")
        return

    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-US",
        name=VOICE_NAME,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=SPEAKING_RATE,
        pitch=PITCH,
    )

    response = client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
    )

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as out:
        out.write(response.audio_content)
    print(f"  OK: {filepath} <- \"{text}\"")


def main():
    client = texttospeech.TextToSpeechClient()

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

    for category, clips in all_clips.items():
        print(f"\n=== {category.upper()} ({len(clips)} clips) ===")
        for filename, text in clips.items():
            filepath = os.path.join(OUTPUT_DIR, category, f"{filename}.mp3")
            generate_clip(client, text, filepath)
            generated += 1
            if generated % 50 == 0:
                print(f"  ... {generated}/{total} done")

    print(f"\nDone! Generated {total} clips in '{OUTPUT_DIR}/' directory.")
    print(f"\nFilename mapping saved for frontend lookup.")

    # Save a JSON mapping: original station name -> filename
    import json
    station_map = {}
    for name in station_names_raw:
        station_map[name] = sanitize_filename(name)

    map_path = os.path.join(OUTPUT_DIR, "station_map.json")
    with open(map_path, "w") as f:
        json.dump(station_map, f, indent=2)
    print(f"Station name -> filename mapping saved to {map_path}")


if __name__ == "__main__":
    main()
