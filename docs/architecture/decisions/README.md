# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for CivicPress.
ADRs document important architectural decisions, the context that led to them,
and their consequences.

## What are ADRs?

ADRs are documents that capture important architectural decisions made in the
project. They help:

- **Understand why** decisions were made
- **Track alternatives** that were considered
- **Document consequences** of decisions
- **Provide context** for future developers

## ADR Index

| ADR                                                  | Title                                  | Status   | Date       |
| ---------------------------------------------------- | -------------------------------------- | -------- | ---------- |
| [ADR-001](ADR-001-dependency-injection-container.md) | Dependency Injection Container         | Accepted | 2025-01-30 |
| [ADR-002](ADR-002-saga-pattern.md)                   | Saga Pattern for Multi-Step Operations | Accepted | 2025-01-30 |
| [ADR-003](ADR-003-unified-caching-layer.md)          | Unified Caching Layer                  | Accepted | 2025-01-30 |
| [ADR-004](ADR-004-unified-error-handling.md)         | Unified Error Handling                 | Accepted | 2025-01-30 |

## ADR Format

Each ADR follows this structure:

1. **Status** - Accepted, Proposed, Deprecated, Superseded
2. **Date** - When the decision was made
3. **Deciders** - Who made the decision
4. **Tags** - Keywords for categorization
5. **Context** - What problem we're solving
6. **Decision** - What we decided to do
7. **Consequences** - Positive, negative, and neutral consequences
8. **Alternatives Considered** - Other options we evaluated
9. **References** - Links to related documentation

## Contributing

When making a significant architectural decision:

1. Create a new ADR following the template
2. Number it sequentially (ADR-005, ADR-006, etc.)
3. Include all relevant context and alternatives
4. Update this README with the new ADR
5. Reference the ADR in relevant documentation

---

**Last Updated**: 2025-01-30
