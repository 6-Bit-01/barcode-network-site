#!/usr/bin/env python3
"""One-time local setup. Secrets are entered on the VPS, never in chat or Git."""
from __future__ import annotations
from datetime import datetime, timezone
import getpass
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import sys


def main():
    if sys.version_info < (3, 9):
        raise SystemExit("Use Python 3.9 or newer, such as the existing bot virtualenv Python.")
    if os.geteuid() == 0:
        raise SystemExit("Run as the existing bot user, without sudo. Only installing the generated systemd units needs sudo.")
    os.umask(0o077)
    home = Path.home()
    install = home / ".local/share/barcode-after-show"
    config_path = home / ".config/barcode-after-show/config.json"
    if config_path.exists():
        raise SystemExit("Configuration already exists; it has not been overwritten. Edit it privately to change settings.")
    root = Path(input(f"Existing bot directory [{home / 'bnl01'}]: ").strip() or home / "bnl01").resolve()
    if not (root / "bnl01_conversations.db").is_file():
        raise SystemExit("Bot database not found; setup stopped without creating a database.")
    sender = input("Verified BARCODE sender address (must match the ChatGPT task): ").strip()
    recipient = input("Your connected Gmail inbox address: ").strip()
    user = input(f"SMTP login address [{sender}]: ").strip() or sender
    password = getpass.getpass("Mail app password (hidden): ").replace(" ", "")
    token = secrets.token_urlsafe(32)
    cfg = {"endpoint": "https://www.barcode-network.com/api/ops/after-show", "export_token": token,
           "root": str(root), "guild_id": 1288269405209235551, "row_limit": 5000,
           "state_dir": str(install / "state"), "not_before": datetime.now(timezone.utc).isoformat(),
           "sender": sender, "recipient": recipient, "smtp_host": "smtp.gmail.com", "smtp_port": 465,
           "smtp_user": user, "smtp_password": password}
    config_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    config_path.write_text(json.dumps(cfg, indent=2) + "\n")
    os.chmod(config_path, 0o600)
    from after_show import config
    try:
        config(config_path)
    except Exception:
        config_path.unlink()  # Remove only the incomplete file this invocation created.
        raise SystemExit("Invalid configuration; nothing installed. Retry with the intended account details.")
    install.mkdir(parents=True, exist_ok=True, mode=0o700)
    (install / "state").mkdir(exist_ok=True, mode=0o700)
    for filename in ("after_show.py", "bnl_after_show_capture.py"):
        shutil.copyfile(Path(__file__).with_name(filename), install / filename)
    # Reject ambiguous systemd field syntax instead of interpolating it.
    owner = pwd.getpwuid(os.getuid()).pw_name
    paths = [str(install), str(config_path), sys.executable, owner]
    if any(not re.fullmatch(r"[A-Za-z0-9_./-]+", value) for value in paths):
        raise SystemExit("Setup files saved; paths require manual systemd quoting before installation.")
    unit = f"""[Unit]
Description=BARCODE private after-show evidence delivery
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User={owner}
ExecStart={sys.executable} {install}/after_show.py --config {config_path}
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={install}/state
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=10min
"""
    (install / "barcode-after-show.service").write_text(unit)
    (install / "barcode-after-show.timer").write_text("""[Unit]
Description=Check for finished BARCODE public shows

[Timer]
OnBootSec=3min
OnUnitInactiveSec=5min
AccuracySec=30s
Unit=barcode-after-show.service

[Install]
WantedBy=timers.target
""")
    print("\nSet this server-only Vercel variable, then redeploy the website:")
    print("BARCODE_AFTER_SHOW_EXPORT_TOKEN=" + token)
    print("Keep that value private. It is also saved in your mode-600 config.")
    print("\nOff-air test (sends one TEST packet from the latest archived public show):")
    print(f"{sys.executable} {install}/after_show.py --test")
    print("\nAfter the test packet and automatic review are confirmed, activate the timer:")
    print(f"sudo install -m 644 {install}/barcode-after-show.service {install}/barcode-after-show.timer /etc/systemd/system/")
    print("sudo systemctl daemon-reload")
    print("sudo systemctl enable --now barcode-after-show.timer")
    print("The timer is not installed/enabled by this setup script. BNL was not restarted.")


if __name__ == "__main__":
    main()
