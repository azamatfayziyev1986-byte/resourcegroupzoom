import os
import json
import uuid
import random
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, File, UploadFile, Response, Body
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database

# Initialize SQLite database on startup
database.init_db()

app = FastAPI(title="Resource Group - WebRTC Video Conferencing")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for active rooms
# rooms[room_id] = {
#     "id": str,
#     "name": str,
#     "host_id": str,
#     "locked": bool,
#     "peers": { peer_id: { "name": str, "is_host": bool, "audio": bool, "video": bool, "hand": bool, "screen": bool, "ws": WebSocket } },
#     "chat": list,
#     "whiteboard": list
# }
rooms: Dict[str, Dict[str, Any]] = {}

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
UPLOADS_DIR = os.path.join(STATIC_DIR, "uploads")
RECORDINGS_DIR = os.path.join(STATIC_DIR, "recordings")
os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(RECORDINGS_DIR, exist_ok=True)


def normalize_room_id(rid: str) -> str:
    if not rid:
        return ""
    return str(rid).replace("-", "").replace(" ", "").strip().lower()


class CreateRoomRequest(BaseModel):
    name: str = "Meeting"
    host_name: str = "Host"
    passcode: Optional[str] = None
    waiting_room: bool = False


class MeetingRatingRequest(BaseModel):
    user_name: str
    rating: int
    comment: str = ""


class ScheduleMeetingRequest(BaseModel):
    topic: str
    date: str
    time: str
    duration: str = "45 daqiqa"
    host_name: str = "Xayrulloyev Azizbek"


class RegisterUserRequest(BaseModel):
    name: str
    role: str = "Participant"


@app.post("/api/rooms/create")
async def create_room(req: CreateRoomRequest):
    # Generate 9-digit Zoom-style room ID: xxx-xxx-xxx
    part1 = f"{random.randint(100, 999)}"
    part2 = f"{random.randint(100, 999)}"
    part3 = f"{random.randint(100, 999)}"
    formatted_id = f"{part1}-{part2}-{part3}"
    norm_id = normalize_room_id(formatted_id)

    # Persist in SQLite
    database.save_or_get_room(norm_id, name=req.name, passcode=req.passcode, waiting_room=1 if req.waiting_room else 0)

    rooms[norm_id] = {
        "id": formatted_id,
        "norm_id": norm_id,
        "name": req.name,
        "host_id": None,
        "locked": False,
        "passcode": req.passcode,
        "waiting_room": req.waiting_room,
        "mute_av_lock": False,
        "screen_lock": False,
        "peers": {},
        "waiting_peers": {},
        "chat": [],
        "pinned_message": None,
        "whiteboard": [],
        "breakouts": []
    }
    return {
        "room_id": formatted_id, 
        "name": req.name,
        "passcode": req.passcode,
        "waiting_room": req.waiting_room
    }


@app.get("/api/rooms/{room_id}/info")
async def get_room_info(room_id: str):
    norm_id = normalize_room_id(room_id)
    db_room = database.save_or_get_room(norm_id)

    if norm_id not in rooms:
        # Load from SQLite
        rooms[norm_id] = {
            "id": room_id,
            "norm_id": norm_id,
            "name": db_room["name"] or f"Meeting {room_id}",
            "host_id": db_room["host_id"],
            "locked": bool(db_room["locked"]),
            "passcode": db_room.get("passcode"),
            "waiting_room": bool(db_room.get("waiting_room")),
            "mute_av_lock": False,
            "screen_lock": False,
            "peers": {},
            "waiting_peers": {},
            "chat": [],
            "pinned_message": None,
            "whiteboard": [],
            "breakouts": []
        }
    room = rooms[norm_id]
    return {
        "room_id": room_id,
        "name": room["name"],
        "locked": room["locked"],
        "has_passcode": bool(room.get("passcode")),
        "waiting_room": bool(room.get("waiting_room")),
        "participant_count": len(room["peers"])
    }


@app.post("/api/recordings")
async def api_upload_recording(file: UploadFile = File(...)):
    unique_name = f"rec_{str(uuid.uuid4())[:8]}_{file.filename or 'meeting.webm'}"
    file_path = os.path.join(RECORDINGS_DIR, unique_name)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    return {"status": "ok", "url": f"/recordings/{unique_name}", "name": unique_name}


@app.post("/api/meetings/{room_id}/rating")
async def api_save_rating(room_id: str, req: MeetingRatingRequest):
    norm_id = normalize_room_id(room_id)
    database.save_meeting_rating(norm_id, req.user_name, req.rating, req.comment)
    return {"status": "ok"}


@app.get("/api/meetings/{room_id}/ratings")
async def api_get_ratings(room_id: str):
    norm_id = normalize_room_id(room_id)
    ratings = database.get_meeting_ratings(norm_id)
    return {"room_id": norm_id, "ratings": ratings}


@app.get("/api/rooms/{room_id}/qa")
async def api_get_qa(room_id: str):
    norm_id = normalize_room_id(room_id)
    questions = database.get_qa_questions(norm_id)
    return {"room_id": norm_id, "questions": questions}


# ==================== SCHEDULED MEETINGS API ====================

@app.post("/api/meetings/schedule")
async def api_schedule_meeting(req: ScheduleMeetingRequest):
    part1 = f"{random.randint(100, 999)}"
    part2 = f"{random.randint(100, 999)}"
    part3 = f"{random.randint(100, 999)}"
    meeting_id = f"{part1}-{part2}-{part3}"
    norm_id = normalize_room_id(meeting_id)

    database.save_scheduled_meeting(meeting_id, req.topic, req.date, req.time, req.duration, req.host_name)
    database.save_or_get_room(norm_id, name=req.topic)
    return {
        "status": "ok",
        "meeting": {
            "id": meeting_id,
            "topic": req.topic,
            "date": req.date,
            "time": req.time,
            "duration": req.duration,
            "host_name": req.host_name
        }
    }


@app.get("/api/meetings/list")
async def api_list_scheduled_meetings():
    meetings = database.get_scheduled_meetings()
    return {"meetings": meetings}


@app.delete("/api/meetings/{meeting_id}")
async def api_delete_meeting(meeting_id: str):
    database.delete_scheduled_meeting(meeting_id)
    return {"status": "ok", "deleted": meeting_id}


# ==================== USERS & ATTENDANCE API ====================

@app.post("/api/users/register")
async def api_register_user(req: RegisterUserRequest):
    user = database.upsert_user(req.name, req.role)
    return {"status": "ok", "user": user}


@app.get("/api/users/list")
async def api_list_users():
    users = database.get_all_users()
    return {"users": users}


@app.get("/api/rooms/{room_id}/attendance")
async def api_room_attendance(room_id: str):
    norm_id = normalize_room_id(room_id)
    logs = database.get_attendance_report(norm_id)
    return {"room_id": norm_id, "attendance": logs}


@app.get("/api/rooms/{room_id}/attendance/summary")
async def api_room_attendance_summary(room_id: str):
    norm_id = normalize_room_id(room_id)
    summary = database.get_attendance_summary(norm_id)
    return {"room_id": norm_id, "summary": summary}


@app.get("/api/rooms/{room_id}/attendance/export")
async def api_room_attendance_export(room_id: str):
    norm_id = normalize_room_id(room_id)
    csv_text = database.generate_attendance_csv(norm_id)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=Resource_Group_Davomat_{norm_id}.csv"}
    )


@app.post("/api/rooms/{room_id}/summary")
async def save_summary_endpoint(room_id: str, payload: dict = Body(...)):
    norm_id = normalize_room_id(room_id)
    title = payload.get("title", f"Majlis {norm_id} Bayonnomasi")
    summary = payload.get("summary", "")
    decisions = payload.get("decisions", "")
    action_items = payload.get("action_items", "")
    database.save_meeting_summary(norm_id, title, summary, decisions, action_items)
    return {"status": "ok", "message": "AI Xulosasi saqlandi"}


@app.get("/api/rooms/{room_id}/summary")
async def get_summary_endpoint(room_id: str):
    norm_id = normalize_room_id(room_id)
    summary_data = database.get_meeting_summary(norm_id)
    return {"status": "ok", "summary": summary_data}



# ==================== FILE UPLOAD API ====================

@app.post("/api/upload")
async def api_upload_file(file: UploadFile = File(...)):
    orig_name = file.filename or "fayl"
    safe_name = os.path.basename(orig_name).replace(" ", "_")
    unique_prefix = str(uuid.uuid4())[:8]
    saved_filename = f"{unique_prefix}_{safe_name}"
    file_path = os.path.join(UPLOADS_DIR, saved_filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    file_size_bytes = len(content)
    if file_size_bytes < 1024 * 1024:
        size_str = f"{round(file_size_bytes / 1024, 1)} KB"
    else:
        size_str = f"{round(file_size_bytes / (1024 * 1024), 2)} MB"

    return {
        "status": "ok",
        "url": f"/uploads/{saved_filename}",
        "name": orig_name,
        "size": size_str,
        "type": file.content_type or "application/octet-stream"
    }


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    room_id = normalize_room_id(room_id)
    
    if room_id not in rooms:
        rooms[room_id] = {
            "id": room_id,
            "norm_id": room_id,
            "name": f"Meeting {room_id}",
            "host_id": None,
            "locked": False,
            "peers": {},
            "chat": [],
            "whiteboard": []
        }
    
    room = rooms[room_id]
    peer_id = str(uuid.uuid4())[:8]
    peer_name = "User"
    is_host = False

    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            action = data.get("action")

            if action == "join":
                peer_name = data.get("name", "Participant")
                audio = data.get("audio", True)
                video = data.get("video", True)
                entered_passcode = data.get("passcode")
                
                # Check if room is locked and not host
                if room.get("locked") and room.get("host_id") is not None:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "Uchrashuv qulflangan (Xonaga kirish to'xtatilgan)!"
                    }))
                    await websocket.close()
                    return

                # Check Passcode / PIN
                room_passcode = room.get("passcode")
                if room_passcode and room.get("host_id") is not None and entered_passcode != room_passcode:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "Noto'g'ri maxfiy parol! Iltimos qaytadan urinib ko'ring."
                    }))
                    await websocket.close()
                    return

                # Check Waiting Room (Guests wait for host approval)
                if room.get("waiting_room") and room.get("host_id") is not None:
                    room.setdefault("waiting_peers", {})[peer_id] = {
                        "id": peer_id,
                        "name": peer_name,
                        "audio": audio,
                        "video": video,
                        "ws": websocket
                    }
                    await websocket.send_text(json.dumps({
                        "type": "in-waiting-room",
                        "message": "Kutish zali: Iltimos, moderator sizni qabul qilishini kuting..."
                    }))
                    # Notify host
                    host_id = room["host_id"]
                    if host_id in room["peers"]:
                        try:
                            await room["peers"][host_id]["ws"].send_text(json.dumps({
                                "type": "peer-waiting",
                                "peer_id": peer_id,
                                "name": peer_name
                            }))
                        except Exception:
                            pass
                    continue

                # Register user in DB & log attendance
                database.upsert_user(peer_name)
                database.log_attendance(room_id, peer_id, peer_name, "joined")

                # First person is host
                if not room["peers"]:
                    is_host = True
                    room["host_id"] = peer_id
                
                # Store peer
                room["peers"][peer_id] = {
                    "id": peer_id,
                    "name": peer_name,
                    "is_host": is_host,
                    "audio": audio,
                    "video": video,
                    "hand": False,
                    "screen": False,
                    "ws": websocket
                }
                print(f"[WS] Peer JOINED: {peer_name} ({peer_id}) in room {room_id}. Host={is_host}. Total peers={len(room['peers'])}", flush=True)

                # Send welcome to the new peer with existing peers list and database histories
                existing_peers = [
                    {
                        "id": p["id"],
                        "name": p["name"],
                        "is_host": p["is_host"],
                        "audio": p["audio"],
                        "video": p["video"],
                        "hand": p["hand"],
                        "screen": p["screen"]
                    }
                    for p in room["peers"].values() if p["id"] != peer_id
                ]

                # Fetch persistent history from SQLite
                db_chat = database.get_chat_history(room_id, limit=50)
                db_wb = database.get_whiteboard_history(room_id, limit=200)

                await websocket.send_text(json.dumps({
                    "type": "welcome",
                    "peer_id": peer_id,
                    "is_host": is_host,
                    "room_id": room_id,
                    "existing_peers": existing_peers,
                    "chat_history": db_chat,
                    "whiteboard_history": db_wb,
                    "locked": room.get("locked", False),
                    "pinned_message": room.get("pinned_message"),
                    "mute_av_lock": room.get("mute_av_lock", False),
                    "screen_lock": room.get("screen_lock", False),
                    "waiting_room": room.get("waiting_room", False),
                    "watermark_enabled": room.get("watermark_enabled", False),
                    "active_quiz": room.get("active_quiz"),
                    "youtube_state": room.get("youtube_state"),
                    "breakouts": room.get("breakouts", [])
                }))

                # Notify existing peers that a new peer joined
                joined_event = json.dumps({
                    "type": "peer-joined",
                    "peer": {
                        "id": peer_id,
                        "name": peer_name,
                        "is_host": is_host,
                        "audio": audio,
                        "video": video,
                        "hand": False,
                        "screen": False
                    }
                })
                for pid, p in room["peers"].items():
                    if pid != peer_id:
                        try:
                            await p["ws"].send_text(joined_event)
                        except Exception:
                            pass

            elif action == "signal":
                # Relay WebRTC offer / answer / ICE candidate
                target_id = data.get("target")
                signal_payload = data.get("signal")
                if target_id in room["peers"]:
                    sig_type = signal_payload.get("type", "candidate") if isinstance(signal_payload, dict) else "unknown"
                    print(f"[WS] SIGNAL relay: {sig_type} from {peer_id} to {target_id}", flush=True)
                    target_ws = room["peers"][target_id]["ws"]
                    await target_ws.send_text(json.dumps({
                        "type": "signal",
                        "sender": peer_id,
                        "signal": signal_payload
                    }))

            elif action == "media-state":
                # Audio / video / screen state changes
                if peer_id in room["peers"]:
                    for key in ["audio", "video", "screen"]:
                        if key in data:
                            room["peers"][peer_id][key] = data[key]
                    
                    broadcast = json.dumps({
                        "type": "peer-media-state",
                        "peer_id": peer_id,
                        "audio": room["peers"][peer_id]["audio"],
                        "video": room["peers"][peer_id]["video"],
                        "screen": room["peers"][peer_id]["screen"]
                    })
                    for pid, p in room["peers"].items():
                        if pid != peer_id:
                            try:
                                await p["ws"].send_text(broadcast)
                            except Exception:
                                pass

            elif action == "raise-hand":
                if peer_id in room["peers"]:
                    state = data.get("hand", True)
                    room["peers"][peer_id]["hand"] = state
                    broadcast = json.dumps({
                        "type": "hand-state",
                        "peer_id": peer_id,
                        "hand": state,
                        "name": peer_name
                    })
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "chat":
                msg = {
                    "id": str(uuid.uuid4())[:8],
                    "sender_id": peer_id,
                    "sender_name": peer_name,
                    "text": data.get("text", ""),
                    "timestamp": data.get("timestamp", ""),
                    "is_private": data.get("is_private", False),
                    "target_id": data.get("target_id", None),
                    "file_url": data.get("file_url", None),
                    "file_name": data.get("file_name", None),
                    "file_size": data.get("file_size", None),
                    "file_type": data.get("file_type", None)
                }
                if not msg["is_private"]:
                    room["chat"].append(msg)
                    # Persist public chat to SQLite
                    database.save_chat_message(
                        room_id=room_id,
                        msg_id=msg["id"],
                        sender_id=peer_id,
                        sender_name=peer_name,
                        text=msg["text"],
                        is_private=False,
                        target_id=None,
                        timestamp=msg["timestamp"],
                        file_url=msg["file_url"],
                        file_name=msg["file_name"],
                        file_size=msg["file_size"],
                        file_type=msg["file_type"]
                    )
                    broadcast = json.dumps({"type": "chat-message", "message": msg})
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass
                else:
                    target_id = msg["target_id"]
                    direct_msg = json.dumps({"type": "chat-message", "message": msg})
                    # send to sender
                    await websocket.send_text(direct_msg)
                    # send to target
                    if target_id in room["peers"] and target_id != peer_id:
                        await room["peers"][target_id]["ws"].send_text(direct_msg)

            elif action == "caption":
                caption_text = data.get("text", "").strip()
                if caption_text:
                    broadcast = json.dumps({
                        "type": "peer-caption",
                        "peer_id": peer_id,
                        "name": peer_name,
                        "text": caption_text
                    })
                    for pid, p in room["peers"].items():
                        if pid != peer_id:
                            try:
                                await p["ws"].send_text(broadcast)
                            except Exception:
                                pass

            elif action == "ambient-music":
                track = data.get("track", "lofi")
                playing = data.get("playing", False)
                volume = data.get("volume", 50)
                room["ambient_music"] = {"track": track, "playing": playing, "volume": volume}
                broadcast = json.dumps({
                    "type": "ambient-music",
                    "peer_id": peer_id,
                    "name": peer_name,
                    "track": track,
                    "playing": playing,
                    "volume": volume
                })
                for pid, p in room["peers"].items():
                    if pid != peer_id:
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "reaction":
                emoji = data.get("emoji", "👍")
                broadcast = json.dumps({
                    "type": "reaction",
                    "peer_id": peer_id,
                    "name": peer_name,
                    "emoji": emoji
                })
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "whiteboard-draw":
                stroke = data.get("stroke")
                room["whiteboard"].append(stroke)
                # Persist whiteboard stroke to SQLite
                if stroke:
                    database.save_whiteboard_stroke(room_id, stroke)
                broadcast = json.dumps({
                    "type": "whiteboard-draw",
                    "stroke": stroke
                })
                for pid, p in room["peers"].items():
                    if pid != peer_id:
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "whiteboard-clear":
                room["whiteboard"] = []
                # Clear whiteboard strokes in SQLite
                database.clear_whiteboard(room_id)
                broadcast = json.dumps({"type": "whiteboard-clear"})
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "poll-create":
                poll_data = {
                    "id": str(uuid.uuid4())[:8],
                    "creator": peer_name,
                    "question": data.get("question", "Savol"),
                    "options": [{"text": opt, "votes": 0} for opt in data.get("options", ["Ha", "Yo'q"])],
                    "voters": []
                }
                room["active_poll"] = poll_data
                broadcast = json.dumps({"type": "poll-started", "poll": poll_data})
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "poll-vote":
                if "active_poll" in room and room["active_poll"]:
                    poll = room["active_poll"]
                    opt_index = data.get("option_index")
                    if peer_id not in poll["voters"] and 0 <= opt_index < len(poll["options"]):
                        poll["options"][opt_index]["votes"] += 1
                        poll["voters"].append(peer_id)
                        broadcast = json.dumps({"type": "poll-updated", "poll": poll})
                        for pid, p in room["peers"].items():
                            try:
                                await p["ws"].send_text(broadcast)
                            except Exception:
                                pass

            elif action == "mute-all":
                # Only host can mute all
                if is_host:
                    broadcast = json.dumps({"type": "force-mute"})
                    for pid, p in room["peers"].items():
                        if pid != peer_id:
                            p["audio"] = False
                            try:
                                await p["ws"].send_text(broadcast)
                            except Exception:
                                pass

            elif action == "lock-room":
                if is_host:
                    locked = data.get("locked", True)
                    room["locked"] = locked
                    database.update_room_lock(room_id, locked)
                    broadcast = json.dumps({"type": "room-locked-state", "locked": locked})
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "admit-peer":
                target_key = data.get("peer_id") or data.get("peerId")
                if is_host and "waiting_peers" in room and target_key in room["waiting_peers"]:
                    w_peer = room["waiting_peers"].pop(target_key)
                    target_pid = w_peer["id"]
                    target_pname = w_peer["name"]
                    target_ws = w_peer["ws"]
                    room["peers"][target_pid] = {
                        "id": target_pid,
                        "name": target_pname,
                        "is_host": False,
                        "audio": w_peer["audio"],
                        "video": w_peer["video"],
                        "hand": False,
                        "screen": False,
                        "ws": target_ws
                    }
                    database.upsert_user(target_pname)
                    database.log_attendance(room_id, target_pid, target_pname, "joined")

                    existing_peers = [
                        {"id": p["id"], "name": p["name"], "is_host": p["is_host"], "audio": p["audio"], "video": p["video"], "hand": p["hand"], "screen": p["screen"]}
                        for p in room["peers"].values() if p["id"] != target_pid
                    ]
                    db_chat = database.get_chat_history(room_id, limit=50)
                    db_wb = database.get_whiteboard_history(room_id, limit=200)

                    await target_ws.send_text(json.dumps({
                        "type": "welcome",
                        "peer_id": target_pid,
                        "is_host": False,
                        "room_id": room_id,
                        "existing_peers": existing_peers,
                        "chat_history": db_chat,
                        "whiteboard_history": db_wb,
                        "locked": room.get("locked", False),
                        "pinned_message": room.get("pinned_message"),
                        "mute_av_lock": room.get("mute_av_lock", False),
                        "screen_lock": room.get("screen_lock", False)
                    }))

                    # Tell the guest they are admitted
                    await target_ws.send_text(json.dumps({"type": "admitted"}))

                    joined_event = json.dumps({
                        "type": "peer-joined",
                        "peer": {"id": target_pid, "name": target_pname, "is_host": False, "audio": w_peer["audio"], "video": w_peer["video"], "hand": False, "screen": False}
                    })
                    for pid, p in room["peers"].items():
                        if pid != target_pid:
                            try:
                                await p["ws"].send_text(joined_event)
                            except Exception:
                                pass

            elif action == "deny-peer":
                target_key = data.get("peer_id") or data.get("peerId")
                if is_host and "waiting_peers" in room and target_key in room["waiting_peers"]:
                    w_peer = room["waiting_peers"].pop(target_key)
                    try:
                        await w_peer["ws"].send_text(json.dumps({
                            "type": "denied",
                            "message": "Moderator sizni uchrashuvga qabul qilmadi."
                        }))
                        await w_peer["ws"].close()
                    except Exception:
                        pass

            elif action == "lock-av-permissions":
                if is_host:
                    lock_state = data.get("locked") if "locked" in data else data.get("lock", True)
                    room["mute_av_lock"] = lock_state
                    database.update_room_security(room_id, mute_av_lock=1 if lock_state else 0)
                    broadcast = json.dumps({"type": "permissions-updated", "mute_av_lock": lock_state})
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "lock-screen-permission":
                if is_host:
                    lock_state = data.get("locked") if "locked" in data else data.get("lock", True)
                    room["screen_lock"] = lock_state
                    database.update_room_security(room_id, screen_lock=1 if lock_state else 0)
                    broadcast = json.dumps({"type": "permissions-updated", "screen_lock": lock_state})
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "set-room-passcode":
                if is_host:
                    pcode = data.get("passcode")
                    room["passcode"] = pcode
                    database.update_room_security(room_id, passcode=pcode)

            elif action == "toggle-waiting-room":
                if is_host:
                    wr_state = data.get("enabled", True)
                    room["waiting_room"] = wr_state
                    database.update_room_security(room_id, waiting_room=1 if wr_state else 0)

            elif action == "whiteboard-template":
                broadcast = json.dumps({"type": "whiteboard-template", "template": data.get("template")})
                for pid, p in room["peers"].items():
                    if pid != peer_id:
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "timeout-peer":
                if is_host:
                    target_id = data.get("target_id")
                    dur = data.get("duration", 300)
                    if target_id in room["peers"]:
                        target_name = room["peers"][target_id]["name"]
                        broadcast = json.dumps({"type": "peer-timed-out", "peer_id": target_id, "name": target_name, "duration": dur})
                        for pid, p in room["peers"].items():
                            try:
                                await p["ws"].send_text(broadcast)
                            except Exception:
                                pass

            elif action == "chat-pin":
                pin_data = {
                    "msg_id": data.get("msg_id"),
                    "text": data.get("text"),
                    "sender": data.get("sender")
                }
                room["pinned_message"] = pin_data
                broadcast = json.dumps({"type": "chat-pinned", "pin": pin_data, "text": pin_data["text"], "sender": pin_data["sender"]})
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "chat-unpin":
                room["pinned_message"] = None
                broadcast = json.dumps({"type": "chat-unpinned"})
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "chat-reaction":
                broadcast = json.dumps({
                    "type": "chat-message-reaction",
                    "msg_id": data.get("msg_id"),
                    "emoji": data.get("emoji"),
                    "peer_name": peer_name
                })
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "qa-ask":
                q_id = str(uuid.uuid4())[:8]
                is_anon = data.get("is_anon", False)
                q_text = data.get("question", "")
                author = "Anonim" if is_anon else peer_name
                database.add_qa_question(room_id, q_id, author, q_text, is_anon)
                broadcast = json.dumps({
                    "type": "qa-new-question",
                    "question": {
                        "id": q_id,
                        "author": author,
                        "question": q_text,
                        "upvotes": 0,
                        "is_answered": 0,
                        "created_at": datetime.datetime.now().isoformat()
                    }
                })
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "qa-upvote":
                q_id = data.get("id") or data.get("q_id")
                database.upvote_qa_question(q_id)
                broadcast = json.dumps({"type": "qa-question-upvoted", "id": q_id, "upvotes": 1})
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "breakout-create":
                if is_host:
                    count = data.get("count", 2)
                    rooms_list = [f"{i+1}-Guruh" for i in range(count)]
                    room["breakouts"] = rooms_list
                    broadcast = json.dumps({"type": "breakout-assigned", "room_name": "1-Guruh"})
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "breakout-end":
                if is_host:
                    room["breakouts"] = []
                    broadcast = json.dumps({"type": "breakout-ended"})
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "youtube-sync":
                room["youtube_state"] = data.get("state")
                broadcast = json.dumps({
                    "type": "youtube-sync",
                    "state": data.get("state"),
                    "by": peer_name
                })
                for pid, p in room["peers"].items():
                    if pid != peer_id:
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "quiz-create":
                quiz_data = data.get("quiz")
                room["active_quiz"] = quiz_data
                room["quiz_answers"] = {}
                broadcast = json.dumps({
                    "type": "quiz-started",
                    "quiz": quiz_data,
                    "by": peer_name
                })
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "quiz-answer":
                quiz_answers = room.setdefault("quiz_answers", {})
                answer_index = data.get("answer")
                time_taken = data.get("time_taken", 10)
                quiz_answers[peer_id] = {
                    "peer_id": peer_id,
                    "name": peer_name,
                    "answer": answer_index,
                    "time_taken": time_taken
                }
                host_id = room.get("host_id")
                if host_id in room["peers"]:
                    try:
                        await room["peers"][host_id]["ws"].send_text(json.dumps({
                            "type": "quiz-progress",
                            "total_answers": len(quiz_answers),
                            "total_peers": len(room["peers"])
                        }))
                    except Exception:
                        pass

            elif action == "quiz-end":
                quiz_data = room.get("active_quiz", {})
                answers = room.get("quiz_answers", {})
                correct_idx = quiz_data.get("correct", 0)
                leaderboard = []
                for pid, ans in answers.items():
                    is_correct = (ans["answer"] == correct_idx)
                    score = max(100, int(1000 - (ans["time_taken"] * 50))) if is_correct else 0
                    leaderboard.append({
                        "name": ans["name"],
                        "score": score,
                        "is_correct": is_correct
                    })
                leaderboard.sort(key=lambda x: x["score"], reverse=True)
                broadcast = json.dumps({
                    "type": "quiz-ended",
                    "correct": correct_idx,
                    "leaderboard": leaderboard
                })
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "speaker-timer":
                timer_data = data.get("timer", {})
                broadcast = json.dumps({
                    "type": "speaker-timer",
                    "timer": timer_data,
                    "by": peer_name
                })
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "sound-effect":
                sound = data.get("sound")
                broadcast = json.dumps({
                    "type": "sound-effect",
                    "sound": sound,
                    "by": peer_name
                })
                for pid, p in room["peers"].items():
                    try:
                        await p["ws"].send_text(broadcast)
                    except Exception:
                        pass

            elif action == "focus-status":
                focus_state = data.get("status", "active")
                host_id = room.get("host_id")
                if host_id in room["peers"]:
                    try:
                        await room["peers"][host_id]["ws"].send_text(json.dumps({
                            "type": "focus-status",
                            "peer_id": peer_id,
                            "name": peer_name,
                            "status": focus_state
                        }))
                    except Exception:
                        pass

            elif action == "watermark-toggle":
                if is_host:
                    room["watermark_enabled"] = data.get("enabled", False)
                    broadcast = json.dumps({
                        "type": "watermark-toggle",
                        "enabled": room["watermark_enabled"]
                    })
                    for pid, p in room["peers"].items():
                        try:
                            await p["ws"].send_text(broadcast)
                        except Exception:
                            pass

            elif action == "kick":
                if is_host:
                    target_id = data.get("target_id")
                    if target_id in room["peers"]:
                        target_p = room["peers"][target_id]
                        await target_p["ws"].send_text(json.dumps({
                            "type": "kicked",
                            "message": "Moderator sizni uchrashuvdan chetlatdi."
                        }))
                        await target_p["ws"].close()

            elif action == "end-meeting-all":
                if is_host:
                    broadcast = json.dumps({
                        "type": "meeting-ended",
                        "by": peer_name,
                        "message": "Moderator uchrashuvni barcha uchun yakunladi."
                    })
                    for pid, p in list(room["peers"].items()):
                        try:
                            await p["ws"].send_text(broadcast)
                            await p["ws"].close()
                        except Exception:
                            pass
                    room["peers"] = {}
                    if room_id in rooms:
                        del rooms[room_id]
                    return

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Error in ws connection: {e}")
    finally:
        # Log attendance in SQLite
        database.log_attendance(room_id, peer_id, peer_name, "left")

        # Remove peer
        if room_id in rooms and peer_id in rooms[room_id]["peers"]:
            del rooms[room_id]["peers"][peer_id]
            print(f"[WS] Peer LEFT: {peer_name} ({peer_id}) from room {room_id}. Remaining peers={len(rooms[room_id]['peers'])}", flush=True)
            left_event = json.dumps({
                "type": "peer-left",
                "peer_id": peer_id,
                "name": peer_name
            })
            for pid, p in rooms[room_id]["peers"].items():
                try:
                    await p["ws"].send_text(left_event)
                except Exception:
                    pass
            
            # If host left, assign new host if any peers remain
            if is_host and rooms[room_id]["peers"]:
                new_host_id = next(iter(rooms[room_id]["peers"]))
                rooms[room_id]["host_id"] = new_host_id
                rooms[room_id]["peers"][new_host_id]["is_host"] = True
                new_host_event = json.dumps({
                    "type": "new-host",
                    "host_id": new_host_id
                })
                for pid, p in rooms[room_id]["peers"].items():
                    try:
                        await p["ws"].send_text(new_host_event)
                    except Exception:
                        pass
            elif not rooms[room_id]["peers"]:
                rooms[room_id]["host_id"] = None


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    no_cache_headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    # Check if file exists in static
    static_file = os.path.join(STATIC_DIR, full_path)
    if full_path and os.path.isfile(static_file):
        return FileResponse(static_file, headers=no_cache_headers)
    # Default to index.html for SPA routing
    return FileResponse(os.path.join(STATIC_DIR, "index.html"), headers=no_cache_headers)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
