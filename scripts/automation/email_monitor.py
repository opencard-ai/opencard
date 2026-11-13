#!/usr/bin/env python3
"""OpenCard Email Monitor (portable) - READ-ONLY AgentMail inbox check.

Ported from the Mac-only untracked scripts/email_monitor.py (136 lines) with the same
semantics: GET the latest 5 messages, compare ids with last_seen_ids, always overwrite
state with the current top-5 ids, print NO_NEW or NEW_MESSAGE + Chinese summary.
It never sends, replies, marks read, labels or deletes (only HTTP GET is issued).

Portable config (no hardcoded inbox, key or paths):
  AGENTMAIL_INBOX_ID           required inbox id (e.g. the agentmail.to address)
  AGENTMAIL_API_KEY_FILE       path to a file holding the key (preferred), or
  AGENTMAIL_API_KEY            key in env
  OPENCARD_EMAIL_STATE_PATH    state json (default: data/opencard-email-state.json under cwd)
NOT live-verified from any cloud runner.
"""
import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

API_BASE = "https://api.agentmail.to"
LIMIT = 5


def state_path():
    return os.environ.get("OPENCARD_EMAIL_STATE_PATH") or os.path.join(os.getcwd(), "data", "opencard-email-state.json")


def load_key():
    path = os.environ.get("AGENTMAIL_API_KEY_FILE")
    if path:
        with open(path) as f:
            return f.read().strip()
    key = os.environ.get("AGENTMAIL_API_KEY", "").strip()
    if not key:
        raise RuntimeError("missing AGENTMAIL_API_KEY_FILE or AGENTMAIL_API_KEY")
    return key


def api_url():
    inbox = os.environ.get("AGENTMAIL_INBOX_ID", "").strip()
    if not inbox:
        raise RuntimeError("missing AGENTMAIL_INBOX_ID")
    return f"{API_BASE}/inboxes/{urllib.parse.quote(inbox, safe='@.')}/messages?limit={LIMIT}"


def load_state(path):
    if os.path.exists(path):
        try:
            with open(path) as f:
                st = json.load(f)
            if isinstance(st, dict) and isinstance(st.get("last_seen_ids", []), list):
                return st
            return {"last_seen_ids": []}
        except Exception:
            return {"last_seen_ids": []}
    return {"last_seen_ids": []}


def save_state(path, state):
    d = os.path.dirname(path) or "."
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".email-state-")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    # Never follow redirects: urllib would forward the bearer token to another origin.
    def redirect_request(self, *a, **k):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch_messages(key, urlopen=_OPENER.open):
    req = urllib.request.Request(api_url(), headers={"Authorization": f"Bearer {key}"}, method="GET")
    with urlopen(req, timeout=30) as resp:
        return json.load(resp)


def sender_to_str(sender):
    if isinstance(sender, list):
        parts = []
        for s in sender:
            if isinstance(s, dict):
                name = s.get("name") or ""
                email = s.get("email") or s.get("address") or ""
                parts.append(f"{name} <{email}>".strip())
            else:
                parts.append(str(s))
        return ", ".join(parts)
    if isinstance(sender, dict):
        name = sender.get("name") or ""
        email = sender.get("email") or sender.get("address") or ""
        return f"{name} <{email}>".strip()
    return str(sender) if sender else ""


def suggestion(msg):
    subject = (msg.get("subject") or "").lower()
    body = ""
    for key in ("text", "html", "body", "preview"):
        val = msg.get(key)
        if val:
            body = str(val).lower()
            break
    combined = f"{subject} {body}"
    if "vercel" in combined and ("fail" in combined or "error" in combined or "build err" in combined):
        return "Vercel 部署失敗。建議檢查最近 commit、查看 Vercel 部署 log、考慮 git revert。"
    if "vercel" in combined and ("success" in combined or "deploy" in combined or "ready" in combined or "promoted" in combined):
        return "Vercel 部署成功。建議驗證 opencardai.com 關鍵頁面是否正常載入。"
    if ("api" in combined or "exception" in combined or "500" in combined or "stack" in combined) and ("error" in combined or "fail" in combined or "crash" in combined):
        return "系統錯誤（API 例外）。建議檢查 service logs、確認 error rate、考慮重啟服務。"
    if any(k in combined for k in ("subscription", "subscribed", "plan changed", "unsubscribed", "billing")):
        return "用戶訂閱變動。建議檢查 My Cards 頁面、驗證 Upstash Redis 訂閱資料同步。"
    if any(k in combined for k in ("welcome", "sign up", "signup", "registered", "registration", "new user")):
        return "新用戶註冊。建議確認資料是否同步到資料庫（Postgres / Upstash）。"
    return "其他郵件。請依主旨與內容決定後續行動。"


def msg_id(m):
    # AgentMail list API returns `message_id` (not `id`).
    return m.get("message_id") or m.get("id")


def run(urlopen=_OPENER.open, out=sys.stdout, err=sys.stderr):
    try:
        key = load_key()
        api_url()
    except Exception as e:
        err.write(f"Config error: {e}\n")
        return 2
    path = state_path()
    state = load_state(path)
    last_seen = set(state.get("last_seen_ids", []) or [])
    try:
        data = fetch_messages(key, urlopen)
    except urllib.error.HTTPError as e:
        err.write(f"HTTPError {e.code}\n")
        return 2
    except Exception as e:
        err.write(f"Fetch error: {type(e).__name__}\n")
        return 2

    messages = data.get("messages") or data.get("data") or []
    ids = [msg_id(m) for m in messages if msg_id(m)]
    new_msgs = [m for m in messages if msg_id(m) and msg_id(m) not in last_seen]
    state["last_seen_ids"] = ids  # same as original: compare next run against current top 5
    save_state(path, state)

    if not new_msgs:
        print("NO_NEW", file=out)
        return 0
    lines = [f"📬 OpenCard 郵件監控 | 最近一次檢查收到 {len(new_msgs)} 封新郵件", ""]
    for i, m in enumerate(new_msgs, 1):
        sender = sender_to_str(m.get("from") or m.get("sender"))
        subject = m.get("subject") or "(no subject)"
        lines += [f"{i}. [{sender}] - {subject}", f"💡 建議：{suggestion(m)}", ""]
    lines += ["行動選項：", "[A] 查看錯誤 log", "[B] 確認後重新 deploy", "[C] 略過（稍後處理）", "", "⚠️ 請回覆 A/B/C 來決定是否執行建議"]
    print("NEW_MESSAGE", file=out)
    print("\n".join(lines), file=out)
    return 0


if __name__ == "__main__":
    sys.exit(run())
