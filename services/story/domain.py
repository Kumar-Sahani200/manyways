"""Validated public contracts and deterministic tree operations."""
import re
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_NODES, MAX_DEPTH, MAX_PATHS, MAX_TEXT = 40, 8, 12, 80000


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Node(StrictModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    parent_id: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(default="", max_length=20000)
    is_end: bool = False


class Goal(StrictModel):
    outcome: str = Field(default="", max_length=2000)
    audience: str = Field(default="", max_length=2000)
    age_min: int = Field(default=18, ge=13, le=100)
    age_max: int = Field(default=65, ge=13, le=100)
    gender: str = Field(default="", max_length=200)
    nationality: str = Field(default="", max_length=200)
    tone: str = Field(default="", max_length=500)
    constraints: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def ages(self):
        if self.age_min > self.age_max:
            raise ValueError("Minimum age must not exceed maximum age.")
        return self

    def ready(self):
        if not self.outcome or not self.audience or not self.tone or not self.constraints:
            raise ValueError("Set outcome, audience, tone, and constraints (or 'none') before running agents.")


def validate_tree(nodes: list[Node]):
    if not nodes or len(nodes) > MAX_NODES:
        raise ValueError("A story needs 1–40 nodes.")
    by_id = {n.id: n for n in nodes}
    if len(by_id) != len(nodes):
        raise ValueError("Node IDs must be unique.")
    roots = [n for n in nodes if n.parent_id is None]
    if len(roots) != 1:
        raise ValueError("A story must have exactly one root.")
    if sum(len(n.text) for n in nodes) > MAX_TEXT:
        raise ValueError("Story text exceeds 80,000 characters.")
    endings = 0
    for node in nodes:
        seen, current, depth = set(), node, 0
        while current is not None:
            if current.id in seen:
                raise ValueError("Story contains a cycle.")
            seen.add(current.id)
            depth += 1
            if depth > MAX_DEPTH:
                raise ValueError("Story exceeds 8 levels.")
            if current.parent_id is not None:
                parent = by_id.get(current.parent_id)
                if parent is None:
                    raise ValueError("Every parent must exist.")
                if parent.is_end:
                    raise ValueError("An end node cannot have children.")
                current = parent
            else:
                current = None
        endings += int(node.is_end)
    if endings > MAX_PATHS:
        raise ValueError("A story supports at most 12 complete paths.")
    return nodes


def assemble_paths(nodes: list[Node], complete_only=False):
    validate_tree(nodes)
    by_id = {n.id: n for n in nodes}
    parents = {n.parent_id for n in nodes}
    result = []
    for leaf in nodes:
        if leaf.id in parents or (complete_only and not leaf.is_end):
            continue
        path, node = [], leaf
        while node:
            path.append(node)
            node = by_id.get(node.parent_id)
        path.reverse()
        result.append({
            "id": leaf.id, "title": leaf.title, "complete": leaf.is_end,
            "node_ids": [n.id for n in path],
            "text": "\n\n".join(n.text for n in path if n.text),
        })
    return result


class CreateProject(StrictModel):
    title: str = Field(min_length=1, max_length=120)


class UpdateProject(CreateProject):
    version: int = Field(ge=1)
    nodes: list[Node]
    goal: Goal

    @model_validator(mode="after")
    def tree(self):
        validate_tree(self.nodes)
        return self


class RunInput(StrictModel):
    kind: str = Field(pattern=r"^(generation|evaluation)$")
    request_id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    branch_ids: list[str] = Field(default_factory=list, max_length=MAX_PATHS)
    persona_count: int = Field(default=12, ge=10, le=15)
    source_name: str = Field(default="", max_length=200)
    source_text: str = Field(default="", max_length=65536)

    @model_validator(mode="after")
    def source(self):
        if self.kind == "generation":
            if (not self.source_name.lower().endswith(".txt") or not self.source_text.strip()
                    or "\x00" in self.source_text or "\ufffd" in self.source_text
                    or len(self.source_text.encode("utf-8")) > 65536):
                raise ValueError("Upload a nonempty, valid UTF-8 .txt file up to 64 KiB.")
        if self.kind == "evaluation" and (not self.branch_ids or len(set(self.branch_ids)) != len(self.branch_ids)):
            raise ValueError("Select distinct complete branches.")
        return self


class ExportInput(StrictModel):
    branch_ids: list[str] | None = Field(default=None, max_length=MAX_PATHS)
    format: str = Field(default="text", pattern=r"^(text|json)$")


class GeneratedTree(StrictModel):
    nodes: list[Node]

    @model_validator(mode="after")
    def tree(self):
        validate_tree(self.nodes)
        paths = assemble_paths(self.nodes, True)
        if len(paths) < 2 or any(not p["text"] for p in paths):
            raise ValueError("Generated tree needs at least two nonempty complete paths.")
        return self


class Persona(StrictModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)
    reading_style: str = Field(min_length=1, max_length=1000)
    motivations: str = Field(min_length=1, max_length=1000)
    genre_preferences: str = Field(min_length=1, max_length=1000)
    attention_pattern: str = Field(min_length=1, max_length=1000)
    skepticism: str = Field(min_length=1, max_length=1000)
    accessibility_needs: str = Field(min_length=1, max_length=1000)
    goal_connection: str = Field(min_length=1, max_length=1000)


class Ensemble(StrictModel):
    personas: list[Persona] = Field(min_length=10, max_length=15)

    @model_validator(mode="after")
    def distinct(self):
        if len({p.id for p in self.personas}) != len(self.personas):
            raise ValueError("Persona IDs must be distinct.")
        if len({p.name.casefold() for p in self.personas}) != len(self.personas):
            raise ValueError("Persona names must be distinct.")
        traits = {(p.reading_style.casefold(), p.motivations.casefold(), p.attention_pattern.casefold())
                  for p in self.personas}
        if len(traits) != len(self.personas):
            raise ValueError("Personas must have distinct traits, not just different names.")
        return self


class Evidence(StrictModel):
    quote: str = Field(min_length=1, max_length=2000)
    explanation: str = Field(min_length=1, max_length=2000)


class Evaluation(StrictModel):
    reaction: str = Field(min_length=1, max_length=4000)
    emotional_trajectory: list[str] = Field(min_length=1, max_length=12)
    attention_points: list[str] = Field(min_length=1, max_length=12)
    comprehension: int = Field(ge=1, le=5)
    credibility: int = Field(ge=1, le=5)
    memorability: int = Field(ge=1, le=5)
    goal_fit: int = Field(ge=1, le=5)
    evidence: list[Evidence] = Field(min_length=1, max_length=8)
    objections: list[str] = Field(min_length=1, max_length=12)
    revisions: list[str] = Field(min_length=1, max_length=12)


class RankedBranch(StrictModel):
    branch_id: str
    rank: int = Field(ge=1, le=MAX_PATHS)
    rationale: str = Field(min_length=1, max_length=4000)
    strengths: list[str] = Field(min_length=1, max_length=12)
    risks: list[str] = Field(min_length=1, max_length=12)
    suggested_edits: list[str] = Field(min_length=1, max_length=12)


class Rankings(StrictModel):
    items: list[RankedBranch] = Field(min_length=1, max_length=MAX_PATHS)
    audience_disagreement: str = Field(min_length=1, max_length=4000)
    uncertainty: str = Field(min_length=1, max_length=4000)
    suggested_next_edits: list[str] = Field(min_length=1, max_length=12)


RUBRIC = (
    "All scores use the same 1–5 ordinal anchors: 1 weak/unclear, 2 limited, "
    "3 mixed/adequate, 4 strong, 5 exceptional. Comprehension = ease of understanding; "
    "credibility = internal plausibility/trust; memorability = distinctive recall cues; "
    "goal_fit = alignment with the stated outcome. Scores are simulated qualitative "
    "judgments, not measured audience reactions or forecasts."
)


def validate_matrix(branches, personas, evaluations):
    expected = {(b["id"], p["id"]) for b in branches for p in personas}
    actual = [(e["branch_id"], e["persona_id"]) for e in evaluations if e["status"] == "completed"]
    if len(actual) != len(expected) or set(actual) != expected or len(actual) != len(set(actual)):
        raise ValueError("Ranking requires a complete, unique persona-by-branch evaluation matrix.")


def validate_rankings(rankings, branches):
    ids = [i.branch_id for i in rankings.items]
    if len(ids) != len(branches) or set(ids) != {b["id"] for b in branches}:
        raise ValueError("Ranking must reference every selected branch exactly once.")
    if sorted(i.rank for i in rankings.items) != list(range(1, len(branches) + 1)):
        raise ValueError("Ranks must form a distinct sequence.")


def safe_filename(value):
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip(".-")[:80] or "story"


def new_root():
    return Node(id=uuid4().hex, title="Opening", parent_id=None).model_dump()
