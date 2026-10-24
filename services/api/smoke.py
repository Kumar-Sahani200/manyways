"""Small real Groq + LangChain structured-output check; never prints credentials."""
import sys

from pydantic import BaseModel, ConfigDict

from .provider import ProviderError, structured


class Probe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: bool


def main():
    try:
        result = structured("rank", "rank_stories", {"task": "Connectivity probe only. Return JSON {\"ok\":true}."}, Probe)
        if not result["ok"]:
            raise ProviderError("Groq did not acknowledge the probe.")
        print("Groq authentication and LangChain structured output: PASS. Full graph execution is a separate check.")
    except Exception as exc:
        print(str(exc) if isinstance(exc, ProviderError) else f"Groq probe failed ({type(exc).__name__}).", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
