# Qdrant Memory Enhancements Plan

## Architecture Decisions
1. **MMR (Diversity) Implementation**: 
   - Qdrant supports Maximal Marginal Relevance (MMR) directly in the Search API (v1.15+).
   - In `index.js`, we will modify the `db.search` calls to include `diversity: 0.2` (or similar weight) within the search parameters.
2. **Score Boosting**:
   - To implement a slight recency bias, we can utilize Qdrant's `score_modifier` (if available in our Qdrant version) or natively sort/adjust scores post-retrieval in our code.
   - Wait, `score_modifier` is supported? Yes, Qdrant allows using payload fields to modify scores. We will use the `turn` payload property or `timestamp` to boost recent events slightly over older ones.

## Dependencies
- `@qdrant/js-client-rest`: Assuming we are using a recent version that supports these parameters.

## Execution Plan
1. **Phase 1 (Diversity)**: Modify `MemoryDB.search` in `index.js` to accept and utilize a `diversity` threshold, defaulting to something like `0.3` to avoid pulling purely duplicate concepts.
2. **Phase 2 (Recency)**: Evaluate how to inject a small score boost for newer `turn` numbers. 
