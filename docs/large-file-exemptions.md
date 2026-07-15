# Large File Exemptions

**Status:** living document; entries are added during Phase 2d W2 decomposition when a file genuinely can't fit the ≤800 LoC bar (master plan §5 Phase 2d exit criterion).

**Process:** Add a row when a W2 decomposition leaves an orchestrator above 800 LoC. Each entry MUST include:
- file path + current LoC
- decomposition history (what was extracted, by which W2-T task)
- rationale (why further decomposition would be artificial)
- sunset condition (what change would make further decomposition natural)

A future audit should periodically revisit entries; if the sunset condition is met, the file gets decomposed and the row is removed.

---

## Current exemptions

| File | LoC | Decomposition history | Rationale | Sunset condition |
|---|---|---|---|---|
| `core/src/records/record-manager.ts` | 933 | Phase 2d W2-T6 extracted 4 collaborators (~510 LoC moved): `record-manager/sagas.ts` (227 LoC RecordSagas — saga-orchestration entry points), `record-manager/search.ts` (258 LoC RecordSearch — search + suggestions + cache), `record-manager/file-ops.ts` (137 LoC RecordFileOps — filesystem write + git commit + schema-validate-before-save), `record-manager/helpers.ts` (83 LoC pure functions). | The remaining methods (`createRecord`, `createRecordWithId`, `getRecord`, `updateRecord`, `listRecords`, `publishDraft` and the `writeAudit` helper) are public CRUD pipelines that orchestrate ALL 8 RecordManager dependencies (db, git, hooks, workflows, templates, audit, file-ops, cache). Each method is a top-down read of how a record-lifecycle event flows through the platform — splitting them artificially would create classes that take a near-identical deps-bag and obscure the pipeline's readability. | Three sunset paths: (a) Phase 3 reintroduces realtime + collaborative edits, which will reshape `updateRecord` enough to motivate a different split; (b) introducing a uniform `RecordContext` deps bag would let a Crud collaborator take it cleanly; (c) splitting `createRecord` between "draft path" and "published-via-saga path" — these are already different code paths but inline branching keeps them readable. |
