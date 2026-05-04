---
name: web-research
description: Research public web pages, decide when to use fetch_url or browse_page, and summarize sourced information.
allowed-tools:
  - fetch_url
  - browse_page
priority: 20
enabled: true
---

# Web Research

Use this skill when the user asks to summarize, inspect, compare, or verify information from a URL.

Guidelines:

- If the page content is not already in context, request `fetch_url`.
- If the page likely needs JavaScript rendering, dynamic content, or a normal fetch result is empty, request `browse_page`.
- Do not use local, private-network, or non-http/https URLs.
- Cite the source URL in the final answer.
- If the tool fails or returns insufficient content, say what failed and do not fabricate details.

