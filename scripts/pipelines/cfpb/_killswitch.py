"""
CFPB pipeline kill switch.

Placed in front of every script that writes to data/cards/*.json so a single
flag file can disable the whole pipeline.

Why this exists:
  On 2026-04-25 the CFPB pipeline was found to have corrupted annual_fee
  for ~24 cards (regex matched "12 monthly billing cycles" in Amex
  agreements and wrote 12 to annual_fee). Until the pipeline is rewritten
  with a fact store + sanity gates + review queue (see docs/TAKEOVER_PLAN.md
  and docs/cfpb-pipeline-diagnosis-2026-04-22.md), no script in this
  directory may write directly to data/cards/.

Usage in a script that writes to data/cards/:

    #!/usr/bin/env python3
    from _killswitch import abort_if_disabled
    abort_if_disabled(__file__)

    # ...rest of script

To re-enable (only after the rewrite — don't bypass casually):
  rm scripts/pipelines/cfpb/_DISABLED.flag

To run a pipeline script anyway (e.g. emergency hotfix), set
  ALLOW_DISABLED_PIPELINE=1
in the environment. This is logged.
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

FLAG_FILE = Path(__file__).resolve().parent / "_DISABLED.flag"

# Scripts that are explicitly allowed to run regardless of the flag.
# These are repair/diagnostic tools, not part of the broken pipeline.
ALLOWLIST = {
    "_revert_corrupted_annual_fee.py",
    "_killswitch.py",
}


def abort_if_disabled(caller_file: str) -> None:
    """Call at the top of any script that writes to data/cards/.

    Reads _DISABLED.flag in this directory. If present, prints the flag
    contents (which explains the situation) and exits with status 2.

    The caller passes its own __file__ so we can show a clear message.
    """
    caller_name = os.path.basename(caller_file)

    if caller_name in ALLOWLIST:
        return

    if not FLAG_FILE.exists():
        return

    if os.environ.get("ALLOW_DISABLED_PIPELINE") == "1":
        sys.stderr.write(
            f"\n⚠️  CFPB pipeline kill switch is ACTIVE but ALLOW_DISABLED_PIPELINE=1 was set.\n"
            f"    Running {caller_name} anyway. This is logged.\n"
            f"    Reason for kill switch:\n"
        )
        try:
            sys.stderr.write("    " + FLAG_FILE.read_text().replace("\n", "\n    ") + "\n\n")
        except Exception:
            pass
        return

    flag_text = FLAG_FILE.read_text() if FLAG_FILE.exists() else "(flag file unreadable)"
    sys.stderr.write(
        f"\n🛑 CFPB pipeline is DISABLED.\n"
        f"   Refusing to run: {caller_name}\n"
        f"\n"
        f"   Why:\n"
    )
    for line in flag_text.strip().splitlines():
        sys.stderr.write(f"     {line}\n")
    sys.stderr.write(
        f"\n   To bypass for one run (e.g. emergency hotfix), set\n"
        f"     ALLOW_DISABLED_PIPELINE=1\n"
        f"   in the environment. This is logged.\n"
        f"\n   To re-enable permanently (only after the rewrite — see\n"
        f"   docs/TAKEOVER_PLAN.md), delete the flag:\n"
        f"     rm scripts/pipelines/cfpb/_DISABLED.flag\n"
        f"\n"
    )
    sys.exit(2)
