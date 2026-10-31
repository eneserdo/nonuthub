"""Find more videos for every category and write docs/videos.json. Run daily by .github/workflows/videos.yml.

    python tools/fetch_videos.py

Searches YouTube (restricted mode) with the queries below, keeps only videos that
  - come from a trusted channel of that category, or (in open categories) have enough views and a clean title,
  - fit the category's length range,
  - allow embedding (YouTube oEmbed answers 200),
and skips the hand-picked videos already in docs/data.js. Nothing is downloaded; the site embeds YouTube's player.
"""
import json, re, time
from datetime import datetime, timezone
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "videos.json"
PER_CAT, PER_CHANNEL = 40, 6

# name: (queries, trusted channels, open to other channels with >= min views, (min, max) seconds)
CATS = {
    "urge": (["urge surfing guided meditation", "guided meditation for cravings", "mindfulness for urges and cravings", "riding the wave of craving meditation"],
             {"Eating Recovery Center", "Kernel of Wisdom - Mental Health & Mindfulness", "Declutter The Mind", "Psych Insights", "Jennifer May, Ph.D.", "Headspace",
              "Great Meditation", "The Mindful Movement", "Calm"}, 20_000, (120, 1800)),
    "breathe": (["guided breathing exercise", "box breathing guided", "wim hof guided breathing", "resonance breathing 6 breaths per minute", "physiological sigh huberman"],
                {"Wim Hof", "Hands-On Meditation", "Pocket Breath Coach - Luke Horton", "Breath Central", "Feeling Healing", "Take a Deep Breath", "Huberman Lab Clips"}, 100_000, (120, 1800)),
    "sweat": (["100 push ups follow along", "10 minute bodyweight workout follow along", "calisthenics workout follow along", "10 minute stretching routine follow along", "burpee workout follow along"],
              {"THENX", "Jordan Yeoh Fitness", "Calisthenicmovement", "Jeremy Ethier", "ATHLEAN-X™", "Bob & Brad", "PS Fit", "FitnessBlender", "Chris Heria", "Hybrid Calisthenics",
               "Tone and Tighten", "Jeff Nippard", "Caliverse"}, None, (240, 2700)),
    "cold": (["cold shower benefits science", "cold exposure science explained", "ice bath benefits explained", "wim hof cold shower"],
             {"SciShow", "Jeremy Ethier", "Wim Hof", "Huberman Lab Clips", "Andrew Huberman", "The Proof with Simon Hill", "Kurzgesagt – In a Nutshell", "Veritasium"}, 300_000, (120, 1500)),
    "brainoff": (["bob ross full episode", "pasta grannies", "primitive technology", "hydraulic press channel", "hand tool rescue restoration", "gothamchess guess the elo", "tom scott",
                  "my mechanics restoration", "how it's made", "wood turning"],
                 {"Bob Ross", "Pasta Grannies", "Primitive Technology", "Hydraulic Press Channel", "Hand Tool Rescue", "GothamChess", "Tom Scott", "my mechanics", "Science Channel",
                  "Make Something", "Blacktail Studio", "Stuff Made Here", "Practical Engineering", "Mark Rober"}, None, (240, 5400)),
    "grass": (["train driver view cab ride 4k", "4k nature walk no talking", "forest walk rain 4k", "mountain hike pov 4k", "slow tv train"],
              {"AKSense - Zurich", "Scotland's Wild", "Ambient Exploration", "4K Relaxation Channel", "ExciteHike", "Walks Of Wonder", "Rail Relaxation", "NRK"}, 50_000, (600, 14400)),
    "talks": (["ted talk breaking bad habits", "tedx porn addiction", "ted-ed habits brain", "dopamine addiction lecture", "huberman dopamine clip", "self control psychology talk"],
              {"TED", "TEDx Talks", "TED-Ed", "Huberman Lab Clips", "Stanford Alumni", "Kurzgesagt – In a Nutshell", "Big Think", "Stanford Medicine", "Yale University"}, None, (180, 2700)),
}
BLOCK = re.compile(r"\b(sexy|hot|bikini|nsfw|onlyfans|tate|girls?|babe|booty|twerk|lingerie|thirst|kiss|dating|seduc\w*|attract\w*|asmr|prank|#shorts|dmt|binge|cigarettes?|smoking|weed|alcohol)\b", re.I)
BLOCK_CH = {"Brain Mindset", "RESPIRE", "Relaxed ASMR", "After Skool", "Motiversity"}   # reupload and compilation channels

S = requests.Session()
S.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"})
S.cookies.set("PREF", "f2=8000000", domain=".youtube.com")                     # restricted mode
CTX = {"client": {"clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en", "gl": "US"}}

def secs(s):
    return sum(int(x) * 60 ** i for i, x in enumerate(reversed(s.split(":")))) if s else 0

def renderers(o):
    if isinstance(o, dict):
        if "videoRenderer" in o: yield o["videoRenderer"]
        else:
            for x in o.values(): yield from renderers(x)
    elif isinstance(o, list):
        for x in o: yield from renderers(x)

def search(q, pages=2):
    body, out = {"context": CTX, "query": q, "params": "EgIQAQ%3D%3D"}, []            # type: video
    for _ in range(pages):
        r = S.post("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", json=body, timeout=25)
        if not r.ok: break
        d = r.json(); out += list(renderers(d))
        tok = re.search(r'"continuationCommand":\{"token":"([^"]+)"', r.text)
        if not tok: break
        body = {"context": CTX, "continuation": tok.group(1)}; time.sleep(0.5)
    return out

def embeddable(vid):
    r = S.get("https://www.youtube.com/oembed", params={"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"}, timeout=20)
    return r.json() if r.status_code == 200 else None

def main():
    pinned = set(re.findall(r'\{ id: "([\w-]{11})"', (ROOT / "docs" / "data.js").read_text(encoding="utf-8")))
    old = {v["id"]: v for v in json.loads(OUT.read_text(encoding="utf-8")).get("videos", [])} if OUT.exists() else {}
    seen, result = set(pinned), []
    for cat, (queries, trusted, min_views, (lo, hi)) in CATS.items():
        picked, per_ch = [], {}
        for q in queries:
            for v in search(q):
                vid = v.get("videoId"); title = "".join(r["text"] for r in v.get("title", {}).get("runs", []))
                ch = (v.get("ownerText", {}).get("runs") or [{}])[0].get("text", "").strip()
                sec = secs(v.get("lengthText", {}).get("simpleText")); views = int(re.sub(r"\D", "", v.get("viewCountText", {}).get("simpleText", "")) or 0)
                if not vid or vid in seen or not lo <= sec <= hi or BLOCK.search(title) or BLOCK.search(ch) or ch in BLOCK_CH or v.get("badges") and "LIVE" in json.dumps(v["badges"]): continue
                if ch not in trusted and (min_views is None or views < min_views): continue
                if per_ch.get(ch, 0) >= PER_CHANNEL: continue
                if vid not in old and not embeddable(vid): continue
                seen.add(vid); per_ch[ch] = per_ch.get(ch, 0) + 1
                picked.append({"id": vid, "cat": cat, "sec": sec, "views": views, "age": v.get("publishedTimeText", {}).get("simpleText", ""), "ch": ch, "title": title})
            time.sleep(0.4)
        picked.sort(key=lambda x: (x["ch"] not in trusted, -x["views"]))
        result += picked[:PER_CAT]
        print(f"{cat}: {len(picked[:PER_CAT])} videos")
    if len(result) < 30:                                                    # search broke: keep yesterday's list
        print("too few results, keeping the old file"); return
    OUT.write_text(json.dumps({"fetched": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "videos": result}, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"wrote {len(result)} videos to {OUT}")

if __name__ == "__main__":
    main()
