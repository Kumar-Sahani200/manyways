# Active agent workflow — LangChain, LangGraph, Groq

The original three-system design is unchanged. LangChain's `ChatGroq` executes
structured model calls; LangGraph routes stages; MongoDB stores durable jobs,
leases, frozen story snapshots, personas, and each completed evaluation.
There are no externally provisioned agent IDs, company IDs, or AgenticOrg calls.

## Pseudocode

```text
signed-in author -> save story tree + audience goal

if importing text:
    LangGraph.branch_story:
        Groq creative architect -> validated shared nodes + 2–4 complete paths
    show draft -> author reviews/edits -> optimistic-version apply

if evaluating selected completed paths:
    LangGraph.design_audience:
        reuse frozen personas after recovery, otherwise
        generate exactly 10–15 psychologically distinct fictional readers
        save personas to MongoDB
    LangGraph.evaluate_matrix:
        for every persona × selected path, with bounded concurrency:
            skip already checkpointed pairs
            LangChain ChatGroq -> reaction + emotional arc + rubric + quotes + edits
            validate schema, pair identity, and exact quotes
            save completed pair + progress
        if any pair failed: report partial results and stop, without a final ranking
    LangGraph.rank_paths:
        goal + every branch + every persona + every response -> Groq creative director
        validate each branch is ranked exactly once
        save ranking + disagreements + uncertainty

author -> reopen saved project/results -> export one, selected, or all paths
```

## Configuration and safeguards

- `GROQ_API_KEY` is secret. `GROQ_MODEL` defaults to `openai/gpt-oss-20b`.
- `.env.example` and Render blueprint contain names/defaults, never actual keys.
- GPT-OSS uses Groq's strict JSON Schema output with low reasoning effort.
  Other explicitly configured models use JSON mode; Pydantic validates every output.
- The system never invents missing model responses or substitutes fixture data.
- Story/goal/persona fields are untrusted data, not tool instructions.
- No browsing, tools, or external side effects are granted to generated personas.
- Bounded retries cover rate limits, connection errors and transient server errors;
  server-rejected JSON gets at most two repair requests, never an authentication retry
  loop. Partial results stay visible.
- Large aggregate prompts fail explicitly before sending; responses aren't silently
  dropped to fit the model context.
- Mongo checkpoints, rather than an in-memory LangGraph saver, survive worker
  process changes. Provider delivery remains **at least once**, not exactly once.
- Cancellation stops new calls and ignores late results; in-flight calls may cost money.
- Simulated feedback is not a survey or a prediction of real audience behaviour.
- LangSmith tracing is disabled by default. Text requested for generation/evaluation
  is sent to Groq; do not upload confidential or sensitive personal information.

## Verification

```sh
python -m pytest services/api/tests -q
python -m services.api.smoke
```

The first command is deterministic/offline. The second makes a small real Groq
request. Verify a complete 10-persona × 2-path evaluation separately before release.
