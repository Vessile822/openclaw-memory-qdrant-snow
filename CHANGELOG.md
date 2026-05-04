# Changelog

All notable changes to this project will be documented in this file.

## [3.1.2] - 2026-04-27

### Added
- **Dedicated Extraction Model Configuration**: Introduced `extractionBaseUrl` and `extractionModelId` to allow separating the heavy extraction LLM from the lightweight embedding model.
- **Precision Date Retrieval**: Added `memory_list_by_date` tool with cross-date buffering to ensure complete daily logs for automated diary summaries.
- **Content Sanitization**: Enhanced XML tag filtering (e.g., `<final>`, `<think>`) to prevent technical noise from polluting the semantic memory.
- **Documentation Overhaul**: Fully documented all v3.x configuration parameters in `README.md` and `README_EN.md`.

### Fixed
- Redundant logic in the batch extraction pipeline to improve processing performance.
- Inconsistent variable naming between UI configuration and backend runtimes.

## [3.1.0] - 2026-04-23

### Fixed
- **I-01**: Fixed Smart Extraction fallback bug where LLM success with zero stored memories (due to deduplication) would erroneously fallback to raw mode processing.
- **I-02**: Added missing `abstract` and `overview` fields to raw mode payload for schema consistency with Dream features.
- **M-02**: Restricted slash command noise filter regex to explicitly match memory commands (`/recall`, `/remember`, `/forget`, `/search`, `/store`) to prevent false positives on file paths.
- **C-01**: Unified version numbers across `openclaw.plugin.json`, `index.js`, `SKILL.md`, and `README.md`.
- **C-02**: Unified `MEMORY_CATEGORIES` definition across `smart-extractor.js`, `index.js`, and documentation to ensure consistent classification (`profile`, `preferences`, `entities`, `events`, `cases`, `patterns`, `other`).

### Changed
- Default User ID changed to `297387319848075264` to match standard OpenClaw configurations.

## [3.0.0] - 2026-04-18

### Added
- **Smart Extraction Pipeline**: Optional LLM-based memory distillation (`smartExtraction` flag) to extract structured insights and filter out low-importance content.
- **Noise Filter**: 7-category bilingual noise rejection (short acknowledgments, boilerplate, meta-questions, system envelopes).
- **Auto Dream**: Automatic aging and archiving of unused memories (`archived: true`) based on `referenceCount` and `lastReferenced`.
- **Three-tier Architecture**: Memories now split into `abstract` (L0), `overview` (L1), and `content` (L2).
- **6 Advanced Categories**: `profile`, `preferences`, `entities`, `events`, `cases`, `patterns`.

### Fixed
- Huge bug in `autoCapture`: Previously captured the entire conversation history (up to 186 chunks) on every turn. Now properly utilizes `extractLastTurnMessages` to only capture the final turn.

## [2.0.0] - 2026-03-01

### Added
- Complete rewrite from Python to native OpenClaw Plugin.
- Native `autoCapture` lifecycle hook integration.
- Switched to LM Studio (OpenAI format) for local embeddings (zero cloud dependency).
- Implemented `clean_content` and `chunk_text` natively inside the plugin.
- Cosine similarity deduplication (threshold 0.95) applied during AutoCapture.
- TrueRecall 100% payload schema backwards compatibility.

### Removed
- Python `realtime_qdrant_watcher.py` polling script (no longer needed).
- `Transformers.js` memory-heavy local embedding module.

## [1.0.10] - 2026-02-17

### Fixed
- **P1-13**: CLI search command now uses `SIMILARITY_THRESHOLDS.LOW` constant instead of hardcoded 0.3
- **P1-14**: Fixed regex inconsistency in `detectCategory` - phone number regex now has length limit (10-13 digits) and word boundary
- **P1-15**: Email regex now consistent between `shouldCapture` and `detectCategory` (strict anchored pattern)

### Added
- **P2-16**: Embeddings initialization with retry mechanism (3 attempts with exponential backoff)
- **P2-20**: Input sanitization function to remove HTML tags, control characters, and normalize whitespace
- **P2-21**: Qdrant connection health check on plugin startup (non-blocking, logs warnings if connection fails)

### Security
- Enhanced ReDoS protection with word boundaries in phone number regex
- Input sanitization prevents XSS and injection attacks in stored memories
- All regex patterns now have proper length limits and boundaries

### Testing
- Added comprehensive self-validation test suite (29 tests, 100% pass rate)
- Tests cover: input sanitization, category detection, capture filtering, ReDoS protection, edge cases, Chinese language support

## [1.0.9] - 2026-02-17

### Added
- **Configurable memory limit**: New `maxMemorySize` config option (default: 1000, range: 100-1000000)
  - Users can now customize the maximum number of memories in in-memory mode
  - LRU eviction automatically removes oldest memories when limit is reached
  - Set to 999999 for unlimited storage (no automatic deletion)
  - Only applies to in-memory mode, external Qdrant has no limit
  - Documented in README.md and openclaw.plugin.json with clear help text

### Changed
- Improved startup log to show configured memory limit or "unlimited" status
- Added warning in README about potential memory exhaustion with unlimited mode

## [1.0.8] - 2026-02-17

### Fixed
- **P0 - Memory leak**: Added MAX_MEMORY_STORE_SIZE (1000) limit with LRU eviction for in-memory mode
- **P0 - Version inconsistency**: Synced openclaw.plugin.json version with package.json
- **P1 - ReDoS vulnerability**: Improved regex patterns to prevent catastrophic backtracking
  - Phone number regex: limited to 10-13 digits
  - Email regex: more strict pattern with anchors
- **P1 - Error information leakage**: Changed console.error to api.logger.error
- **P1 - Log level**: Changed frequent info logs to debug level (autoRecall, autoCapture)

### Changed
- Extracted magic numbers to SIMILARITY_THRESHOLDS constant for better maintainability
- Improved code consistency across all search operations

### Security
- Reduced ReDoS attack surface with stricter regex patterns
- Better error handling to prevent information disclosure

## [1.0.7] - 2026-02-17

### Changed
- Optimized SKILL.md following ClawHub best practices
- Shortened description to meet 200-character limit
- Added homepage field pointing to GitHub repository
- Moved detailed installation notes from SKILL.md to README.md
- Simplified SKILL.md Installation section with link to README
- Removed redundant `primaryEnv: null` from metadata

### Documentation
- Enhanced README.md with comprehensive installation requirements
- Added platform-specific build tool instructions
- Added troubleshooting section for common installation issues
- Documented Node.js version requirement (≥18.17)
- Listed all network access requirements and native dependencies

## [1.0.6] - 2026-02-17

### Documentation
- Added comprehensive "Installation Notes" section to SKILL.md
- Documented first-time setup requirements (model download, native dependencies)
- Added platform-specific build tool requirements (Windows/macOS/Linux)
- Clarified Node.js version requirement (≥18.17)
- Listed all network access requirements for transparency
- Provided recommended installation commands for reproducible builds

## [1.0.5] - 2026-02-17

### Internal
- Version skipped due to publishing conflict

## [1.0.4] - 2026-02-16

### Fixed
- Synced local and remote file inconsistencies (autoCapture default, version numbers)
- Added PII warning to autoCapture uiHints and SKILL.md documentation
- Clarified that autoCapture trigger patterns match emails and phone numbers

### Changed
- uiHints labels changed to English for consistency
- Improved autoCapture help text with explicit PII capture warning
- Version bump: openclaw.plugin.json 1.0.0 -> 1.0.4

## [1.0.3] - 2026-02-16

### Documentation
- Simplified SKILL.md following high-star skill patterns
- Added "Use when" statement for clarity
- Condensed features, configuration, and usage sections
- Removed verbose FAQ and implementation details
- Improved description and tags for better discoverability

## [1.0.2] - 2026-02-16

### Documentation
- Added comprehensive Privacy & Security section to README and SKILL.md
- Clarified data storage modes (in-memory vs Qdrant)
- Documented network access behavior (Transformers.js model download)
- Added detailed configuration options with privacy notes
- Included security recommendations for production use

## [1.0.1] - 2026-02-16

### Security
- Removed development documentation files (CODE_REVIEW.md, PHASE*.md, etc.)
- Removed test files that duplicated source code
- Fixed @xenova/transformers version (3.3.1 -> 2.17.2)
- Removed unintended openai dependency from package-lock.json
- Changed autoCapture default from true to false (opt-in for privacy)

### Changed
- Cleaned up repository structure for production use

## [1.0.0] - 2026-02-16

### Added
- Initial release
- Local semantic memory with Qdrant (in-memory mode)
- Transformers.js for local embeddings (Xenova/all-MiniLM-L6-v2)
- Three core tools: `memory_store`, `memory_search`, `memory_forget`
- Automatic memory capture via lifecycle hooks
- Zero-configuration setup

### Technical
- ES6 module system
- Factory function pattern for tool exports
- Compatible with OpenClaw plugin architecture
