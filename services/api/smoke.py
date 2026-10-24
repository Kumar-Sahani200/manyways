"""Bounded provider discovery check. Never prints credentials or agent content."""
import os
import sys

import httpx
from agenticorg import AgenticOrg

from .provider import ProviderError, check_config


def main():
    try:
        check_config()
        with AgenticOrg(
            api_key=os.environ["AGENTICORG_API_KEY"],
            base_url=os.environ["AGENTICORG_BASE_URL"], timeout=20,
        ) as client:
            client.agents.list()
        print("AgenticOrg authenticated discovery succeeded. Agent execution still requires a bounded live run.")
    except ProviderError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    except httpx.HTTPStatusError as exc:
        print(f"AgenticOrg discovery denied (HTTP {exc.response.status_code}). Check grants and endpoint.", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"AgenticOrg discovery failed ({type(exc).__name__}). No credentials or response bodies were logged.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
