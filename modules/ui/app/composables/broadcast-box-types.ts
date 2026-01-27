/**
 * Broadcast Box Type Definitions
 *
 * Shared type definitions for Broadcast Box device interfaces
 */

/**
 * Source information from status message protocol
 */
export interface SourceInfo {
  id: number; // Numeric source ID (0, 1, 2, ...)
  identifier?: string; // String identifier ("hdmi1", "hdmi2", "usb_camera", etc.) - optional because list_sources uses 'name'
  name?: string; // Human-readable name (used by list_sources when falling back to string arrays)
  path?: string; // Device path (e.g., "/dev/video0")
  resolution?: [number, number]; // [width, height] for video sources
  framerate?: number; // FPS for video sources
  available?: boolean; // Whether source is currently available
}

/**
 * Active sources from status message
 */
export interface ActiveSources {
  video: SourceInfo | null; // Currently active video source
  audio: SourceInfo | null; // Currently active audio source
}

/**
 * Picture-in-Picture configuration from status message protocol
 */
export interface PiPConfiguration {
  /**
   * Whether the device supports PiP right now (status `sources.pip.supported`).
   * If missing (older devices), treat as supported.
   */
  supported?: boolean;
  enabled: boolean; // Whether PiP is currently active
  pipSource: SourceInfo | null; // PiP source (null if disabled)
  mainSource: SourceInfo | null; // Main source (null if no active video source)
  position:
    | 'top_left'
    | 'top_right'
    | 'bottom_left'
    | 'bottom_right'
    | 'center';
  /** PiP size as fraction of main frame (0–1), e.g. 0.25 = 25%. Legacy status may send { width, height } in pixels. */
  size: number | { width: number; height: number };
}

/**
 * Manual recording metadata from device
 */
export interface ManualRecording {
  recording_id: string;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number;
  file_path: string;
  file_size_bytes: number;
  hash_sha256?: string;
  video_source?: string;
  audio_source?: string;
  quality?: 'low' | 'standard' | 'high';
  created_by: 'manual';
}
