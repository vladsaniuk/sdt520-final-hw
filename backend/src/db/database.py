import sqlite3
import time
import uuid
from pathlib import Path
from typing import List, Optional
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

DB_PATH = Path("/app/data/advisor.db")


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _get_conn()
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                state TEXT DEFAULT 'gathering',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)")
    conn.close()


def ensure_conversation(conv_id: str) -> None:
    conn = _get_conn()
    now = int(time.time() * 1000)
    with conn:
        conn.execute(
            "INSERT OR IGNORE INTO conversations (id, state, created_at, updated_at) VALUES (?, 'gathering', ?, ?)",
            (conv_id, now, now),
        )
    conn.close()


def save_message(conv_id: str, role: str, content: str) -> None:
    """Persist a message (role: 'human' | 'ai' | 'system') and update conversation timestamp."""
    ensure_conversation(conv_id)
    now = int(time.time() * 1000)
    conn = _get_conn()
    with conn:
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (conv_id, role, content, now),
        )
        conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conv_id),
        )
    conn.close()


def get_history(conv_id: str) -> List[BaseMessage]:
    """Return conversation history as LangChain BaseMessages."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC",
        (conv_id,),
    ).fetchall()
    conn.close()

    result: List[BaseMessage] = []
    for row in rows:
        role, content = row["role"], row["content"]
        if role == "human":
            result.append(HumanMessage(content=content))
        elif role == "ai":
            result.append(AIMessage(content=content))
        elif role == "system":
            result.append(SystemMessage(content=content))
    return result


def set_state(conv_id: str, state: str) -> None:
    ensure_conversation(conv_id)
    now = int(time.time() * 1000)
    conn = _get_conn()
    with conn:
        conn.execute(
            "UPDATE conversations SET state = ?, updated_at = ? WHERE id = ?",
            (state, now, conv_id),
        )
    conn.close()


def get_state(conv_id: str) -> str:
    ensure_conversation(conv_id)
    conn = _get_conn()
    row = conn.execute(
        "SELECT state FROM conversations WHERE id = ?",
        (conv_id,),
    ).fetchone()
    conn.close()
    return row["state"] if row else "gathering"


def clear_conversation(conv_id: str) -> None:
    conn = _get_conn()
    with conn:
        conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
        conn.execute(
            "UPDATE conversations SET state = 'gathering', updated_at = ? WHERE id = ?",
            (int(time.time() * 1000), conv_id),
        )
    conn.close()


def list_conversations() -> List[dict]:
    """Return all conversations with id, state, title (first human message), updated_at."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, state, updated_at FROM conversations ORDER BY updated_at DESC"
    ).fetchall()

    result = []
    for row in rows:
        conv_id = row["id"]
        first_msg = conn.execute(
            "SELECT content FROM messages WHERE conversation_id = ? AND role = 'human' ORDER BY id ASC LIMIT 1",
            (conv_id,),
        ).fetchone()
        title = (first_msg["content"][:60] if first_msg else "New conversation")
        result.append({
            "id": conv_id,
            "state": row["state"],
            "title": title,
            "updated_at": row["updated_at"],
        })
    conn.close()
    return result
