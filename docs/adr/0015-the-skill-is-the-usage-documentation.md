# 0015. The skill is the usage documentation, and the README is the door.

Date: 2026-09-10

Status: accepted

## Context

The first reader of panoram is a coding agent, and the second is the human who works beside it.
An agent reads a skill when it decides what to do; it does not read a README.
Two documents that describe the same flags drift apart, and the one the agent reads is the one that must be right.
solarsql made the same decision for the same readers.

## Decision

`skills/panoram/SKILL.md` is the usage documentation: the workflow an agent follows and the table of queries.
Its references hold the rules: every query with its columns, the envelope and the flags, the tables for a statement of your own, and user queries.
The README says what panoram is, what it needs, how to install it, and where to read next.
New behavior lands in the skill first.

## Consequences

A project points its AGENTS.md at the skill.
The README repeats no rule; it links.
A change to a flag or a query edits the skill and its references in the same commit.
