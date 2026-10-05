# Agent School

A single-page, interactive beginner course on language models and AI agents (14 chapters).

- `index.html` is the built page (generated, do not edit by hand).
- `src/` holds the pieces: `style.css`, `shell.html`, `tail.html`, `common.js`, one `chNN.html` and `js/chNN.js` per chapter.
- `build.py` assembles everything: `python3 build.py`.
- `examples/` holds the optional Python programs shown in the chapters (standard library only, they run offline):
  `tiny_bigram.py`, `mini_rag.py`, `reliability_demo.py`, `mini_agent.py`, `approval_gate.py`.

Transcripts of the source videos are in `../transcripts/`.
