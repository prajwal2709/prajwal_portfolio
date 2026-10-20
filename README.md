---
title: Prajwal Portfolio API
sdk: docker
app_port: 7860
---

# Prajwal's portfolio

This repository contains the portfolio website in `site/` and its FastAPI backend at the repository root.

## Deploy the backend to Hugging Face Spaces

1. Create a Docker Space and upload this repository's backend files, including `Dockerfile`, `main.py`, `rag.py`, `ingest.py`, `requirements.txt`, `knowledge/`, and `model/`.
2. In Space settings, add `OPENROUTER_API_KEY` as a secret if you want live chat. The backend URL will be `https://<user>-<space>.hf.space`.
3. To preserve heart totals across Space restarts, attach a writable Storage Bucket mounted at `/data` and set `STATS_DB_PATH=/data/portfolio_stats.sqlite3`. Without persistent storage, local SQLite data may reset when the Space restarts.

Hugging Face serves the API on that Space URL. The Dockerfile runs FastAPI on port `7860`.

## Deploy the website to Cloudflare Pages

1. Connect this GitHub repository to Cloudflare Pages.
2. Use the repository root as the project root, set the build command to `exit 0`, and set the build output directory to `site`.
3. After deploying, copy the public Pages URL from the Cloudflare dashboard. Set the backend's `ALLOWED_ORIGINS` variable to this exact URL.
4. Edit `site/index.html` and set the `API` variable to the Hugging Face Space URL, for example `https://<user>-<space>.hf.space`. Push that update; Cloudflare Pages will redeploy.

The `site/` folder contains the home page, screenshots, and resume. The old `prajwal-pixel-portfolio-selfhost.html` URL redirects to `site/index.html` for local use.

## API endpoints

- `POST /predict` – upload a leaf image, get the crop disease prediction from YOUR MobileNetV2 model
- `POST /chat` – question in, answer out, retrieved from YOUR documents in ChromaDB (RAG) and generated via OpenRouter
- `POST /presence` – refresh an anonymous visitor heartbeat and return active viewers and appreciation totals
- `POST /appreciation` – toggle one appreciation per browser
- `GET /health` – quick status check

## Add the crop model
Copy these into `model/`:
- `crop_model.keras` – your trained model (`model.save("crop_model.keras")`)
- `classes.json` – class names in the SAME order as training, e.g. `["Apple Scab Leaf", "..."]`

Preprocessing: the code uses `mobilenet_v2.preprocess_input` at 224x224. If your model already
contains a Rescaling/preprocess layer, or you trained with `/255`, change that line in `main.py`
so it matches training. Mismatched preprocessing is the most common cause of bad predictions.

## Add knowledge for RAG
Put `.md` or `.txt` files in `knowledge/` (resume facts, project READMEs, blog posts).
`knowledge/profile.md` is pre-filled from your resume. Check it, then add more.

## Run locally
```bash
python3 -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                 # then edit values
export $(grep -v '^#' .env | xargs)                  # Windows: set the variables manually
python ingest.py                                     # builds the ChromaDB index
uvicorn main:app --reload --port 8000
```
Test: open http://localhost:8000/docs and try both endpoints.

To run the portfolio page against the local API, start the backend with the local UI origins allowed:
```bash
ALLOWED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080 uvicorn main:app --reload --port 8000
```
In a second terminal, from this directory, serve the page:
```bash
python -m http.server 8080
```
Open http://127.0.0.1:8080/prajwal-pixel-portfolio-selfhost.html or http://127.0.0.1:8080/site/. The page uses the local API automatically on localhost.

Live chat requires a valid `OPENROUTER_API_KEY` in `.env`; otherwise the page uses its built-in answers. Crop prediction requires `model/crop_model.keras` and `model/classes.json` as described above. Visitor counts show browsers that sent a heartbeat in the last 90 seconds. Appreciation is one toggleable heart per browser, identified by a random ID saved in that browser's local storage; no IP address is saved for these counters.

Never commit your `.env` or API key.

## Notes
- Built-in rate limit: 20 requests per IP per minute (edit `RATE_LIMIT` in `main.py`).
- Uploads are limited to 5 MB and must be images.
- After editing `knowledge/`, run `python ingest.py` again (Spaces re-runs it on rebuild).
- A Space's local disk is temporary unless persistent storage is attached; the viewer count tracks browsers active in the last 90 seconds.
- This repository currently has `model/classes.json.example` but no trained `model/crop_model.keras` or `model/classes.json`; add both files to enable crop prediction.
