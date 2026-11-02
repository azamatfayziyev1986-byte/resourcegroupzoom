import os
import sqlite3
import json
from datetime import datetime
from typing import Dict, List, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "zoom_database.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high performance and concurrency
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db():
    """Initializes all database tables if they do not exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Rooms Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            host_id TEXT,
            locked INTEGER DEFAULT 0,
            passcode TEXT,
            waiting_room INTEGER DEFAULT 0,
            mute_av_lock INTEGER DEFAULT 0,
            screen_lock INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Safely ensure new room columns exist if table was already created
    for col in [("passcode", "TEXT"), ("waiting_room", "INTEGER DEFAULT 0"), 
                ("mute_av_lock", "INTEGER DEFAULT 0"), ("screen_lock", "INTEGER DEFAULT 0")]:
        try:
            cursor.execute(f"ALTER TABLE rooms ADD COLUMN {col[0]} {col[1]};")
        except sqlite3.OperationalError:
            pass

    # Meeting Summaries Table (AI Protocol & Executive Action Items)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meeting_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            title TEXT,
            summary TEXT NOT NULL,
            decisions TEXT,
            action_items TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 2. Chat Messages Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            text TEXT NOT NULL,
            is_private INTEGER DEFAULT 0,
            target_id TEXT,
            timestamp TEXT,
            file_url TEXT,
            file_name TEXT,
            file_size TEXT,
            file_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_id);")

    # Safely ensure file columns exist if table was already created
    for col in [("file_url", "TEXT"), ("file_name", "TEXT"), ("file_size", "TEXT"), ("file_type", "TEXT")]:
        try:
            cursor.execute(f"ALTER TABLE chat_messages ADD COLUMN {col[0]} {col[1]};")
        except sqlite3.OperationalError:
            pass

    # 3. Whiteboard Strokes Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS whiteboard_strokes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            stroke_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_wb_room ON whiteboard_strokes(room_id);")

    # 4. Scheduled Meetings Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scheduled_meetings (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            duration TEXT NOT NULL,
            host_name TEXT DEFAULT 'Xayrulloyev Azizbek',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 5. Registered Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            role TEXT DEFAULT 'Participant',
            avatar_color TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 6. Meeting Attendance Logs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            peer_id TEXT NOT NULL,
            peer_name TEXT NOT NULL,
            action TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_att_room ON attendance_logs(room_id);")

    # 7. Meeting Ratings & Feedback Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meeting_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 8. Q&A Questions Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS qa_questions (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            author TEXT NOT NULL,
            question TEXT NOT NULL,
            is_anon INTEGER DEFAULT 0,
            upvotes INTEGER DEFAULT 0,
            is_answered INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    conn.commit()

    # Seed initial default scheduled meetings if table is empty
    cursor.execute("SELECT COUNT(*) as cnt FROM scheduled_meetings")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("""
            INSERT INTO scheduled_meetings (id, topic, date, time, duration, host_name)
            VALUES 
            ('590-429-468', 'Resource Group Boshqaruv Majlisi', 'Bugun', '15:00', '45 daqiqa', 'Xayrulloyev Azizbek'),
            ('842-193-774', 'IT Loyihalar Muhokamasi & Yangi Plan', 'Bugun', '18:00', '1 soat', 'Xayrulloyev Azizbek')
        """)
        conn.commit()

    # Seed owner user
    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE name = 'Xayrulloyev Azizbek'")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("""
            INSERT OR IGNORE INTO users (name, role, avatar_color)
            VALUES ('Xayrulloyev Azizbek', 'Host (Moderator)', 'from-blue-600 to-indigo-600')
        """)
        conn.commit()

    conn.close()
    print("[DB] SQLite database initialized successfully: zoom_database.db", flush=True)


# ==================== ROOM OPERATIONS ====================

def save_or_get_room(room_id: str, name: Optional[str] = None, host_id: Optional[str] = None, locked: int = 0,
                     passcode: Optional[str] = None, waiting_room: int = 0) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rooms WHERE id = ?", (room_id,))
    row = cursor.fetchone()
    if row:
        room_dict = dict(row)
        conn.close()
        return room_dict

    room_name = name or f"Meeting {room_id}"
    cursor.execute("""
        INSERT INTO rooms (id, name, host_id, locked, passcode, waiting_room)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (room_id, room_name, host_id, locked, passcode, waiting_room))
    conn.commit()
    cursor.execute("SELECT * FROM rooms WHERE id = ?", (room_id,))
    room_dict = dict(cursor.fetchone())
    conn.close()
    return room_dict


def update_room_security(room_id: str, **kwargs):
    conn = get_db_connection()
    cursor = conn.cursor()
    for key, val in kwargs.items():
        if key in ["locked", "passcode", "waiting_room", "mute_av_lock", "screen_lock", "host_id"]:
            cursor.execute(f"UPDATE rooms SET {key} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (val, room_id))
    conn.commit()
    conn.close()


def update_room_lock(room_id: str, locked: bool):
    update_room_security(room_id, locked=1 if locked else 0)


def save_meeting_rating(room_id: str, user_name: str, rating: int, comment: str = ""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO meeting_ratings (room_id, user_name, rating, comment)
        VALUES (?, ?, ?, ?)
    """, (room_id, user_name, rating, comment))
    conn.commit()
    conn.close()


def get_meeting_ratings(room_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM meeting_ratings WHERE room_id = ? ORDER BY created_at DESC", (room_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_qa_question(room_id: str, q_id: str, author: str, question: str, is_anon: bool = False):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO qa_questions (id, room_id, author, question, is_anon, upvotes, is_answered)
        VALUES (?, ?, ?, ?, ?, 0, 0)
    """, (q_id, room_id, author, question, 1 if is_anon else 0))
    conn.commit()
    conn.close()


def upvote_qa_question(q_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE qa_questions SET upvotes = upvotes + 1 WHERE id = ?", (q_id,))
    conn.commit()
    conn.close()


def get_qa_questions(room_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qa_questions WHERE room_id = ? ORDER BY upvotes DESC, created_at ASC", (room_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_room_host(room_id: str, host_id: Optional[str]):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE rooms SET host_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (host_id, room_id))
    conn.commit()
    conn.close()


# ==================== CHAT OPERATIONS ====================

def save_chat_message(room_id: str, msg_id: str, sender_id: str, sender_name: str, text: str, 
                      is_private: bool = False, target_id: Optional[str] = None, timestamp: str = "",
                      file_url: Optional[str] = None, file_name: Optional[str] = None, 
                      file_size: Optional[str] = None, file_type: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO chat_messages 
        (id, room_id, sender_id, sender_name, text, is_private, target_id, timestamp, file_url, file_name, file_size, file_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (msg_id, room_id, sender_id, sender_name, text, 1 if is_private else 0, target_id, timestamp, file_url, file_name, file_size, file_type))
    conn.commit()
    conn.close()


def get_chat_history(room_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    # Fetch public messages for this room
    cursor.execute("""
        SELECT id, sender_id, sender_name, text, is_private, target_id, timestamp, file_url, file_name, file_size, file_type
        FROM chat_messages
        WHERE room_id = ? AND is_private = 0
        ORDER BY id ASC
        LIMIT ?
    """, (room_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "sender_id": r["sender_id"],
            "sender_name": r["sender_name"],
            "text": r["text"],
            "is_private": bool(r["is_private"]),
            "target_id": r["target_id"],
            "timestamp": r["timestamp"],
            "file_url": r["file_url"],
            "file_name": r["file_name"],
            "file_size": r["file_size"],
            "file_type": r["file_type"]
        }
        for r in rows
    ]


# ==================== WHITEBOARD OPERATIONS ====================

def save_whiteboard_stroke(room_id: str, stroke: Dict[str, Any]):
    conn = get_db_connection()
    cursor = conn.cursor()
    stroke_json = json.dumps(stroke)
    cursor.execute("""
        INSERT INTO whiteboard_strokes (room_id, stroke_json)
        VALUES (?, ?)
    """, (room_id, stroke_json))
    conn.commit()
    conn.close()


def clear_whiteboard(room_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM whiteboard_strokes WHERE room_id = ?", (room_id,))
    conn.commit()
    conn.close()


def get_whiteboard_history(room_id: str, limit: int = 500) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT stroke_json FROM whiteboard_strokes
        WHERE room_id = ?
        ORDER BY id ASC
        LIMIT ?
    """, (room_id, limit))
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        try:
            result.append(json.loads(r["stroke_json"]))
        except Exception:
            pass
    return result


# ==================== SCHEDULED MEETINGS OPERATIONS ====================

def save_scheduled_meeting(meeting_id: str, topic: str, date: str, time: str, duration: str, host_name: str = "Xayrulloyev Azizbek"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO scheduled_meetings (id, topic, date, time, duration, host_name)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (meeting_id, topic, date, time, duration, host_name))
    conn.commit()
    conn.close()


def get_scheduled_meetings() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, topic, date, time, duration, host_name, created_at
        FROM scheduled_meetings
        ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_scheduled_meeting(meeting_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM scheduled_meetings WHERE id = ?", (meeting_id,))
    conn.commit()
    conn.close()


# ==================== USERS & ATTENDANCE ====================

def upsert_user(name: str, role: str = "Participant") -> Dict[str, Any]:
    if not name or name.strip() == "":
        name = "Mehmon"
    name = name.strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO users (name, role, last_seen)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(name) DO UPDATE SET
            role = excluded.role,
            last_seen = CURRENT_TIMESTAMP
    """, (name, role))
    conn.commit()
    cursor.execute("SELECT * FROM users WHERE name = ?", (name,))
    row = dict(cursor.fetchone())
    conn.close()
    return row


def get_all_users() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, role, last_seen, created_at FROM users ORDER BY last_seen DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def log_attendance(room_id: str, peer_id: str, peer_name: str, action: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO attendance_logs (room_id, peer_id, peer_name, action)
        VALUES (?, ?, ?, ?)
    """, (room_id, peer_id, peer_name, action))
    conn.commit()
    conn.close()


def get_attendance_report(room_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT peer_name, action, created_at
        FROM attendance_logs
        WHERE room_id = ?
        ORDER BY created_at ASC
    """, (room_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_attendance_summary(room_id: str) -> List[Dict[str, Any]]:
    """Calculates entry, exit and total participation time for each participant."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT peer_id, peer_name, action, created_at
        FROM attendance_logs
        WHERE room_id = ?
        ORDER BY id ASC
    """, (room_id,))
    logs = cursor.fetchall()
    conn.close()

    participants = {}
    for log in logs:
        p_name = log["peer_name"]
        action = log["action"]
        ts_str = log["created_at"]
        try:
            ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            ts = datetime.now()

        if p_name not in participants:
            participants[p_name] = {
                "name": p_name,
                "first_joined": ts_str,
                "last_active": ts_str,
                "status": "Faol",
                "sessions": [],
                "current_join": None,
                "total_seconds": 0
            }

        p = participants[p_name]
        p["last_active"] = ts_str
        if action == "joined":
            p["status"] = "Faol"
            p["current_join"] = ts
        elif action == "left":
            p["status"] = "Chiqib ketgan"
            if p["current_join"]:
                dur = int((ts - p["current_join"]).total_seconds())
                p["total_seconds"] += max(dur, 1)
                p["current_join"] = None

    room_start_ts = None
    if logs:
        try:
            room_start_ts = datetime.strptime(logs[0]["created_at"], "%Y-%m-%d %H:%M:%S")
        except Exception:
            pass

    # Handle participants still active
    now = datetime.now()
    summary = []
    for p_name, p in participants.items():
        if p["current_join"]:
            dur = int((now - p["current_join"]).total_seconds())
            p["total_seconds"] += max(dur, 1)

        total_sec = p["total_seconds"]
        minutes = total_sec // 60
        seconds = total_sec % 60
        duration_str = f"{minutes} daq {seconds} son" if minutes > 0 else f"{seconds} soniya"

        is_late = False
        if room_start_ts and p["first_joined"]:
            try:
                pj_ts = datetime.strptime(p["first_joined"], "%Y-%m-%d %H:%M:%S")
                if (pj_ts - room_start_ts).total_seconds() > 600: # 10 daqiqadan ko'p
                    is_late = True
            except Exception:
                pass

        summary.append({
            "name": p["name"],
            "first_joined": p["first_joined"],
            "last_active": p["last_active"],
            "status": p["status"],
            "is_late": is_late,
            "total_seconds": total_sec,
            "duration_str": duration_str
        })

    return summary


def generate_attendance_csv(room_id: str) -> str:
    """Generates UTF-8 BOM CSV text for Excel export."""
    summary = get_attendance_summary(room_id)
    # UTF-8 BOM so Excel opens Uzbek characters without corruption
    csv_lines = ["\ufeffIshtirokchi Ismi,Birinchi Kirgan Vaqti,Oxirgi Faolligi,Umumiy Qatnashgan Vaqti,Holati"]
    for row in summary:
        name = row["name"].replace(",", " ")
        first_joined = row["first_joined"]
        last_active = row["last_active"]
        dur = row["duration_str"].replace(",", " ")
        status = row["status"]
        csv_lines.append(f'"{name}","{first_joined}","{last_active}","{dur}","{status}"')
    
    return "\r\n".join(csv_lines)


def save_meeting_summary(room_id: str, title: str, summary: str, decisions: str = "", action_items: str = ""):
    """Saves AI meeting summary and protocol to database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO meeting_summaries (room_id, title, summary, decisions, action_items)
        VALUES (?, ?, ?, ?, ?);
    """, (room_id, title, summary, decisions, action_items))
    conn.commit()
    conn.close()


def get_meeting_summary(room_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves the latest AI meeting summary for a room."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM meeting_summaries WHERE room_id = ? ORDER BY id DESC LIMIT 1;
    """, (room_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


