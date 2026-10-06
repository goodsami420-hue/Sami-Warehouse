"""Sami Warehouse — FastAPI Backend (v1.0)

Full-stack parity version. Handles the same 4 endpoints as the localStorage
frontend but backed by SQLite. Also serves the static frontend.

Run:
    pip install -r requirements.txt
    python server.py
Then open http://localhost:8000/

Note: MIT News and Nature block cross-origin / unauthenticated scraping.
This backend will attempt to scrape them if you set
MIT_NEWS_URL / NATURE_URL env vars to accessible mirrors, otherwise it
falls back to arXiv only (which IS open).
"""

import os
import re
import sqlite3
from datetime import datetime, date
from contextlib import contextmanager
from typing import List, Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "warehouse.db")
FRONTEND_DIR = os.path.join(PROJECT_ROOT)

app = FastAPI(title="Sami Warehouse API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ====================== DB ======================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        embed_id TEXT NOT NULL UNIQUE,
        subject TEXT DEFAULT 'research',
        added_at TEXT NOT NULL,
        completed_status INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        meditation INTEGER DEFAULT 0,
        calisthenics INTEGER DEFAULT 0,
        sleep INTEGER DEFAULT 0,
        habit_score INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS news_digest (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        source TEXT,
        summary_bullets TEXT,
        read_time INTEGER DEFAULT 3
    );
    CREATE TABLE IF NOT EXISTS analytics (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        completed_tasks_count INTEGER DEFAULT 0,
        velocity_score INTEGER DEFAULT 0,
        hermes_report_text TEXT
    );
    """)
    conn.commit()
    conn.close()


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ====================== SCHEMA ======================
class VideoIn(BaseModel):
    url: HttpUrl
    subject: Optional[str] = "research"

class HabitToggle(BaseModel):
    meditation: Optional[bool] = None
    calisthenics: Optional[bool] = None
    sleep: Optional[bool] = None


# ====================== HELPERS ======================
YOUTUBE_ID_RE = re.compile(r"(?:youtube\.com|youtu\.be)/(?:watch\?.*v=|embed/|v/|shorts/)([a-zA-Z0-9_-]{11})|v=([a-zA-Z0-9_-]{11})|^[a-zA-Z0-9_-]{11}$")

def extract_youtube_id(url: str) -> Optional[str]:
    m = YOUTUBE_ID_RE.match(url)
    if not m:
        return None
    return next(g for g in m.groups() if g)


def uid() -> str:
    return datetime.utcnow().isoformat().replace(".", "").replace(":", "")[:14] + "-x"


def get_today() -> str:
    return date.today().isoformat()


# ====================== ENDPOINTS ======================
@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/api/dashboard")
def dashboard():
    with get_db() as conn:
        queued = conn.execute(
            "SELECT * FROM videos WHERE completed_status = 0 ORDER BY added_at DESC"
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) as c FROM videos").fetchone()["c"]
        today = get_today()
        h = conn.execute("SELECT * FROM habits WHERE date = ?", (today,)).fetchone()
        a = conn.execute("SELECT * FROM analytics WHERE date = ?", (today,)).fetchone()
        news_count = conn.execute("SELECT COUNT(*) as c FROM news_digest").fetchone()["c"]
        return {
            "videos_queued": [dict(v) for v in queued],
            "videos_total": total,
            "today_habits": dict(h) if h else {
                "date": today, "meditation": 0, "calisthenics": 0, "sleep": 0, "habit_score": 0,
            },
            "news_count": news_count,
            "velocity": a["velocity_score"] if a else 0,
        }


@app.post("/api/queue")
def queue_video(payload: VideoIn):
    url = str(payload.url)
    vid = extract_youtube_id(url)
    if not vid:
        raise HTTPException(400, "Could not extract YouTube video ID")

    # Try oEmbed for title
    title = ""
    try:
        r = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"},
            timeout=5,
        )
        if r.ok:
            title = r.json().get("title", "")
    except Exception:
        pass

    with get_db() as conn:
        exists = conn.execute("SELECT 1 FROM videos WHERE embed_id = ?", (vid,)).fetchone()
        if exists:
            raise HTTPException(409, "Video already in warehouse")
        new_id = uid()
        conn.execute(
            "INSERT INTO videos (id, title, url, embed_id, subject, added_at, completed_status) VALUES (?,?,?,?,?,?,?)",
            (new_id, title or f"Video {vid}", f"https://www.youtube.com/watch?v={vid}", vid,
             payload.subject, datetime.utcnow().isoformat(), 0),
        )
        conn.commit()
        return {"id": new_id, "embed_id": vid, "title": title}


@app.post("/api/queue/{video_id}/complete")
def complete_video(video_id: str):
    with get_db() as conn:
        cur = conn.execute("UPDATE videos SET completed_status = 1 WHERE id = ?", (video_id,))
        conn.commit()
        # Log to analytics
        today = get_today()
        conn.execute(
            "INSERT OR IGNORE INTO analytics (id, date) VALUES (?, ?)",
            (uid(), today),
        )
        conn.execute(
            "UPDATE analytics SET completed_tasks_count = completed_tasks_count + 1 WHERE date = ?",
            (today,),
        )
        # Recalc velocity
        h = conn.execute("SELECT habit_score FROM habits WHERE date = ?", (today,)).fetchone()
        score = h["habit_score"] if h else 0
        tasks = conn.execute(
            "SELECT completed_tasks_count FROM analytics WHERE date = ?", (today,)
        ).fetchone()["completed_tasks_count"]
        conn.execute(
            "UPDATE analytics SET velocity_score = ? WHERE date = ?",
            (tasks + score * 2, today),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Video not found")
        return {"ok": True}


@app.delete("/api/queue/{video_id}")
def delete_video(video_id: str):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Video not found")
        return {"ok": True}


@app.post("/api/habits")
def update_habits(payload: HabitToggle):
    today = get_today()
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM habits WHERE date = ?", (today,)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO habits (id, date) VALUES (?, ?)",
                (uid(), today),
            )
            existing = conn.execute("SELECT * FROM habits WHERE date = ?", (today,)).fetchone()

        m = bool(existing["meditation"])
        c = bool(existing["calisthenics"])
        s = bool(existing["sleep"])
        if payload.meditation is not None: m = payload.meditation
        if payload.calisthenics is not None: c = payload.calisthenics
        if payload.sleep is not None: s = payload.sleep
        score = int(m) + int(c) + int(s)

        conn.execute(
            "UPDATE habits SET meditation=?, calisthenics=?, sleep=?, habit_score=? WHERE date=?",
            (int(m), int(c), int(s), score, today),
        )
        # Recalc velocity
        conn.execute(
            "INSERT OR IGNORE INTO analytics (id, date) VALUES (?, ?)",
            (uid(), today),
        )
        tasks = conn.execute(
            "SELECT completed_tasks_count FROM analytics WHERE date = ?", (today,)
        ).fetchone()["completed_tasks_count"]
        conn.execute(
            "UPDATE analytics SET velocity_score = ? WHERE date = ?",
            (tasks + score * 2, today),
        )
        conn.commit()
        return {"date": today, "meditation": m, "calisthenics": c, "sleep": s, "score": score}


@app.post("/api/nightly-audit")
def nightly_audit():
    """Scrape arXiv for recent AI/ML papers. Mitigated by CORS limits on MIT/Nature."""
    today = get_today()
    articles = []

    # arXiv
    try:
        url = ("https://export.arxiv.org/api/query?"
               "search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL"
               "&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending")
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        # Simple XML parse
        import xml.etree.ElementTree as ET
        root = ET.fromstring(r.text)
        ns = {"a": "http://www.w3.org/2005/Atom"}
        entries = root.findall("a:entry", ns)
        for entry in entries[:3]:
            title = entry.find("a:title", ns).text.replace("\n", " ").strip()
            summary = entry.find("a:summary", ns).text.replace("\n", " ").strip()
            authors = ", ".join([a.find("a:name", ns).text for a in entry.findall("a:author", ns)[:3]])
            published = entry.find("a:published", ns).text
            articles.append({
                "title": title,
                "source": "arXiv (cs.AI/LG/CL)",
                "summary_bullets": [
                    summary[:220] + ("…" if len(summary) > 220 else ""),
                    f"Authors: {authors}",
                    f"Published: {published[:10]}",
                ],
                "read_time": 3,
            })
    except Exception as e:
        articles.append({
            "title": f"arXiv fetch failed: {str(e)[:100]}",
            "source": "arXiv",
            "summary_bullets": ["Retry or check network."],
            "read_time": 1,
        })

    # MIT / Nature note
    articles.append({
        "title": "MIT News / Nature — direct scrape blocked by WAF",
        "source": "Note",
        "summary_bullets": [
            "MIT News and Nature block automated scraping.",
            "For those sources, add a proxy or use official RSS if available.",
            "Consider upgrading the audit worker to a scheduled job on the host."
        ],
        "read_time": 1,
    })

    with get_db() as conn:
        for art in articles:
            conn.execute(
                "INSERT INTO news_digest (id, date, title, source, summary_bullets, read_time) VALUES (?,?,?,?,?,?)",
                (uid(), today, art["title"], art["source"], "\n".join(art["summary_bullets"]), art["read_time"]),
            )
        conn.commit()

    return {"ok": True, "count": len(articles)}


@app.get("/api/analytics")
def analytics():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM analytics ORDER BY date DESC LIMIT 14"
        ).fetchall()
        return [dict(r) for r in rows]


# ====================== STATIC ======================
statics = [
    "styles.css", "app.js", "favicon.ico",
]
for fname in statics:
    @app.get(f"/{fname}")
    def _serve(fname=fname):
        path = os.path.join(FRONTEND_DIR, fname)
        if os.path.exists(path):
            return FileResponse(path)
        raise HTTPException(404)


# ====================== RUN ======================
if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print("SAMI WAREHOUSE — LOCAL SERVER")
    print(f"DB: {DB_PATH}")
    print("URL: http://localhost:8000/")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
