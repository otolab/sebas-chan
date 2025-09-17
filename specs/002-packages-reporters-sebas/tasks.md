# Tasks: Reportersパッケージ - イベント収集・送信システム

**Input**: Design documents from `/specs/002-packages-reporters-sebas/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- Monorepo structure: `packages/reporters/`
- Source code: `packages/reporters/src/`
- Tests: `packages/reporters/tests/`
- Configuration: `packages/reporters/config/`

## Phase 3.1: Setup
- [ ] T001 Create packages/reporters directory structure with src/, tests/, config/ subdirectories
- [ ] T002 Initialize TypeScript project with package.json, tsconfig.json, and vitest.config.ts
- [ ] T003 Install core dependencies: @sebas-chan/reporter-sdk, winston, p-retry, tsx
- [ ] T004 [P] Configure ESLint and Prettier for TypeScript
- [ ] T005 [P] Create .gitignore file with node_modules, dist, logs, data/buffer patterns
- [ ] T006 Create default configuration file in config/default.json

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests for Reporter API
- [ ] T007 [P] Contract test POST /events in tests/contract/test_events_post.ts
- [ ] T008 [P] Contract test GET /events in tests/contract/test_events_get.ts
- [ ] T009 [P] Contract test POST /events/send in tests/contract/test_events_send.ts
- [ ] T010 [P] Contract test GET /sources in tests/contract/test_sources_get.ts
- [ ] T011 [P] Contract test POST /sources in tests/contract/test_sources_post.ts
- [ ] T012 [P] Contract test PUT /sources/{id} in tests/contract/test_sources_put.ts
- [ ] T013 [P] Contract test DELETE /sources/{id} in tests/contract/test_sources_delete.ts
- [ ] T014 [P] Contract test GET /status in tests/contract/test_status.ts
- [ ] T015 [P] Contract test GET /health in tests/contract/test_health.ts

### Contract Tests for Server Integration
- [ ] T016 [P] Contract test POST /api/v1/events server submission in tests/contract/test_server_submit.ts
- [ ] T017 [P] Contract test GET /api/v1/health server health check in tests/contract/test_server_health.ts

### Integration Tests from Quickstart Scenarios
- [ ] T018 [P] Integration test: Basic event sending scenario in tests/integration/test_basic_send.ts
- [ ] T019 [P] Integration test: Server offline buffering scenario in tests/integration/test_buffering.ts
- [ ] T020 [P] Integration test: Multiple sources collection scenario in tests/integration/test_multi_source.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Data Models
- [ ] T021 [P] Event model with validation in src/models/Event.ts
- [ ] T022 [P] EventSource model with validation in src/models/EventSource.ts
- [ ] T023 [P] FileBuffer model with JSON Lines support in src/models/FileBuffer.ts
- [ ] T024 [P] ConnectionStatus model in src/models/ConnectionStatus.ts
- [ ] T025 [P] Type definitions and enums in src/types/index.ts

### Core Services
- [ ] T026 [P] BufferService for file-based persistence in src/services/BufferService.ts
- [ ] T027 [P] EventCollector for gathering events in src/services/EventCollector.ts
- [ ] T028 [P] ServerClient for API communication in src/services/ServerClient.ts
- [ ] T029 [P] RetryManager with exponential backoff in src/services/RetryManager.ts
- [ ] T030 [P] SourceManager for event source management in src/services/SourceManager.ts
- [ ] T031 [P] HealthMonitor for system status tracking in src/services/HealthMonitor.ts

### Reporter API Implementation
- [ ] T032 POST /events endpoint in src/api/routes/events.ts
- [ ] T033 GET /events endpoint in src/api/routes/events.ts
- [ ] T034 POST /events/send endpoint in src/api/routes/events.ts
- [ ] T035 GET /sources endpoint in src/api/routes/sources.ts
- [ ] T036 POST /sources endpoint in src/api/routes/sources.ts
- [ ] T037 PUT /sources/{id} endpoint in src/api/routes/sources.ts
- [ ] T038 DELETE /sources/{id} endpoint in src/api/routes/sources.ts
- [ ] T039 GET /status endpoint in src/api/routes/status.ts
- [ ] T040 GET /health endpoint in src/api/routes/health.ts

### CLI Commands
- [ ] T041 [P] CLI send-event command in src/cli/commands/send-event.ts
- [ ] T042 [P] CLI list-sources command in src/cli/commands/list-sources.ts
- [ ] T043 [P] CLI add-source command in src/cli/commands/add-source.ts
- [ ] T044 [P] CLI remove-source command in src/cli/commands/remove-source.ts
- [ ] T045 [P] CLI status command in src/cli/commands/status.ts
- [ ] T046 [P] CLI health command in src/cli/commands/health.ts
- [ ] T047 [P] CLI flush-buffer command in src/cli/commands/flush-buffer.ts
- [ ] T048 [P] CLI list-events command in src/cli/commands/list-events.ts
- [ ] T049 CLI main entry point in src/cli/index.ts

## Phase 3.4: Integration
- [ ] T050 Wire up BufferService with FileBuffer for persistence
- [ ] T051 Connect EventCollector to BufferService
- [ ] T052 Integrate ServerClient with RetryManager
- [ ] T053 Configure Winston logging across all services
- [ ] T054 Add request/response middleware for API logging
- [ ] T055 Implement error handling middleware
- [ ] T056 Set up health check aggregation from all services
- [ ] T057 Configure file rotation for buffer files
- [ ] T058 Implement graceful shutdown handling

## Phase 3.5: Polish
- [ ] T059 [P] Unit tests for Event validation in tests/unit/models/Event.test.ts
- [ ] T060 [P] Unit tests for EventSource validation in tests/unit/models/EventSource.test.ts
- [ ] T061 [P] Unit tests for BufferService in tests/unit/services/BufferService.test.ts
- [ ] T062 [P] Unit tests for RetryManager in tests/unit/services/RetryManager.test.ts
- [ ] T063 [P] Unit tests for EventCollector in tests/unit/services/EventCollector.test.ts
- [ ] T064 Performance test: Event processing < 100ms in tests/perf/event-processing.ts
- [ ] T065 Performance test: Buffer write < 50ms in tests/perf/buffer-write.ts
- [ ] T066 Memory test: Usage stays under 100MB in tests/perf/memory-usage.ts
- [ ] T067 [P] Create README.md with installation and usage instructions
- [ ] T068 [P] Generate API documentation from OpenAPI specs
- [ ] T069 Run quickstart.md scenarios for manual validation
- [ ] T070 Clean up any code duplication identified by linter

## Dependencies
- Setup (T001-T006) blocks all other tasks
- Tests (T007-T020) before implementation (T021-T049)
- Models (T021-T025) before services (T026-T031)
- Services before API endpoints (T032-T040)
- API and CLI can proceed in parallel
- Integration (T050-T058) requires core implementation
- Polish (T059-T070) after all implementation

## Parallel Execution Examples

### Batch 1: Initial Setup (after T001-T002)
```
Task: "Configure ESLint and Prettier for TypeScript"
Task: "Create .gitignore file with node_modules, dist, logs patterns"
```

### Batch 2: All Contract Tests (after T006)
```
Task: "Contract test POST /events in tests/contract/test_events_post.ts"
Task: "Contract test GET /events in tests/contract/test_events_get.ts"
Task: "Contract test POST /events/send in tests/contract/test_events_send.ts"
Task: "Contract test GET /sources in tests/contract/test_sources_get.ts"
Task: "Contract test POST /sources in tests/contract/test_sources_post.ts"
Task: "Contract test PUT /sources/{id} in tests/contract/test_sources_put.ts"
Task: "Contract test DELETE /sources/{id} in tests/contract/test_sources_delete.ts"
Task: "Contract test GET /status in tests/contract/test_status.ts"
Task: "Contract test GET /health in tests/contract/test_health.ts"
Task: "Contract test POST /api/v1/events server submission"
Task: "Contract test GET /api/v1/health server health check"
```

### Batch 3: All Models (after tests are failing)
```
Task: "Event model with validation in src/models/Event.ts"
Task: "EventSource model with validation in src/models/EventSource.ts"
Task: "FileBuffer model with JSON Lines support in src/models/FileBuffer.ts"
Task: "ConnectionStatus model in src/models/ConnectionStatus.ts"
Task: "Type definitions and enums in src/types/index.ts"
```

### Batch 4: All Services (after models)
```
Task: "BufferService for file-based persistence in src/services/BufferService.ts"
Task: "EventCollector for gathering events in src/services/EventCollector.ts"
Task: "ServerClient for API communication in src/services/ServerClient.ts"
Task: "RetryManager with exponential backoff in src/services/RetryManager.ts"
Task: "SourceManager for event source management in src/services/SourceManager.ts"
Task: "HealthMonitor for system status tracking in src/services/HealthMonitor.ts"
```

### Batch 5: All CLI Commands (after services)
```
Task: "CLI send-event command in src/cli/commands/send-event.ts"
Task: "CLI list-sources command in src/cli/commands/list-sources.ts"
Task: "CLI add-source command in src/cli/commands/add-source.ts"
Task: "CLI remove-source command in src/cli/commands/remove-source.ts"
Task: "CLI status command in src/cli/commands/status.ts"
Task: "CLI health command in src/cli/commands/health.ts"
Task: "CLI flush-buffer command in src/cli/commands/flush-buffer.ts"
Task: "CLI list-events command in src/cli/commands/list-events.ts"
```

## Notes
- Total tasks: 70
- Parallel-capable tasks: 44 (marked with [P])
- Critical path: Setup → Tests → Models → Services → API/CLI → Integration → Polish
- Estimated completion: 3-4 development days with parallel execution
- Each task creates/modifies a single file
- Commit after each task or batch completion

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests (T007-T017)
- [x] All entities have model tasks (T021-T024)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks truly independent (different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task