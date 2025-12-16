# CivicPress – Session Recorder Integration

## Purpose

This document describes how a session recorder box integrates with CivicPress to
capture, archive, and publish civic sessions as authoritative public records.

The goal is not live streaming as a product, but **durable, verifiable capture
of civic decision-making events**, tightly linked to agendas, minutes, and
resolutions.

---

## Design Principles

- Public records are the source of truth
- Hardware captures facts; CivicPress assigns meaning
- Open formats, no vendor lock-in
- Local-first, offline-tolerant
- Modular and optional
- Automatable through CivicPress workflows
- Streaming is external; archiving is internal

---

## Core Concepts

### Agenda

An agenda is created by a clerk and defines the planned structure of a civic
session.

### Session

A session is an authoritative civic event derived from an agenda. It exists
before, during, and after the meeting.

A session record owns:

- identity
- status
- links to agenda and minutes
- all media artifacts (video, audio, transcripts)

### Minutes

Minutes are created from the agenda and reference the session. They do not own
media; they link to the session.

---

## High-Level Flow

1. Clerk creates an agenda
2. Clerk uses a workflow to:
   - create a session record
   - create a draft minutes record
3. Clerk opens the minutes editor and sees session controls
4. Clerk starts/stops recording via CivicPress
5. Session is recorded on the box
6. Video/audio is uploaded to CivicPress storage
7. Media artifacts are linked to the session record
8. Transcription is triggered (external or internal)
9. Transcript files are linked to the session
10. Box purges local media after confirmation

---

## System Components

### 1. Session Recorder Box (Edge Device)

Responsibilities:

- Capture video/audio/HDMI
- Timestamp recordings
- Record against a CivicPress-issued session ID
- Buffer locally if offline
- Upload artifacts when connectivity is available
- Report status and health
- Purge local data when instructed

The box does not interpret content or manage records.

---

### 2. CivicPress Core

Responsibilities:

- Define session records and lifecycle
- Own canonical identifiers
- Store and link public records
- Expose APIs and workflows
- Control publication and governance
- Maintain auditability

CivicPress is the authoritative system.

---

### 3. Session Record

A session record includes:

- session_id
- type (council, committee, hearing)
- date and time
- location (room + geographic reference)
- status (scheduled, live, ended, archived)
- links to:
  - agenda
  - minutes
  - media artifacts
  - resolutions and bylaws

---

### 4. Media Artifacts

Artifacts are files produced by the session:

- video
- audio
- thumbnails
- transcripts (VTT/SRT/JSON)

Artifacts:

- are stored in standard formats
- are independently archivable
- are linked to sessions via metadata
- are not embedded inside records

---

### 5. Device Configuration Layer

Managed by CivicPress:

- device registration
- assignment to municipality and room
- input profiles (camera, mic, HDMI)
- default behaviors (manual vs auto start)
- credentials and trust

Configuration is declarative, not interactive.

---

### 6. Control and Status Channel

Two categories of communication:

#### Commands

- start recording
- stop recording
- set active session_id
- purge local storage

#### Telemetry

- online/offline
- recording state
- disk usage
- errors and logs

Low-bandwidth, resilient, auditable.

---

### 7. Upload and Ingestion Pipeline

Responsibilities:

- receive uploads (chunked/resumable)
- verify integrity (hashes)
- create artifact records
- link artifacts to session
- update session status

Must tolerate:

- slow networks
- interruptions
- delayed uploads

---

### 8. Streaming (External)

Live streaming is optional and external.

- Box streams to third-party services (YouTube, Facebook, Twitch)
- CivicPress stores stream URLs as temporary artifacts
- After upload, archived media becomes the canonical playback

CivicPress is not a streaming platform.

---

### 9. Transcription

Triggered by workflows:

- on video artifact upload
- uses external services or future modules

Outputs:

- transcript files
- optional structured data

Stored as artifacts and linked to the session.

---

### 10. Purge Policy

Local media on the box is purged only when:

- upload is complete
- integrity is verified
- CivicPress confirms retention

Purge is explicit, logged, and reversible by policy.

---

## Workflow Integration

Key workflow triggers:

- onAgendaPublished
- onSessionCreated
- onSessionCommand(start|stop)
- onArtifactUploaded
- onTranscriptionComplete
- onSessionArchived

Workflows enable automation without hardcoding logic.

---

## State Model (Simplified)

scheduled → live → ended → uploading → archived

Each transition is auditable.

---

## Out of Scope

- Full streaming platform
- Video editing
- Internal AV management
- Operational room booking
- Closed media formats

---

## Summary

The session recorder integration makes CivicPress more than a publishing tool.
It captures civic decision-making at the source and transforms it into durable,
verifiable public records.

Hardware remains optional. Records remain authoritative. Everything stays open
and portable.
