"""
Simple NLP Entity & Relation Extraction
for AI Crime Investigator (College Project Version)
"""

import re


# Known entities for demo
KNOWN_PERSONS = {"Ravi", "Arun", "Priya", "Kumar", "Suresh", "Meena", "Rahul", "Anita"}
KNOWN_LOCATIONS = {
    "warehouse", "downtown", "office", "server room", "parking lot",
    "chennai", "madurai", "coimbatore", "bangalore", "mumbai"
}
EVIDENCE_TERMS = {
    "fingerprint", "cctv", "phone", "mobile", "laptop", "weapon",
    "gun", "knife", "blood", "document", "photo", "video", "camera"
}


def extract_entities(text: str):
    """Extract PERSON, LOCATION, TIME, EVIDENCE from text."""
    entities = []
    seen = set()

    if not text:
        return entities

    text_lower = text.lower()

    # PERSON
    for name in KNOWN_PERSONS:
        if re.search(rf"\b{re.escape(name)}\b", text, re.IGNORECASE):
            key = ("PERSON", name)
            if key not in seen:
                entities.append({"text": name, "type": "PERSON", "id": f"person:{name.lower()}"})
                seen.add(key)

    # LOCATION
    for loc in KNOWN_LOCATIONS:
        if re.search(rf"\b{re.escape(loc)}\b", text_lower):
            display = loc.title()
            key = ("LOCATION", display)
            if key not in seen:
                entities.append({"text": display, "type": "LOCATION", "id": f"location:{loc}"})
                seen.add(key)

    # TIME patterns
    time_patterns = [
        r"\b\d{1,2}\s*(?:AM|PM|am|pm)\b",
        r"\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b",
        r"\b(?:at\s+)?\d{1,2}\s*(?:o'?clock)\b",
    ]
    for pat in time_patterns:
        for match in re.findall(pat, text, re.IGNORECASE):
            t = match.strip()
            key = ("TIME", t.lower())
            if key not in seen:
                entities.append({"text": t, "type": "TIME", "id": f"time:{t.lower().replace(' ', '_')}"})
                seen.add(key)

    # EVIDENCE
    for term in EVIDENCE_TERMS:
        if re.search(rf"\b{re.escape(term)}\b", text_lower):
            display = term.title()
            key = ("EVIDENCE", display)
            if key not in seen:
                entities.append({"text": display, "type": "EVIDENCE", "id": f"evidence:{term}"})
                seen.add(key)

    return entities


def extract_relations(text: str, entities: list):
    """Extract simple relationships between entities."""
    relations = []
    if not text or not entities:
        return relations

    text_lower = text.lower()
    persons = [e["text"] for e in entities if e["type"] == "PERSON"]
    locations = [e["text"] for e in entities if e["type"] == "LOCATION"]
    evidences = [e["text"] for e in entities if e["type"] == "EVIDENCE"]
    times = [e["text"] for e in entities if e["type"] == "TIME"]

    # seen_near / at location
    for person in persons:
        for loc in locations:
            patterns = [
                rf"{re.escape(person.lower())}.*?(?:seen|was|found|near|at|in).*?{re.escape(loc.lower())}",
                rf"{re.escape(loc.lower())}.*?(?:with|by).*?{re.escape(person.lower())}",
            ]
            for pat in patterns:
                if re.search(pat, text_lower):
                    relations.append({
                        "source": person,
                        "relation": "seen_near",
                        "target": loc,
                        "reason": f"{person} was associated with {loc} in the statement.",
                        "confidence": 0.85
                    })
                    break

    # evidence linked to location
    for ev in evidences:
        for loc in locations:
            if re.search(rf"{re.escape(ev.lower())}.*?(?:at|in|found).*?{re.escape(loc.lower())}", text_lower) or \
               re.search(rf"{re.escape(loc.lower())}.*?(?:had|contained|showed).*?{re.escape(ev.lower())}", text_lower):
                relations.append({
                    "source": ev,
                    "relation": "found_at",
                    "target": loc,
                    "reason": f"{ev} was found at {loc}.",
                    "confidence": 0.90
                })

    # person linked to evidence
    for person in persons:
        for ev in evidences:
            if re.search(rf"{re.escape(person.lower())}.*?(?:fingerprint|phone|laptop|weapon|had|left).*?{re.escape(ev.lower())}", text_lower) or \
               re.search(rf"{re.escape(ev.lower())}.*?(?:of|belonging to|from).*?{re.escape(person.lower())}", text_lower):
                relations.append({
                    "source": person,
                    "relation": "linked_to",
                    "target": ev,
                    "reason": f"{person} is linked to {ev}.",
                    "confidence": 0.80
                })

    # time associations
    for person in persons:
        for t in times:
            if re.search(rf"{re.escape(person.lower())}.*?{re.escape(t.lower())}", text_lower):
                relations.append({
                    "source": person,
                    "relation": "at_time",
                    "target": t,
                    "reason": f"{person} is mentioned at time {t}.",
                    "confidence": 0.75
                })

    # Deduplicate
    unique = []
    seen = set()
    for r in relations:
        key = (r["source"].lower(), r["relation"], r["target"].lower())
        if key not in seen:
            seen.add(key)
            unique.append(r)

    return unique
