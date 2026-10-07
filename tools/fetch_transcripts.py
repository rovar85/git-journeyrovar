#!/usr/bin/env python3
"""Download YouTube transcripts for the nine lecture videos into transcripts/.

Run this on YOUR computer (YouTube blocks the cloud sandbox this course is built in):

    pip install youtube-transcript-api
    python tools/fetch_transcripts.py            # writes transcripts/09-lecture-*.md
    git add transcripts && git commit -m "Add lecture transcripts" && git push

Files that already exist are skipped, so the script is safe to re-run.
Output format matches the existing transcripts: a title line, a Source line, then paragraphs.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

LECTURES = [  # (number, label, video id) resolved from the lnkd.in links
    (1, "transformers", "114i2Kz-LZA"),
    (2, "transformer-variants", "yT84Y5zCnaA"),
    (3, "llms-and-decoding", "Q5baLehv5So"),
    (4, "training-llms", "VlA_jt_3Qc4"),
    (5, "preference-tuning", "PmW_TMQ3l0I"),
    (6, "reasoning-models", "k5Fh-UgTuCo"),
    (7, "rag-tools-agents", "h-7S6HNq0Vg"),
    (8, "llm-evaluation", "8fNP4N46RRo"),
    (9, "trending-topics", "Q86qzJ1K1Ss"),
]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "transcripts")
SEGMENTS_PER_PARAGRAPH = 8


def title_of(video_id):
    """Ask YouTube's public oEmbed endpoint for the video title (falls back to the id)."""
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={video_id}")
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.load(r)["title"]
    except Exception:
        return video_id


def fetch_segments(video_id):
    from youtube_transcript_api import YouTubeTranscriptApi
    try:                                               # youtube-transcript-api 1.x
        fetched = YouTubeTranscriptApi().fetch(video_id, languages=["en", "en-US", "en-GB"])
        return [s.text for s in fetched]
    except AttributeError:                             # older 0.x API
        return [s["text"] for s in YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])]


def to_markdown(title, video_id, segments):
    texts = [" ".join(s.replace("\n", " ").split()) for s in segments if s.strip()]
    paragraphs = [" ".join(texts[i:i + SEGMENTS_PER_PARAGRAPH]) for i in range(0, len(texts), SEGMENTS_PER_PARAGRAPH)]
    head = f"# {title}\n\nSource: https://www.youtube.com/watch?v={video_id}\n\n"
    return head + "\n\n".join(paragraphs) + "\n"


def main():
    os.makedirs(OUT, exist_ok=True)
    failures = 0
    for number, label, video_id in LECTURES:
        path = os.path.join(OUT, f"09-lecture-{number}-{label}.md")
        if os.path.exists(path):
            print("skip (exists):", os.path.basename(path))
            continue
        try:
            segments = fetch_segments(video_id)
            with open(path, "w", encoding="utf-8") as f:
                f.write(to_markdown(title_of(video_id), video_id, segments))
            print(f"wrote {os.path.basename(path)} ({len(segments)} caption segments)")
        except Exception as e:                         # no captions, blocked, private video...
            failures += 1
            print(f"FAILED {label} ({video_id}): {type(e).__name__}: {str(e).splitlines()[0][:120]}")
    print("done" if not failures else f"done with {failures} failure(s); re-run, or tell Claude which ones failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
