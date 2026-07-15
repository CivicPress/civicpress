# Handoff — BroadcastBox device recording pipeline (2026-07-03)

The CivicPress↔device integration is proven live on real hardware; the remaining
work is the **device-app A/V recording pipeline** (three bugs, `FA-HW-014/015/016`).
This doc is the next-session brief. The paste-able prompt is at the top; supporting
detail follows.

---

## ▶ NEXT-SESSION PROMPT (paste this)

> Continue the BroadcastBox real-hardware capstone. The CivicPress↔device integration
> is proven live (enrollment, WS connect, command round-trip, session lifecycle) — see
> memory `[[broadcast-box-integration-status]]` UPDATE-18→21 and the addendum in
> `docs/audits/2026-07-02-full-audit.md`. Your goal: get a real meeting to **record →
> upload → become a civic record + transcript**, then live-verify finding `FA-BB-002`
> (is the in-camera window kept out of the public video?).
>
> Three device-app bugs block a completed recording (all in the HW repo
> `../civicpress-broadcast-box`, run as systemd service `broadcast-box.service` on the
> appliance at **10.0.0.184**, user `civicpress` / pass `civicpress1234`):
> 1. **FA-HW-014** — `src/broadcast_box/main.py:497` `handle_session_start` builds
>    `video_sources` only from a PiP layout (`:519-523`) or a running preview
>    (`:567-597`), never from what `sources.set` saved to `session_defaults`. So an
>    API `start_session` without a preview records nothing ("No video sources available").
> 2. **FA-HW-015** — with a preview as workaround, the recording ffmpeg dies with
>    "cannot open audio device plughw:1 (Device or resource busy)": the preview's audio
>    ffmpeg holds the ALSA device and the preview→record transition frees the video
>    device (`main.py:607` `stop_capture`) but not the audio device.
> 3. **FA-HW-016** — video-only (to dodge #2) still writes no MP4 to
>    `storage_root/<session>/`; the multi-output capture+rawvideo-preview command in
>    `src/broadcast_box/services/capture/ffmpeg_capture.py` needs debugging. Reference:
>    a **manual** `ffmpeg -f v4l2 -input_format mjpeg -video_size 1920x1080 -framerate 30
>    -i /dev/video0 -f alsa -i plughw:1 -vf format=nv12,hwupload -c:v h264_vaapi
>    -low_power 1 -c:a aac -t 6 out.mp4` records 1080p A/V fine on this box — so
>    hardware/encoder/camera are all good; the bug is the app's command construction.
>
> Fix the pipeline (populate sources from `session_defaults`; release/handoff the audio
> device on preview→record; make the recording write its MP4), redeploy to the
> appliance, drive a session (recipe below), and confirm the civic record + capture
> block + transcript, plus the FA-BB-002 privacy check. Read this handoff doc
> (`docs/handoff/2026-07-03-broadcast-box-recording-pipeline.md`) for the full connect +
> drive + verify recipe before starting.

---

## Connection recipe (this VM → appliance)

- **Appliance:** host `broadcastbox001`. **Use the WIRED IP `10.0.0.184`** (~1 ms,
  reliable). Avoid the WiFi IP `10.0.20.156` (~150–400 ms, drops long SSH commands).
  The wired NIC needed a netplan fix (installer left `enp2s0` with no DHCP; added
  `dhcp4: true` — it's on a different subnet `10.0.0.x` than WiFi `10.0.20.x`, both
  reachable from the VM).
- **SSH is password-only, no `sshpass`** on the VM. Use OpenSSH askpass + `setsid`:
  ```bash
  SCR=<scratchpad>            # holds askpass.sh (echoes the password) + known_hosts_eth
  ssh_opts="-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$SCR/known_hosts_eth \
            -o PreferredAuthentications=password -o PubkeyAuthentication=no \
            -o ControlMaster=auto -o ControlPath=/tmp/cme-%C -o ControlPersist=300"
  SSH_ASKPASS="$SCR/askpass.sh" SSH_ASKPASS_REQUIRE=force setsid -w ssh $ssh_opts civicpress@10.0.0.184 '<cmd>'
  ```
  (ControlMaster keeps one connection so you don't re-auth per command.) `sudo` on the
  device works via `SUDO_ASKPASS=~/.sap.sh sudo -A …` (that helper is already on the box).
- **Device app** runs as `broadcast-box.service` (systemd). Code + venv at
  `~/civicpress-broadcast-box`. Logs: `sudo journalctl -u broadcast-box.service -f`.
  Restart to reset the FSM: `sudo systemctl restart broadcast-box.service`.
- **The device cannot reach this VM directly** (VM is on a Mac-internal NAT
  `192.168.64.x`). A reverse SSH tunnel bridges it — device HTTP→VM:3000 (API),
  device WS→VM:3001 (realtime, a SEPARATE port). Start it (leave running):
  ```bash
  SSH_ASKPASS=$SCR/askpass.sh SSH_ASKPASS_REQUIRE=force setsid -w ssh -N \
    -R 127.0.0.1:3000:localhost:3000 -R 127.0.0.1:3001:localhost:3001 \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 \
    -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$SCR/known_hosts_eth \
    -o PreferredAuthentications=password -o PubkeyAuthentication=no civicpress@10.0.0.184
  ```
  The device's stored `civicpress_url=http://localhost:3000`; its WS endpoint defaults
  to `ws://localhost:3001` (per `config.py`). Both tunnel to the VM's CP.

## CivicPress dev server (this VM)

- Start: `PORT=3000 pnpm run dev:api` (API :3000; in-process realtime WS :3001).
  `broadcast-box` is enabled in `data/.civic/config.yml` `modules:`. If routes 404,
  the module isn't mounted — check that list.
- Admin token (dev, `NODE_ENV` unset → `/auth/simulated` works, this is `FA-API-001`):
  ```bash
  curl -s -XPOST localhost:3000/api/v1/auth/simulated -H 'Content-Type: application/json' \
    -d '{"username":"cap","role":"admin"}' | jq -r .data.session.token
  ```
- Enrolled device: uuid `32ea4ae4-33ad-40e6-92f3-6176ba2c281d`, CP id
  `3a5a4b72-3e51-45c2-bc56-81450d85035a`. If the device state was wiped, re-enroll:
  `POST /api/v1/broadcast-box/devices/enroll {name}` (admin) → returns a fresh
  `{deviceUuid, enrollmentCode}`; then on the device
  `python scripts/configure_device.py --device-uuid … --enrollment-code … --civicpress-url http://localhost:3000 --enroll`.

## Drive a session (API = `http://localhost:3000/api/v1/broadcast-box`)

```
POST /devices/<uuid>/command  {"action":"sources.set","payload":{"video":"razer_kiyo_pro_usb_000000140_2","audio":"pro_razer_kiyo_pro"}}
POST /devices/<uuid>/command  {"action":"preview.start","payload":{}}        # currently required (FA-HW-014) but breaks audio (FA-HW-015)
POST /sessions/quick-start     {"deviceId":"<cp-id>","title":"…"}            # drafts a session record + start_session
… let it record …
POST /devices/<uuid>/command  {"action":"set_visibility","payload":{"visibility":"in_camera"}}   # close the meeting
POST /devices/<uuid>/command  {"action":"set_visibility","payload":{"visibility":"public"}}
POST /sessions/<session-id>/stop
```
Watch `journalctl -u broadcast-box.service` for the capture result. `set_visibility`
payload = `{visibility: "public"|"in_camera"}`; `sources.set` = `{video, audio}`.

## Verify success

- `GET /sessions/<id>` → status should reach **`complete`** with `metadata.capture`
  (`av_file`, `segments`, `duration_s`). While it stays `stopping`, the upload never
  finalized (no MP4 → the current bug).
- The civic record is `civicpressSessionId` (a `session` record); check its capture
  block + `media.transcript` (WebVTT) once transcription runs (audio required).
- **FA-BB-002 privacy check (the headline audit finding):** after a recording with an
  in-camera segment, confirm whether the stored MP4 in the `recordings` folder is
  served unauthenticated (`GET /api/v1/storage/files/<uuid>` with no token) and whether
  the in-camera window is present in the video (it should NOT be public). See the main
  audit report `FA-BB-002` + `FA-STOR-001`.

## Pointers

- Memory: `[[broadcast-box-integration-status]]` (UPDATE-18→21), `[[full-audit-2026-07-02]]`,
  `[[vm-and-remote-setup]]`.
- Audit: `docs/audits/2026-07-02-full-audit.md` (+ its 2026-07-03 addendum: FA-API-023, FA-HW-014/015/016).
- HW repo: `../civicpress-broadcast-box` — `src/broadcast_box/main.py` (`handle_session_start`),
  `src/broadcast_box/services/capture/ffmpeg_capture.py` (command construction),
  `src/broadcast_box/services/encoder/detection.py` (encoder select — correct, VAAPI).
- Server bug already fixed this session: `FA-API-023` (commit `8f6a791`) — the 404
  handler shadowed the broadcast-box routes; that's why enrollment 404'd initially.
