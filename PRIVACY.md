# Privacy

This page describes what data the Niki desktop and web app collects,
when it collects it, and how you stay in control. It documents the behavior
shipped in the app — the same controls live under **Settings → Privacy**.

Niki is **local-first**. Your projects, generated files, and BYOK API
keys stay on your machine. The app works fully offline; nothing in this page
applies unless you explicitly turn telemetry on.

## Data sharing is currently paused

The email delivery service is not configured yet. Niki currently sends no
usage data, even if you save future sharing preferences under
**Settings → Privacy**. Those preferences stay on your machine.

When email delivery is introduced, Niki will ask for confirmation again before
anything is sent. The intended recipient is `q1y2nfc@gmail.com`.

## What may be included after you confirm

After email delivery is configured and you confirm again, each category will
remain independently controllable in Settings.

- **Anonymous metrics** — run counts, token usage, error rate, and duration.
  No prompts and no project data.
- **Conversation and tool content** — your prompts, assistant responses, tool
  inputs, and tool outputs (truncated before send). API keys, tokens, JWTs,
  emails, IP addresses, and credit-card numbers are stripped automatically
  before anything leaves your machine.
- **Project artifacts manifest** — filenames, types, and sizes of generated
  files. The **contents** of those files are never sent.

## What is never collected

- The contents of your generated artifact files.
- Your BYOK API keys, tokens, or other secrets — these are redacted before
  send and are never part of telemetry.
- Anything at all while data sharing is paused or turned off.

## How data will be sent

The planned implementation will use a server-side email API. Credentials will
live only in the deployment environment and will never be exposed to the
browser. No email API is connected in the current release.

## Your anonymous ID

When sharing is enabled in a future release, the app may generate a random,
opaque installation ID
so related events can be grouped. It is not tied to your name, email, or
account, and it carries no personal information.

## Deleting your data

**Settings → Privacy → Delete my data** rotates your anonymous ID and stops
sending. Telemetry already received ages out under the team's retention
policy.

## Bring your own key

Niki is BYOK at every layer. The API keys you configure for coding
agents and model providers are stored locally and used only to talk to those
providers directly. They are never sent to Niki.

## Changes to this page

This document tracks the data handling of the shipped app. When the telemetry
behavior changes, this page is updated alongside it. For questions, open an
[issue](https://github.com/Rain765/Niki/issues).
