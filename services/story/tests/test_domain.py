import io
import json
import zipfile

import pytest
from pydantic import ValidationError

from services.story.domain import (
    Node, Goal, RunInput, assemble_paths, validate_tree, validate_matrix, safe_filename,
)


def story():
    return [
        Node(id="root", title="Opening", text="Shared opening."),
        Node(id="a", parent_id="root", title="A", text="Ending A.", is_end=True),
        Node(id="b", parent_id="root", title="B", text="Ending B.", is_end=True),
        Node(id="c", parent_id="root", title="Unfinished", text="Still going."),
    ]


def test_shared_ancestor_assembly_and_unfinished():
    paths = assemble_paths(story())
    assert len(paths) == 3
    complete = assemble_paths(story(), True)
    assert [p["id"] for p in complete] == ["a", "b"]
    assert complete[0]["text"] == "Shared opening.\n\nEnding A."
    assert complete[1]["node_ids"] == ["root", "b"]


@pytest.mark.parametrize("nodes", [
    [], [Node(id="a", parent_id="missing", title="A")],
    [Node(id="a", title="A"), Node(id="b", title="B")],
    [Node(id="a", title="A"), Node(id="a", parent_id="a", title="B")],
    [Node(id="a", title="A"), Node(id="b", parent_id="c", title="B"),
     Node(id="c", parent_id="b", title="C")],
    [Node(id="a", title="A", is_end=True), Node(id="b", parent_id="a", title="B")],
    [Node(id=str(i), parent_id=str(i-1) if i else None, title="A") for i in range(9)],
])
def test_invalid_trees(nodes):
    with pytest.raises(ValueError):
        validate_tree(nodes)


def test_goal_and_utf8_limits():
    with pytest.raises(ValidationError):
        Goal(age_min=40, age_max=20)
    with pytest.raises(ValueError):
        Goal().ready()
    for name, text in [("x.pdf", "abc"), ("x.txt", "\x00"), ("x.txt", "\ufffd"), ("x.txt", "😀" * 20000)]:
        with pytest.raises(ValueError):
            RunInput(kind="generation", request_id="test", source_name=name, source_text=text)
    assert RunInput(kind="generation", request_id="test", source_name="draft.txt", source_text="é").kind == "generation"


def test_ranking_integrity():
    b, p = [{"id": "a"}, {"id": "b"}], [{"id": "p1"}, {"id": "p2"}]
    matrix = [{"branch_id": x["id"], "persona_id": y["id"], "status": "completed"} for x in b for y in p]
    validate_matrix(b, p, matrix)
    for bad in [matrix[:-1], matrix + matrix[:1], [{**matrix[0], "status": "failed"}] + matrix[1:]]:
        with pytest.raises(ValueError):
            validate_matrix(b, p, bad)
    assert "/" not in safe_filename("../../bad / name")
