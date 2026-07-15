# CivicPress Makefile — refactor-era utility targets.
#
# Most build / test / dev commands live in package.json scripts (run with
# `pnpm <script>`). The targets here are recurring gates around the
# 2026-05 post-audit base refactor.

.PHONY: audit-truth-check help

help:
	@echo "CivicPress make targets:"
	@echo "  audit-truth-check   Scan working tree for documented overclaim patterns"
	@echo "                      (production-ready / 100% Functional / Top 0.1% / etc.)"
	@echo "                      and fail if any are found outside the allow-list."
	@echo "                      Allow-list: scripts/audit-truth-check-allowlist.txt"
	@echo
	@echo "For build / test / dev commands, see package.json (run with pnpm)."

audit-truth-check:
	@./scripts/audit-truth-check.sh
