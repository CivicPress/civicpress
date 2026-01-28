Broadcast Box API Changes - Complete Integration Guide

Overview

We've refactored how video/audio sources and streaming are configured. Instead
of passing sources with each command, sources are now configured once via
sources.set and automatically used by all subsequent commands.  
 RTMP streaming has been added with persistent configuration.

---

Source Configuration

sources.set - Set active video/audio sources

This is the primary way to configure which sources are used for preview,
recording, and streaming.

{  
 "command": "sources.set",  
 "payload": {  
 "video": "razer_kiyo_pro", // Device identifier OR "pip"  
 "audio": "razer_kiyo_pro" // Device identifier  
 }  
 }

Response:  
 {  
 "video": "razer_kiyo_pro",  
 "audio": "razer_kiyo_pro",  
 "status": "configured",  
 "live_switched": true // true if FFmpeg was restarted (capture was active)  
 }

Notes:

- At least one of video or audio must be provided
- Setting video to "pip" uses the configured PiP layout
- Sources persist across device restarts
- If called while capturing, FFmpeg automatically restarts with new sources

---

Preview Commands

preview.start - Start preview

{  
 "command": "preview.start",  
 "payload": {  
 "quality": {  
 "width": 640,  
 "height": 360,  
 "framerate": 30  
 }  
 }  
 }

preview.stop - Stop preview

{  
 "command": "preview.stop",  
 "payload": {}  
 }

---

Recording Commands

record.start - Start recording

{  
 "command": "record.start",  
 "payload": {  
 "config": {  
 "quality": "high" // low, standard, high, ultra  
 }  
 }  
 }

record.stop - Stop recording

{  
 "command": "record.stop",  
 "payload": {}  
 }

record.list - List recordings

{  
 "command": "record.list",  
 "payload": {}  
 }

---

Streaming Commands (NEW)

stream.configure - Configure RTMP streaming destination

Sets the RTMP URL and stream key. Configuration is persisted to the device.

{  
 "command": "stream.configure",  
 "payload": {  
 "url": "rtmp://a.rtmp.youtube.com/live2",  
 "stream_key": "xxxx-xxxx-xxxx-xxxx",  
 "platform": "youtube" // youtube, facebook, twitch, generic  
 }  
 }

Response:  
 {  
 "status": "configured",  
 "platform": "youtube",  
 "url": "rtmp://a.rtmp.youtube.com/live2",  
 "stream_key_set": true  
 }

Notes:

- Configuration is saved to database and persists across restarts
- Only call this when user changes streaming settings (not every time)
- Supported platforms: youtube, facebook, twitch, generic

stream.start - Start RTMP streaming

Starts streaming to the configured RTMP destination.

{  
 "command": "stream.start",  
 "payload": {  
 "quality": "standard" // optional, defaults to settings.quality_streaming  
 }  
 }

Response:  
 {  
 "status": "streaming",  
 "platform": "youtube",  
 "url": "rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx-xxxx",  
 "quality": "standard"  
 }

Notes:

- Uses centralized sources from sources.set
- If RTMP not configured in memory, automatically loads from saved config
- If FFmpeg is already running (preview/recording), restarts with RTMP output
  added
- If FFmpeg not running, starts it with RTMP output

stream.stop - Stop RTMP streaming

{  
 "command": "stream.stop",  
 "payload": {}  
 }

Response:  
 {  
 "status": "stopped",  
 "platform": "youtube"  
 }

Notes:

- If other outputs active (preview, recording), FFmpeg continues without RTMP
- If no other outputs, FFmpeg stops

---

Session Commands

session.start - Start scheduled session

{  
 "command": "session.start",  
 "payload": {  
 "session_id": "abc123",  
 "config": {  
 "quality": "high" // Only quality accepted, sources come from sources.set  
 }  
 }  
 }

session.stop - Stop session

{  
 "command": "session.stop",  
 "payload": {}  
 }

---

PiP Commands

pip.configure - Configure Picture-in-Picture

{  
 "command": "pip.configure",  
 "payload": {  
 "main_source": "camera_0",  
 "pip_source": "camera_1",  
 "position": "top_right", // top_left, top_right, bottom_left, bottom_right,
center  
 "pip_size": 0.25  
 }  
 }

Then set video source to "pip":  
 {  
 "command": "sources.set",  
 "payload": {  
 "video": "pip",  
 "audio": "razer_kiyo_pro"  
 }  
 }

---

Quality Presets

Available in device.connected capabilities:  
 ┌──────────┬───────────────┬───────────────┬────────────┬───────────┐  
 │ Preset │ Video Bitrate │ Audio Bitrate │ Resolution │ Framerate │  
 ├──────────┼───────────────┼───────────────┼────────────┼───────────┤  
 │ low │ 1000 kbps │ 96 kbps │ 1280x720 │ 30 │  
 ├──────────┼───────────────┼───────────────┼────────────┼───────────┤  
 │ standard │ 2000 kbps │ 128 kbps │ 1920x1080 │ 30 │  
 ├──────────┼───────────────┼───────────────┼────────────┼───────────┤  
 │ high │ 4000 kbps │ 192 kbps │ 1920x1080 │ 30 │  
 ├──────────┼───────────────┼───────────────┼────────────┼───────────┤  
 │ ultra │ 8000 kbps │ 256 kbps │ 1920x1080 │ 30 │  
 └──────────┴───────────────┴───────────────┴────────────┴───────────┘  
 Default quality per output:

- Preview: low
- Streaming: standard
- Recording: high

---

Events  
 ┌──────────────────────────────────┬───────────────────┬────────────────────────────────┐

│ Event │ When Published │ Payload │  
 ├──────────────────────────────────┼───────────────────┼────────────────────────────────┤

│ sources.changed │ After sources.set │ {video, audio} │  
 ├──────────────────────────────────┼───────────────────┼────────────────────────────────┤

│ streaming.rtmp.started │ Stream starts │ {platform, url} │  
 ├──────────────────────────────────┼───────────────────┼────────────────────────────────┤

│ streaming.rtmp.stopped │ Stream stops │ {platform} │  
 ├──────────────────────────────────┼───────────────────┼────────────────────────────────┤

│ streaming.rtmp.connection_failed │ Connection error │ {platform, error,
retry_count} │  
 └──────────────────────────────────┴───────────────────┴────────────────────────────────┘

---

Deprecated Commands

source.switch - DEPRECATED

Use sources.set instead. Still works but logs deprecation warning.

---

Breaking Changes Summary  
 ┌───────────────┬─────────────────────────────────────────────┐  
 │ Command │ Change │  
 ├───────────────┼─────────────────────────────────────────────┤  
 │ preview.start │ No longer accepts video_source/audio_source │  
 ├───────────────┼─────────────────────────────────────────────┤  
 │ record.start │ No longer accepts video_source/audio_source │  
 ├───────────────┼─────────────────────────────────────────────┤  
 │ session.start │ No longer accepts video_source/audio_source │  
 ├───────────────┼─────────────────────────────────────────────┤  
 │ source.switch │ Deprecated, use sources.set │  
 └───────────────┴─────────────────────────────────────────────┘

---

Recommended UI Flows

Initial Setup

1. Device connects → receive device list
2. User selects camera/mic → sources.set {video: "...", audio: "..."}
3. User configures streaming → stream.configure {url: "...", stream_key: "...",
   platform: "..."}

Start Preview

1. preview.start {quality: {...}}

Start Recording

1. record.start {config: {quality: "high"}}

Start Streaming

1. stream.start {quality: "standard"} // Uses saved RTMP config

Change Camera Mid-Stream

1. sources.set {video: "new_camera"} // FFmpeg auto-restarts

Enable PiP

1. pip.configure {main_source: "camera_0", pip_source: "camera_1", ...}
2. sources.set {video: "pip", audio: "..."}

Combined Recording + Streaming

1. sources.set {video: "camera_0", audio: "mic_0"}
2. stream.configure {url: "...", stream_key: "...", platform: "youtube"}
3. preview.start {}
4. record.start {config: {quality: "high"}}
5. stream.start {quality: "standard"}  
   // Now: preview + recording + streaming all active
6. stream.stop {} // Recording continues
7. record.stop {} // Preview continues
8. preview.stop {}

---

Migration Checklist

- Update UI to call sources.set when user changes camera/mic selection
- Remove video_source/audio_source from preview.start payloads
- Remove video_source/audio_source from record.start payloads
- Remove video_source/audio_source from session.start payloads
- Replace source.switch calls with sources.set
- Add streaming UI with stream.configure, stream.start, stream.stop
- Call stream.configure only when user changes RTMP settings (persisted)
- Subscribe to sources.changed event if tracking active sources
- Subscribe to streaming.rtmp.\* events for streaming status
- Update quality preset UI to use values from capabilities.quality

---
