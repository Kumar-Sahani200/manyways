"""Shared validation boundary for users and untrusted model output."""
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

ListText = Annotated[str, Field(min_length=1, max_length=500)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Node(Model):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    parentId: str | None = None
    title: str = Field(min_length=1, max_length=100)
    text: str = Field(default="", max_length=12000)
    kind: Literal["section", "end"] = "section"


class Goal(Model):
    description: str = Field(default="", max_length=3000)
    audience: str = Field(default="", max_length=1500)
    ageMin: int | None = Field(default=None, ge=0, le=120)
    ageMax: int | None = Field(default=None, ge=0, le=120)
    gender: str = Field(default="", max_length=100)
    nationality: str = Field(default="", max_length=150)
    tone: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def ages(self):
        if self.ageMin is not None and self.ageMax is not None and self.ageMin > self.ageMax:
            raise ValueError("Minimum age must not exceed maximum age.")
        return self


def validate_tree(nodes: list[Node]) -> list[dict]:
    if not 1 <= len(nodes) <= 60:
        raise ValueError("A story needs 1–60 nodes.")
    mapping = {n.id: n for n in nodes}
    if len(mapping) != len(nodes):
        raise ValueError("Node IDs must be unique.")
    roots = [n for n in nodes if n.parentId is None]
    if len(roots) != 1 or roots[0].kind != "section":
        raise ValueError("A story needs exactly one root section.")
    if sum(len(n.text) for n in nodes) > 60000:
        raise ValueError("Story exceeds 60,000 characters.")
    paths = []
    for node in nodes:
        seen, chain, current = set(), [], node
        while current:
            if current.id in seen:
                raise ValueError("Story cannot contain cycles.")
            seen.add(current.id)
            chain.insert(0, current)
            if len(chain) > 12:
                raise ValueError("A story path cannot exceed 12 nodes.")
            if current.parentId is None:
                break
            parent = mapping.get(current.parentId)
            if not parent or parent.kind == "end":
                raise ValueError("Each child must have a section parent.")
            current = parent
        if node.kind == "end":
            if node.text:
                raise ValueError("End nodes cannot contain text.")
            sections = chain[:-1]
            if any(not n.text.strip() for n in sections):
                raise ValueError("Complete paths cannot contain empty sections.")
            paths.append({
                "id": node.id, "title": node.title,
                "text": "\n\n".join(n.text for n in sections),
                "nodeIds": [n.id for n in chain],
            })
    if len(paths) > 12:
        raise ValueError("A project supports at most 12 complete paths.")
    return paths


class ProjectCreate(Model):
    title: str = Field(min_length=1, max_length=120)


class ProjectEdit(ProjectCreate):
    version: int = Field(ge=1)
    nodes: list[Node] = Field(min_length=1, max_length=60)
    goal: Goal

    @model_validator(mode="after")
    def tree(self):
        validate_tree(self.nodes)
        return self


class RunCreate(Model):
    kind: Literal["generate", "evaluate"]
    expectedVersion: int = Field(ge=1)
    personaCount: int = Field(default=12, ge=10, le=15)
    branchIds: list[str] = Field(default_factory=list, max_length=12)
    sourceText: str = Field(default="", max_length=60000)


class ExportRequest(Model):
    branchIds: list[str] = Field(min_length=1, max_length=12)


class GeneratedTree(Model):
    nodes: list[Node] = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def tree(self):
        if len(validate_tree(self.nodes)) < 2:
            raise ValueError("Generate at least two complete paths.")
        return self


class Persona(Model):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=100)
    readingStyle: str = Field(min_length=1, max_length=800)
    motivation: str = Field(min_length=1, max_length=800)
    skepticism: str = Field(min_length=1, max_length=500)
    attention: str = Field(min_length=1, max_length=500)
    preferences: list[ListText] = Field(min_length=1, max_length=10)


class PersonaSet(Model):
    personas: list[Persona] = Field(min_length=10, max_length=15)

    @model_validator(mode="after")
    def distinct(self):
        if len({p.id for p in self.personas}) != len(self.personas):
            raise ValueError("Personas must have distinct IDs.")
        if len({p.readingStyle.casefold() for p in self.personas}) < 8:
            raise ValueError("Personas must have diverse reading styles.")
        return self


class Evidence(Model):
    quote: str = Field(min_length=1, max_length=500)
    interpretation: str = Field(min_length=1, max_length=1000)


class Evaluation(Model):
    personaId: str = Field(min_length=1, max_length=80)
    branchId: str = Field(min_length=1, max_length=100)
    reaction: str = Field(min_length=1, max_length=2500)
    emotionalTrajectory: list[ListText] = Field(min_length=1, max_length=12)
    dropOffPoints: list[ListText] = Field(max_length=12)
    comprehension: float = Field(ge=0, le=10)
    credibility: float = Field(ge=0, le=10)
    memorability: float = Field(ge=0, le=10)
    goalFit: float = Field(ge=0, le=10)
    evidence: list[Evidence] = Field(min_length=1, max_length=4)
    objections: list[ListText] = Field(max_length=10)
    revisions: list[ListText] = Field(max_length=10)


class RankedBranch(Model):
    branchId: str = Field(min_length=1, max_length=100)
    rank: int = Field(ge=1, le=12)
    score: float = Field(ge=0, le=10)
    rationale: str = Field(min_length=1, max_length=3000)
    strengths: list[ListText] = Field(max_length=12)
    risks: list[ListText] = Field(max_length=12)
    suggestedEdits: list[ListText] = Field(max_length=12)


class Ranking(Model):
    rankings: list[RankedBranch] = Field(min_length=2, max_length=12)
    disagreement: str = Field(min_length=1, max_length=4000)
    uncertainty: str = Field(min_length=1, max_length=4000)


def new_id() -> str:
    return uuid4().hex
