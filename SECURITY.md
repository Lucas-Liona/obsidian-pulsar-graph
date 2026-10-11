# Security

## Reporting a vulnerability

Please report it privately, not in a public issue: open the repository's
**Security** tab and choose **Report a vulnerability**. That opens a private
advisory that only the maintainer can see, where the report can be discussed
and fixed before anything is made public.

## What Pulsar touches

Pulsar runs entirely inside Obsidian, on your machine. It makes no network
requests and sends no telemetry. What it keeps about your notes is their paths
and when they were edited, never what they say. It writes only its own files
in its plugin folder: `data.json` for settings and pinned notes, and
`history.json`, with its backup, for the edit history.

A report about anything that breaks those promises is especially welcome, as
is anything a crafted vault, note name or pasted preset could make it do.

## Supported versions

Fixes go into the latest release. Obsidian updates community plugins in place,
so there are no older release lines to patch.
