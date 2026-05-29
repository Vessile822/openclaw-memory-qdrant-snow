# Qdrant Memory Enhancements Specification

## Overview
This specification details the structural and architectural enhancements for the `memory-qdrant` plugin, inspired by the official `qdrant/skills` repository. The goal is to improve the quality, diversity, and relevance of the retrieved memory context injected into the LLM.

## Problem Statement
Currently, the memory retrieval mechanism relies on pure Dense Vector Similarity (Cosine/Dot). This leads to several issues:
1. **Redundancy**: Fetching the top 3 results often returns near-identical memories, wasting context window and reducing information density.
2. **Time Blindness**: Pure vector search does not inherently prioritize recent events over older ones.

## Target Outcomes
- **SC-001 (Diversity)**: Ensure the top N returned memories cover different aspects of the query using MMR.
- **SC-002 (Recency Bias)**: Ensure that recently updated or created memories receive a slight ranking boost.

## Functional Requirements
1. **Maximal Marginal Relevance (MMR)**: Implement Qdrant's `diversity` parameter (requires Qdrant v1.15+) in the search API to penalize redundant results.
2. **Score Boosting**: Utilize Qdrant's `score_modifier` (or similar business logic integration) to boost scores based on the payload's `lastReferenced` or `timestamp` field.
