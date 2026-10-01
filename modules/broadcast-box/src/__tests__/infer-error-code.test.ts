import { describe, it, expect } from 'vitest';
import { BroadcastBoxErrorCode, inferErrorCode } from '../types/errors.js';

const C = BroadcastBoxErrorCode;

/**
 * `inferErrorCode` classifies free text, and the text can come from a device:
 * an ack that fails without an `errorCode` has its `error` classified here.
 */
describe('inferErrorCode', () => {
  describe('classification', () => {
    it.each([
      ['Streaming is not configured', C.ERR_STREAMING_NOT_CONFIGURED],
      ['Session already active', C.ERR_SESSION_ALREADY_ACTIVE],
      ['Recording already in progress', C.ERR_SESSION_ALREADY_ACTIVE],
      ['Streaming is not active', C.ERR_STREAMING_NOT_ACTIVE],
      ['Not streaming', C.ERR_STREAMING_NOT_ACTIVE],
      ['Connection refused', C.ERR_STREAMING_CONNECTION_FAILED],
      ['Device not found', C.ERR_DEVICE_NOT_FOUND],
      ['Device abc-123 was not found', C.ERR_DEVICE_NOT_FOUND],
      ['Source not found', C.ERR_SOURCE_NOT_FOUND],
      ['Source "camera-2" not found', C.ERR_SOURCE_NOT_FOUND],
      ['Thing not found', C.ERR_SOURCE_NOT_FOUND],
      ['Command timed out', C.TIMEOUT],
      ['Device disconnected', C.DEVICE_NOT_CONNECTED],
      ['Unknown command', C.ERR_INVALID_COMMAND],
      ['deviceId is required', C.ERR_MISSING_PARAMETER],
      ['WebRTC negotiation failed', C.ERR_WEBRTC_FAILED],
      ['Could not create offer', C.ERR_WEBRTC_FAILED],
      ['ICE gathering failed', C.ERR_WEBRTC_FAILED],
      ['Disk full', C.ERR_STORAGE_FULL],
      ['Bad payload', C.ERR_INVALID_PAYLOAD],
      ['Capture not active', C.ERR_CAPTURE_NOT_ACTIVE],
      ['Capture failed', C.ERR_CAPTURE_FAILED],
      ['Invalid streaming URL', C.ERR_STREAMING_INVALID_URL],
      ['Invalid RTMP url', C.ERR_STREAMING_INVALID_URL],
      ['Write failed', C.ERR_STORAGE_WRITE_FAILED],
      ['Invalid enrollment code', C.ERR_INVALID_ENROLLMENT_CODE],
      ['Enrollment disabled', C.ERR_ENROLLMENT_DISABLED],
      ['Something else entirely', C.ERR_UNKNOWN],
      ['', C.ERR_UNKNOWN],
    ])('%j', (message, code) => {
      expect(inferErrorCode(message)).toBe(code);
    });
  });

  describe('messages that were misclassified', () => {
    it.each([
      // `ice` matched inside "device" and "service".
      ['Device is busy', C.ERR_DEVICE_BUSY],
      ['Device busy', C.ERR_DEVICE_BUSY],
      ['Device is already enrolled', C.ERR_DEVICE_ALREADY_ENROLLED],
      ['Service unavailable', C.ERR_UNKNOWN],
      ['Invalid payload from device', C.ERR_INVALID_PAYLOAD],
      // The general test came first and answered for the specific one, which
      // made these three codes unreachable.
      ['File not found', C.ERR_FILE_NOT_FOUND],
      ['Preview already active', C.ERR_PREVIEW_ALREADY_ACTIVE],
      ['Capture already active', C.ERR_CAPTURE_ALREADY_ACTIVE],
    ])('%j', (message, code) => {
      expect(inferErrorCode(message)).toBe(code);
    });
  });

  describe('two words on one line', () => {
    it('does not match across a line break, as `.` did not', () => {
      expect(inferErrorCode('device\nthing not found')).toBe(
        C.ERR_SOURCE_NOT_FOUND
      );
      expect(inferErrorCode('invalid\nurl')).toBe(C.ERR_UNKNOWN);
    });

    it('needs them in order', () => {
      expect(inferErrorCode('url is invalid')).toBe(C.ERR_UNKNOWN);
    });
  });

  describe('what a device can send', () => {
    it.each(['streaming', 'device', 'source', 'invalid', 'preview'])(
      'is not slowed by %j repeated, which was quadratic',
      (word) => {
        // 1 MB. At 200 KB the old pattern took about 2 s, and four times
        // that for each doubling.
        const message = word.repeat(Math.ceil(1_000_000 / word.length));
        const started = Date.now();

        inferErrorCode(message);

        expect(Date.now() - started).toBeLessThan(200);
      }
    );

    it('reads only the start of a very long message', () => {
      const message = 'x'.repeat(5000) + ' device busy';
      expect(inferErrorCode(message)).toBe(C.ERR_UNKNOWN);
      expect(inferErrorCode('device busy ' + 'x'.repeat(5000))).toBe(
        C.ERR_DEVICE_BUSY
      );
    });

    it.each([
      ['an object', { message: 'Device busy' }],
      ['a number', 42],
      ['null', null],
      ['undefined', undefined],
      ['a list', ['Device busy']],
    ])('does not throw on %s', (_label, value) => {
      // A device frame is not schema-checked. `.toLowerCase()` on an object
      // threw inside the ack handler.
      expect(() => inferErrorCode(value)).not.toThrow();
    });

    it('classifies an Error by its message', () => {
      expect(inferErrorCode(new Error('Device busy'))).toBe(C.ERR_DEVICE_BUSY);
    });
  });
});
