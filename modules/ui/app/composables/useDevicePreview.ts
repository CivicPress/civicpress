/**
 * Device Preview Composable
 *
 * Manages WebRTC connection for device preview streaming
 */

import {
  ref,
  computed,
  onUnmounted,
  watch,
  type Ref,
  type ComputedRef,
} from 'vue';
import { useDeviceCommands } from './useDeviceCommands';
import type { DeviceConnectionStatus } from './useDeviceConnectionStatus';

export interface PreviewQuality {
  width: number;
  height: number;
  framerate: number;
  bitrate: number;
}

export interface PreviewState {
  isActive: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed';
  error: string | null;
  stream: MediaStream | null;
}

/**
 * Composable for managing device preview via WebRTC
 *
 * @param deviceId - Device ID (UUID) as a reactive ref
 * @param wsConnection - Optional WebSocket connection (shared from parent component)
 * @param connectionStatus - Optional connection status (shared from parent component)
 * @returns Preview control methods and reactive state
 */
export function useDevicePreview(
  deviceId: Ref<string | undefined>,
  wsConnection?: Ref<WebSocket | null> | ComputedRef<WebSocket | null>,
  connectionStatus?:
    | Ref<DeviceConnectionStatus>
    | ComputedRef<DeviceConnectionStatus>
) {
  const { sendCommand } = useDeviceCommands(deviceId);
  const { t } = useI18n();

  // Use provided WebSocket connection or create a computed that returns null
  // The parent component should provide the shared connection
  const sharedWsConnection = wsConnection || computed(() => null);

  // Reactive state
  const isPreviewActive = ref(false);
  const connectionState = ref<
    'disconnected' | 'connecting' | 'connected' | 'failed'
  >('disconnected');
  const error = ref<string | null>(null);
  const previewStream = ref<MediaStream | null>(null);

  // WebRTC connection
  let peerConnection: RTCPeerConnection | null = null;
  // Some implementations deliver audio/video tracks separately; keep a stable combined stream.
  let combinedStream: MediaStream | null = null;
  let disconnectRecoveryTimeout: NodeJS.Timeout | null = null;
  let offerTimeout: NodeJS.Timeout | null = null;
  let diagnosticsInterval: NodeJS.Timeout | null = null;
  let isProcessingOffer = false; // Prevent duplicate offer processing
  let currentOfferId: string | null = null; // Track offer_id from preview.offer for answer correlation
  let pendingIceCandidates: RTCIceCandidateInit[] = []; // Queue ICE candidates until remote description is set
  const OFFER_TIMEOUT_MS = 30000; // 30 seconds

  // STUN servers for NAT traversal
  const iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Can add TURN servers later if needed
    ],
  };

  /**
   * Create and configure RTCPeerConnection
   */
  function createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection(iceServers);
    combinedStream = new MediaStream();

    // Explicitly request both video and audio (recvonly) for better interop.
    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch {
      // Some browsers may not support addTransceiver in older contexts; ignore.
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[DevicePreview] Local ICE candidate generated', {
          candidate: event.candidate.candidate?.substring(0, 100),
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });

        const ws = getWebSocketConnection();
        if (ws) {
          // Send ICE candidate to device via WebSocket
          const message = {
            type: 'preview.ice_candidate',
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            payload: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
          };
          console.log('[DevicePreview] Sending ICE candidate to device', {
            messageId: message.id,
            candidate: event.candidate.candidate?.substring(0, 100),
          });
          ws.send(JSON.stringify(message));
          console.log('[DevicePreview] ICE candidate sent successfully');
        } else {
          console.warn(
            '[DevicePreview] Cannot send ICE candidate: WebSocket not available'
          );
        }
      } else {
        console.log(
          '[DevicePreview] ICE candidate gathering complete (null candidate)'
        );
      }
    };

    // Handle incoming media tracks (video + audio)
    pc.ontrack = (event) => {
      console.log('[DevicePreview] 📹 Track event received', {
        streamsCount: event.streams?.length || 0,
        tracksCount: event.track ? 1 : 0,
        trackKind: event.track?.kind,
        trackId: event.track?.id,
        trackReadyState: event.track?.readyState,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
      });

      // Always build a combined stream from incoming tracks to avoid missing audio.
      if (!combinedStream) {
        combinedStream = new MediaStream();
      }

      const track = event.track;
      if (track) {
        // Replace any existing track of the same kind to keep stream clean.
        combinedStream
          .getTracks()
          .filter((t) => t.kind === track.kind)
          .forEach((t) => {
            try {
              combinedStream?.removeTrack(t);
            } catch {
              // ignore
            }
          });

        combinedStream.addTrack(track);
        track.onended = () => {
          try {
            combinedStream?.removeTrack(track);
          } catch {
            // ignore
          }
        };
      }

      console.log('[DevicePreview] ✅ Setting preview stream (combined)', {
        streamId: combinedStream.id,
        tracksCount: combinedStream.getTracks().length,
        videoTracks: combinedStream.getVideoTracks().length,
        audioTracks: combinedStream.getAudioTracks().length,
        trackDetails: combinedStream.getTracks().map((t) => ({
          kind: t.kind,
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
        })),
      });

      previewStream.value = combinedStream;
      connectionState.value = 'connected';
      isPreviewActive.value = true;
      error.value = null;
      console.log(
        '[DevicePreview] ✅✅✅ Preview stream active, connection state: CONNECTED'
      );
    };

    // Handle ICE connection state changes (separate from general connection state)
    pc.oniceconnectionstatechange = () => {
      if (!pc) return;

      const iceState = pc.iceConnectionState;
      console.log('[DevicePreview] ICE connection state changed', {
        iceConnectionState: iceState,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
        hasRemoteDescription: !!pc.remoteDescription,
        hasLocalDescription: !!pc.localDescription,
      });

      if (iceState === 'failed') {
        console.error(
          '[DevicePreview] ICE connection failed - possible causes:',
          {
            reason1:
              'ICE candidates not exchanged properly between client and device',
            reason2: 'NAT/firewall blocking UDP traffic',
            reason3: 'Device not processing our answer or ICE candidates',
            check:
              'Verify device logs show it received our preview.answer and preview.ice_candidate messages',
            signalingState: pc.signalingState,
            connectionState: pc.connectionState,
          }
        );
        error.value =
          'ICE connection failed. Check that device received answer and ICE candidates.';
        connectionState.value = 'failed';
      } else if (iceState === 'connected') {
        console.log('[DevicePreview] ICE connection established', {
          connectionState: pc.connectionState,
          signalingState: pc.signalingState,
        });
      } else if (iceState === 'checking') {
        console.log(
          '[DevicePreview] ICE connection checking (testing candidate pairs)',
          {
            connectionState: pc.connectionState,
            signalingState: pc.signalingState,
          }
        );
      } else if (iceState === 'disconnected') {
        console.warn('[DevicePreview] ICE connection disconnected', {
          connectionState: pc.connectionState,
          signalingState: pc.signalingState,
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (!pc) return;

      const state = pc.connectionState;
      console.log('[DevicePreview] Connection state changed', {
        connectionState: state,
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        hasRemoteDescription: !!pc.remoteDescription,
        hasLocalDescription: !!pc.localDescription,
        remoteDescriptionType: pc.remoteDescription?.type,
        localDescriptionType: pc.localDescription?.type,
        hasReceivers: pc.getReceivers().length > 0,
        hasTransceivers: pc.getTransceivers().length > 0,
      });

      if (state === 'connected') {
        if (disconnectRecoveryTimeout) {
          clearTimeout(disconnectRecoveryTimeout);
          disconnectRecoveryTimeout = null;
        }
        connectionState.value = 'connected';
        error.value = null;
        console.log('[DevicePreview] ✅ WebRTC connection established!', {
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
        });
      } else if (state === 'connecting') {
        connectionState.value = 'connecting';
        console.log('[DevicePreview] WebRTC connection in progress', {
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
        });
      } else if (state === 'failed') {
        connectionState.value = 'failed';
        if (disconnectRecoveryTimeout) {
          clearTimeout(disconnectRecoveryTimeout);
          disconnectRecoveryTimeout = null;
        }
        {
          error.value = 'WebRTC connection failed';
          console.error('[DevicePreview] ❌ WebRTC connection failed', {
            signalingState: pc.signalingState,
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            hasRemoteDescription: !!pc.remoteDescription,
            hasLocalDescription: !!pc.localDescription,
            possibleCauses: [
              'ICE candidates not exchanged properly',
              'NAT/firewall blocking connection',
              'Device not processing our answer or ICE candidates',
              'STUN/TURN servers not configured correctly',
            ],
          });
        }
        cleanup();
      } else if (state === 'disconnected') {
        // IMPORTANT: "disconnected" is often transient. Do not cleanup immediately or the preview will "suddenly stop".
        console.warn(
          '[DevicePreview] WebRTC connection disconnected (transient)',
          {
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
          }
        );
        connectionState.value = 'connecting';

        if (!disconnectRecoveryTimeout) {
          disconnectRecoveryTimeout = setTimeout(() => {
            // If we haven't recovered, surface an error and let user retry.
            console.warn(
              '[DevicePreview] WebRTC still disconnected after grace period, failing preview',
              {
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                signalingState: pc.signalingState,
              }
            );
            error.value = 'WebRTC connection disconnected';
            connectionState.value = 'failed';
            cleanup();
          }, 8000);
        }
      } else if (state === 'closed') {
        console.log('[DevicePreview] WebRTC connection closed');
      }
    };

    return pc;
  }

  /**
   * Handle preview.offer message from device
   */
  async function handlePreviewOffer(offer: RTCSessionDescriptionInit) {
    // Prevent processing the same offer multiple times
    if (isProcessingOffer) {
      console.warn(
        '[DevicePreview] Already processing an offer, ignoring duplicate'
      );
      return;
    }

    if (!peerConnection) {
      peerConnection = createPeerConnection();
    }

    // Prevent handling multiple offers simultaneously
    // Only process if we're in a state that allows setting remote description
    const currentState = peerConnection.signalingState;
    if (
      currentState !== 'stable' &&
      currentState !== 'have-local-offer' &&
      currentState !== 'have-local-pranswer'
    ) {
      console.warn(
        '[DevicePreview] Cannot set remote description in current state, ignoring offer:',
        {
          currentState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          hasLocalDescription: !!peerConnection.localDescription,
        }
      );
      // If we already have a remote description, don't overwrite it
      if (peerConnection.remoteDescription) {
        return;
      }
      // Otherwise, reset the connection to accept a new offer
      console.log(
        '[DevicePreview] Resetting peer connection to accept new offer'
      );
      peerConnection.close();
      peerConnection = createPeerConnection();
    }

    isProcessingOffer = true;
    try {
      // Validate offer before using it
      if (!offer.sdp || typeof offer.sdp !== 'string') {
        throw new Error('Invalid offer: SDP is missing or not a string');
      }

      // Check for ICE parameters in SDP
      const hasIceUfrag = offer.sdp.includes('ice-ufrag');
      const hasIcePwd = offer.sdp.includes('ice-pwd');

      if (!hasIceUfrag || !hasIcePwd) {
        console.warn('[DevicePreview] SDP offer missing ICE parameters:', {
          hasIceUfrag,
          hasIcePwd,
          sdpPreview: offer.sdp.substring(0, 500),
        });
      }

      // Validate ICE parameters in SDP before setting remote description
      const icePwdMatches = offer.sdp.matchAll(/ice-pwd:([^\r\n]+)/g);
      const iceUfragMatches = offer.sdp.matchAll(/ice-ufrag:([^\r\n]+)/g);

      const icePwds: string[] = [];
      for (const match of icePwdMatches) {
        if (match[1]) {
          icePwds.push(match[1]);
        }
      }

      // Check all ICE passwords
      for (const icePwd of icePwds) {
        if (icePwd.length < 22 || icePwd.length > 256) {
          console.error('[DevicePreview] Invalid ICE password detected:', {
            length: icePwd.length,
            expected: '22-256 characters',
            password: icePwd.substring(0, 10) + '...', // Log first 10 chars only
            sdpPreview: offer.sdp.substring(0, 1000), // Log first 1000 chars of SDP
          });
          throw new Error(
            `Invalid ICE password length: ${icePwd.length} characters (must be 22-256). This indicates the device sent a malformed SDP offer. Please check the device's WebRTC implementation.`
          );
        }
      }

      // Log SDP details for debugging
      console.log('[DevicePreview] Setting remote description with SDP:', {
        sdpLength: offer.sdp.length,
        hasIceUfrag: offer.sdp.includes('ice-ufrag'),
        hasIcePwd: offer.sdp.includes('ice-pwd'),
        icePwdCount: icePwds.length,
        sdpPreview: offer.sdp.substring(0, 500),
      });

      // Set remote description (offer from device)
      // This MUST succeed before we can create an answer
      try {
        console.log('[DevicePreview] Attempting to set remote description...', {
          signalingState: peerConnection.signalingState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
        });

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        // Wait a tick to ensure the description is actually set
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Verify it was actually set
        if (!peerConnection.remoteDescription) {
          throw new Error(
            'setRemoteDescription completed but remoteDescription is still null. This indicates the SDP offer is invalid.'
          );
        }

        // Verify signaling state changed to the expected state
        // After setting remote description with an offer, state should be 'have-remote-offer'
        if (peerConnection.signalingState !== 'have-remote-offer') {
          // 'stable' might occur in edge cases during renegotiation, but 'have-remote-offer' is expected
          const isUnexpected = peerConnection.signalingState !== 'stable';
          if (isUnexpected) {
            console.error(
              '[DevicePreview] CRITICAL: Unexpected signaling state after setRemoteDescription:',
              {
                expected: 'have-remote-offer',
                actual: peerConnection.signalingState,
                hasRemoteDescription: !!peerConnection.remoteDescription,
                connectionState: peerConnection.connectionState,
              }
            );
            throw new Error(
              `setRemoteDescription completed but signaling state is '${peerConnection.signalingState}' instead of 'have-remote-offer'. This indicates the SDP offer is invalid or the peer connection is in an invalid state.`
            );
          } else {
            console.warn(
              '[DevicePreview] Signaling state is "stable" after setRemoteDescription (unusual but may be valid):',
              {
                signalingState: peerConnection.signalingState,
                hasRemoteDescription: !!peerConnection.remoteDescription,
              }
            );
          }
        }

        console.log('[DevicePreview] Remote description set successfully', {
          signalingState: peerConnection.signalingState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
        });
      } catch (setRemoteError) {
        const errorMsg =
          setRemoteError instanceof Error
            ? setRemoteError.message
            : String(setRemoteError);
        console.error('[DevicePreview] Failed to set remote description:', {
          error: errorMsg,
          sdpPreview: offer.sdp.substring(0, 500),
          signalingState: peerConnection.signalingState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          errorStack:
            setRemoteError instanceof Error ? setRemoteError.stack : undefined,
        });
        throw new Error(
          `Failed to set remote description: ${errorMsg}. This usually means the SDP offer from the device is invalid or malformed. Check the device's WebRTC implementation.`
        );
      }

      // Final verification before proceeding - CRITICAL CHECK
      if (!peerConnection.remoteDescription) {
        console.error(
          '[DevicePreview] CRITICAL: Remote description is null after setRemoteDescription',
          {
            signalingState: peerConnection.signalingState,
            localDescription: peerConnection.localDescription?.type,
            connectionState: peerConnection.connectionState,
          }
        );
        throw new Error(
          'Remote description verification failed. setRemoteDescription appeared to succeed but remoteDescription is null. The SDP offer from the device is likely invalid or malformed.'
        );
      }

      // Check signaling state - should be 'have-remote-offer' after setting remote description
      // Note: 'stable' is also valid if we're renegotiating
      const validStates = ['have-remote-offer', 'stable'];
      if (!validStates.includes(peerConnection.signalingState)) {
        console.warn(
          '[DevicePreview] Unexpected signaling state after setRemoteDescription:',
          {
            expected: validStates,
            actual: peerConnection.signalingState,
            hasRemoteDescription: !!peerConnection.remoteDescription,
          }
        );
        // Don't throw - some states might be valid in edge cases
      }

      // CRITICAL: Verify connection is not closed
      if (
        peerConnection.connectionState === 'closed' ||
        peerConnection.connectionState === 'failed'
      ) {
        const errorMsg = `Cannot create answer: peer connection is ${peerConnection.connectionState}. Connection must be active.`;
        console.error('[DevicePreview]', errorMsg, {
          connectionState: peerConnection.connectionState,
          signalingState: peerConnection.signalingState,
        });
        throw new Error(
          `${errorMsg} The peer connection may have been closed or failed. Try restarting the preview.`
        );
      }

      // CRITICAL: Verify remote description exists before creating answer
      // This should never be null if setRemoteDescription succeeded
      if (!peerConnection.remoteDescription) {
        const errorMsg =
          'Cannot create answer: remote description is null. setRemoteDescription must have failed silently.';
        console.error('[DevicePreview]', errorMsg, {
          signalingState: peerConnection.signalingState,
          connectionState: peerConnection.connectionState,
          localDescription: peerConnection.localDescription?.type,
        });
        throw new Error(
          `${errorMsg} The SDP offer from the device is invalid. Check browser console for detailed SDP validation errors.`
        );
      }

      // CRITICAL: Verify signaling state is correct before creating answer
      // createAnswer() can only be called when signalingState is 'have-remote-offer' or 'have-local-pranswer'
      // According to WebRTC spec: https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-createanswer
      const validStatesForAnswer = ['have-remote-offer', 'have-local-pranswer'];
      if (!validStatesForAnswer.includes(peerConnection.signalingState)) {
        const errorMsg = `Cannot create answer: peer connection is in invalid signaling state '${peerConnection.signalingState}'. Expected one of: ${validStatesForAnswer.join(', ')}.`;
        console.error('[DevicePreview]', errorMsg, {
          signalingState: peerConnection.signalingState,
          connectionState: peerConnection.connectionState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          remoteDescriptionType: peerConnection.remoteDescription?.type,
          hasLocalDescription: !!peerConnection.localDescription,
          localDescriptionType: peerConnection.localDescription?.type,
        });
        throw new Error(
          `${errorMsg} This usually means setRemoteDescription failed or the peer connection was closed/reset. The SDP offer from the device may be invalid.`
        );
      }

      // Create answer
      console.log('[DevicePreview] Creating answer...', {
        signalingState: peerConnection.signalingState,
        hasRemoteDescription: !!peerConnection.remoteDescription,
        remoteDescriptionType: peerConnection.remoteDescription.type,
        connectionState: peerConnection.connectionState,
      });
      let answer: RTCSessionDescriptionInit;
      try {
        answer = await peerConnection.createAnswer();
        console.log('[DevicePreview] Answer created successfully', {
          answerType: answer.type,
          signalingState: peerConnection.signalingState,
        });
      } catch (createAnswerError) {
        const errorMsg =
          createAnswerError instanceof Error
            ? createAnswerError.message
            : String(createAnswerError);
        console.error('[DevicePreview] Failed to create answer:', {
          error: errorMsg,
          signalingState: peerConnection.signalingState,
          connectionState: peerConnection.connectionState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          remoteDescriptionType: peerConnection.remoteDescription?.type,
          hasLocalDescription: !!peerConnection.localDescription,
          localDescriptionType: peerConnection.localDescription?.type,
          errorStack:
            createAnswerError instanceof Error
              ? createAnswerError.stack
              : undefined,
        });

        // Provide more specific error messages based on the error
        if (
          errorMsg.includes('invalid state') ||
          errorMsg.includes('InvalidStateError')
        ) {
          throw new Error(
            `Failed to create answer: Peer connection is in invalid state '${peerConnection.signalingState}'. This usually means setRemoteDescription failed or the connection was closed. The SDP offer from the device is likely invalid or malformed.`
          );
        }

        throw new Error(
          `Failed to create answer: ${errorMsg}. Remote description may be invalid or the SDP offer from the device is malformed.`
        );
      }

      // Final check before setting local description
      if (!peerConnection.remoteDescription) {
        throw new Error(
          'Remote description is missing before setting local description. This should not happen if setRemoteDescription succeeded.'
        );
      }

      // Set local description (answer)
      // This requires that remote description is already set
      try {
        console.log('[DevicePreview] Setting local description (answer)...', {
          signalingState: peerConnection.signalingState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          answerType: answer.type,
        });

        await peerConnection.setLocalDescription(answer);

        // Verify it was set
        if (!peerConnection.localDescription) {
          throw new Error(
            'setLocalDescription completed but localDescription is still null'
          );
        }

        console.log(
          '[DevicePreview] Local description (answer) set successfully',
          {
            signalingState: peerConnection.signalingState,
            hasLocalDescription: !!peerConnection.localDescription,
          }
        );
      } catch (setLocalError) {
        const errorMsg =
          setLocalError instanceof Error
            ? setLocalError.message
            : String(setLocalError);
        console.error('[DevicePreview] Failed to set local description:', {
          error: errorMsg,
          signalingState: peerConnection.signalingState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          remoteDescriptionType: peerConnection.remoteDescription?.type,
          hasLocalDescription: !!peerConnection.localDescription,
          answerType: answer.type,
          errorStack:
            setLocalError instanceof Error ? setLocalError.stack : undefined,
        });

        // Provide more specific error message
        if (errorMsg.includes('no pending remote description')) {
          throw new Error(
            `Failed to set local answer: The remote description was not set or was cleared. This indicates the SDP offer from the device is invalid. Original error: ${errorMsg}`
          );
        }

        throw new Error(
          `Failed to set local answer: ${errorMsg}. Check that the remote description was properly set.`
        );
      }

      // Send answer to device via WebSocket
      if (!answer.sdp) {
        throw new Error('Answer SDP is missing. Cannot send answer to device.');
      }

      const ws = getWebSocketConnection();
      if (ws) {
        const message = {
          type: 'preview.answer',
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            type: 'answer',
            sdp: answer.sdp,
            offer_id: currentOfferId,
          },
        };
        console.log('[DevicePreview] 📤 Sending preview.answer to device', {
          messageId: message.id,
          answerSdpLength: answer.sdp.length,
          answerSdpPreview: answer.sdp.substring(0, 200),
          wsReadyState: ws.readyState,
          wsUrl: ws.url,
          fullMessage: JSON.stringify(message).substring(0, 500), // Log first 500 chars for debugging
        });

        try {
          ws.send(JSON.stringify(message));
          console.log(
            '[DevicePreview] ✅ preview.answer sent successfully to device',
            {
              messageId: message.id,
              messageType: message.type,
              payloadType: message.payload.type,
            }
          );

          // Log connection state after sending answer (immediate check)
          console.log(
            '[DevicePreview] Connection state immediately after sending answer:',
            {
              connectionState: peerConnection.connectionState,
              iceConnectionState: peerConnection.iceConnectionState,
              iceGatheringState: peerConnection.iceGatheringState,
              signalingState: peerConnection.signalingState,
              hasRemoteDescription: !!peerConnection.remoteDescription,
              hasLocalDescription: !!peerConnection.localDescription,
            }
          );

          // Log connection state after a delay to see if it changes
          setTimeout(() => {
            console.log(
              '[DevicePreview] Connection state 2 seconds after sending answer:',
              {
                connectionState: peerConnection?.connectionState,
                iceConnectionState: peerConnection?.iceConnectionState,
                signalingState: peerConnection?.signalingState,
                note: 'If still "new", device may not have processed the answer',
              }
            );
          }, 2000);
        } catch (sendError) {
          console.error(
            '[DevicePreview] ❌ Failed to send preview.answer:',
            sendError
          );
          throw new Error(
            `Failed to send answer to device: ${sendError instanceof Error ? sendError.message : String(sendError)}`
          );
        }
      } else {
        const errorMsg =
          'Cannot send answer: WebSocket connection not available';
        console.error('[DevicePreview] ❌', errorMsg, {
          sharedWsConnection: !!sharedWsConnection.value,
          wsReadyState: sharedWsConnection.value?.readyState,
        });
        throw new Error(errorMsg);
      }

      // Process any pending ICE candidates that arrived before remote description was set
      if (pendingIceCandidates.length > 0) {
        console.log(
          `[DevicePreview] Processing ${pendingIceCandidates.length} pending ICE candidates`
        );
        for (const candidate of pendingIceCandidates) {
          await handleIceCandidate(candidate);
        }
        pendingIceCandidates = [];
      }

      // Clear offer timeout - offer received and processed successfully
      if (offerTimeout) {
        clearTimeout(offerTimeout);
        offerTimeout = null;
      }

      // Clear any command timeout errors - we successfully received and processed the offer
      if (error.value && error.value.includes('Command')) {
        error.value = null;
        console.log(
          '[DevicePreview] Offer received successfully, cleared command timeout error'
        );
      }

      // Update connection state to indicate we're waiting for ICE connection
      // BUT: Don't overwrite 'connected' if the track event already fired and set it to 'connected'
      // The track event can fire before we finish processing the offer
      if (connectionState.value !== 'connected') {
        connectionState.value = 'connecting';
      } else {
        console.log(
          '[DevicePreview] Connection already connected (track event fired), keeping state as connected'
        );
      }

      // Log connection state after sending answer for diagnostics
      console.log('[DevicePreview] Connection state after processing offer:', {
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        iceGatheringState: peerConnection.iceGatheringState,
        signalingState: peerConnection.signalingState,
        hasRemoteDescription: !!peerConnection.remoteDescription,
        hasLocalDescription: !!peerConnection.localDescription,
        uiConnectionState: connectionState.value, // Include our UI state
        hasPreviewStream: !!previewStream.value, // Check if stream is already set
      });

      // Set up periodic diagnostics while connecting
      if (diagnosticsInterval) {
        clearInterval(diagnosticsInterval);
      }
      diagnosticsInterval = setInterval(() => {
        // Stop diagnostics if connection is established (connected or failed) or no peer connection
        if (
          !peerConnection ||
          connectionState.value === 'connected' ||
          connectionState.value === 'failed'
        ) {
          if (diagnosticsInterval) {
            clearInterval(diagnosticsInterval);
            diagnosticsInterval = null;
          }
          return;
        }

        // Also stop if we have a preview stream (connection is working)
        if (previewStream.value) {
          console.log(
            '[DevicePreview] ✅ Preview stream detected, stopping diagnostics'
          );
          if (diagnosticsInterval) {
            clearInterval(diagnosticsInterval);
            diagnosticsInterval = null;
          }
          // Ensure connection state is 'connected' if we have a stream
          // At this point connectionState.value can be 'disconnected' or 'connecting'
          const currentState = connectionState.value;
          if (
            currentState === 'disconnected' ||
            currentState === 'connecting'
          ) {
            connectionState.value = 'connected';
            console.log(
              '[DevicePreview] ✅✅✅ Connection state updated to connected (stream detected)'
            );
          }
          return;
        }

        console.log(
          '[DevicePreview] 🔍 Connection diagnostics (still connecting):',
          {
            connectionState: peerConnection.connectionState,
            iceConnectionState: peerConnection.iceConnectionState,
            iceGatheringState: peerConnection.iceGatheringState,
            signalingState: peerConnection.signalingState,
            hasRemoteDescription: !!peerConnection.remoteDescription,
            hasLocalDescription: !!peerConnection.localDescription,
            receiversCount: peerConnection.getReceivers().length,
            transceiversCount: peerConnection.getTransceivers().length,
            currentTime: new Date().toISOString(),
          }
        );

        // If stuck in connecting for extended period, log warning
        if (
          connectionState.value === 'connecting' &&
          peerConnection.connectionState === 'connecting'
        ) {
          console.warn(
            '[DevicePreview] ⚠️ Connection stuck in connecting state for extended period',
            {
              connectionState: peerConnection.connectionState,
              iceConnectionState: peerConnection.iceConnectionState,
              signalingState: peerConnection.signalingState,
              suggestion:
                'Check if device received preview.answer and preview.ice_candidate messages',
            }
          );
        }
      }, 5000); // Every 5 seconds

      // Clear diagnostics when connection state changes
      const stopDiagnostics = watch(
        () => connectionState.value,
        (newState) => {
          if (newState !== 'connecting') {
            if (diagnosticsInterval) {
              clearInterval(diagnosticsInterval);
              diagnosticsInterval = null;
            }
            stopDiagnostics();
          }
        }
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to handle preview offer';

      // Provide more helpful error messages
      let userFriendlyError = errorMessage;
      if (errorMessage.includes('ICE pwd')) {
        userFriendlyError =
          'Device sent invalid WebRTC offer (ICE password format error). This is a device-side issue. Please check the device firmware and WebRTC implementation.';
      } else if (errorMessage.includes('Invalid ICE password length')) {
        userFriendlyError = errorMessage; // Already user-friendly
      } else if (errorMessage.includes('Failed to apply the description')) {
        userFriendlyError =
          'Failed to process WebRTC offer from device. The device may have sent a malformed SDP. Please check device logs.';
      }

      console.error('[DevicePreview] Failed to handle preview offer:', {
        error: errorMessage,
        offerType: offer.type,
        sdpLength: offer.sdp?.length,
        sdpPreview: offer.sdp?.substring(0, 200),
      });

      error.value = userFriendlyError;
      connectionState.value = 'failed';
      cleanup();
    } finally {
      isProcessingOffer = false;
    }
  }

  /**
   * Handle preview.ice_candidate message from device
   */
  async function handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!peerConnection) {
      console.warn(
        '[DevicePreview] Cannot add ICE candidate: peer connection not initialized'
      );
      return;
    }

    // If remote description is not set yet, queue the candidate
    // ICE candidates can arrive before the remote description is set
    if (!peerConnection.remoteDescription) {
      console.log(
        '[DevicePreview] Queueing ICE candidate (remote description not set yet)'
      );
      pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid || undefined,
          sdpMLineIndex: candidate.sdpMLineIndex || undefined,
        })
      );
      console.log(
        '[DevicePreview] ✅ ICE candidate from device added successfully',
        {
          candidate: candidate.candidate?.substring(0, 100),
          connectionState: peerConnection.connectionState,
          iceConnectionState: peerConnection.iceConnectionState,
          signalingState: peerConnection.signalingState,
        }
      );

      // Check if this triggers a state change
      setTimeout(() => {
        console.log(
          '[DevicePreview] Connection state after adding ICE candidate:',
          {
            connectionState: peerConnection?.connectionState,
            iceConnectionState: peerConnection?.iceConnectionState,
            signalingState: peerConnection?.signalingState,
          }
        );
      }, 100);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        '[DevicePreview] ❌ Failed to add ICE candidate from device:',
        {
          error: errorMsg,
          candidate: candidate.candidate?.substring(0, 150),
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          signalingState: peerConnection.signalingState,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          connectionState: peerConnection.connectionState,
          iceConnectionState: peerConnection.iceConnectionState,
        }
      );
    }
  }

  // Store cleanup function for WebSocket listeners
  let wsCleanup: (() => void) | null = null;

  /**
   * Setup WebSocket message listeners for preview messages
   * We'll use a custom event system to receive messages from useDeviceConnectionStatus
   */
  function setupWebSocketListeners() {
    if (!deviceId.value) return null;

    // Use a custom event listener to receive preview messages
    // The messages will be forwarded from useDeviceConnectionStatus via window events
    // or we can extend useDeviceConnectionStatus to emit preview messages
    const messageHandler = (event: CustomEvent) => {
      const message = event.detail;

      try {
        // Handle preview.offer
        // Expected format:
        // {
        //   type: 'preview.offer',
        //   id: string (UUID),
        //   timestamp: string (ISO 8601),
        //   payload: {
        //     type: 'offer',
        //     sdp: string // WebRTC SDP offer string
        //   }
        // }
        // OR payload could be directly the SDP string
        if (message.type === 'preview.offer' && message.payload) {
          console.log('[DevicePreview] Preview offer received via WebSocket!', {
            messageId: message.id,
            timestamp: message.timestamp,
            hasPayload: !!message.payload,
            payloadType: typeof message.payload,
            payloadKeys:
              typeof message.payload === 'object'
                ? Object.keys(message.payload)
                : [],
            currentConnectionState: connectionState.value,
            currentError: error.value,
          });

          // Store offer_id for answer correlation
          currentOfferId = message.payload?.offer_id ?? message.id ?? null;

          // Clear any command timeout errors - we received the offer!
          if (
            error.value &&
            (error.value.includes('Command') || error.value.includes('timeout'))
          ) {
            console.log(
              '[DevicePreview] Clearing command timeout error - offer received successfully'
            );
            error.value = null;
          }

          // Ensure connection state allows processing (reset to connecting if it was failed due to command timeout)
          if (
            connectionState.value === 'failed' &&
            error.value &&
            error.value.includes('Command')
          ) {
            console.log(
              '[DevicePreview] Resetting connection state to connecting - offer received despite command timeout'
            );
            connectionState.value = 'connecting';
          }

          // Extract SDP from payload - handle different payload structures
          let sdpString: string | undefined;

          if (typeof message.payload === 'string') {
            // Payload is directly the SDP string
            sdpString = message.payload;
          } else if (
            message.payload.sdp &&
            typeof message.payload.sdp === 'string'
          ) {
            // Payload has sdp property (preferred format)
            sdpString = message.payload.sdp;
          } else if (message.payload.type === 'offer' && message.payload.sdp) {
            // Payload is an RTCSessionDescriptionInit-like object
            sdpString = message.payload.sdp;
          }

          if (!sdpString || typeof sdpString !== 'string') {
            console.error('[DevicePreview] Invalid SDP in preview.offer:', {
              payloadType: typeof message.payload,
              payloadKeys:
                typeof message.payload === 'object'
                  ? Object.keys(message.payload)
                  : [],
              payload: message.payload,
            });
            error.value =
              'Invalid SDP offer format from device. Expected payload.sdp to be a string.';
            connectionState.value = 'failed';
            return;
          }

          // Validate SDP format (basic check)
          if (!sdpString.includes('v=') || !sdpString.includes('m=')) {
            console.error(
              '[DevicePreview] Malformed SDP:',
              sdpString.substring(0, 200)
            );
            error.value =
              'Malformed SDP offer from device. SDP must be a valid WebRTC SDP string.';
            connectionState.value = 'failed';
            return;
          }

          // Log SDP for debugging (first 500 chars)
          console.log('[DevicePreview] Received SDP offer, processing...', {
            sdpLength: sdpString.length,
            sdpPreview: sdpString.substring(0, 500),
            hasIceUfrag: sdpString.includes('ice-ufrag'),
            hasIcePwd: sdpString.includes('ice-pwd'),
            currentConnectionState: connectionState.value,
          });

          const offer: RTCSessionDescriptionInit = {
            type: 'offer',
            sdp: sdpString,
          };

          // Process the offer (this will create answer and establish connection)
          handlePreviewOffer(offer);
        }

        // Handle preview.ice_candidate
        if (message.type === 'preview.ice_candidate' && message.payload) {
          console.log(
            '[DevicePreview] 📥 Received preview.ice_candidate FROM DEVICE',
            {
              messageId: message.id,
              candidate: message.payload.candidate?.substring(0, 150),
              sdpMid: message.payload.sdpMid,
              sdpMLineIndex: message.payload.sdpMLineIndex,
              currentConnectionState: peerConnection?.connectionState,
              currentIceConnectionState: peerConnection?.iceConnectionState,
            }
          );
          handleIceCandidate(message.payload);
        }

        // Handle preview.started event
        if (message.type === 'event' && message.event === 'preview.started') {
          isPreviewActive.value = true;
          connectionState.value = 'connecting';
        }

        // Handle preview.stopped event
        if (message.type === 'event' && message.event === 'preview.stopped') {
          isPreviewActive.value = false;
          cleanup();
        }
      } catch (err) {
        console.warn('Failed to parse preview message:', err);
      }
    };

    // Listen for preview messages via custom event
    const eventName = `preview-message-${deviceId.value}`;
    window.addEventListener(eventName, messageHandler as EventListener);

    // Also try to get WebSocket directly for sending messages
    // We'll need to access it from the shared state
    // For now, we'll use a polling approach or extend useDeviceConnectionStatus
    // TODO: Extend useDeviceConnectionStatus to expose WebSocket connection

    // Return cleanup function
    return () => {
      window.removeEventListener(eventName, messageHandler as EventListener);
    };
  }

  /**
   * Get WebSocket connection for sending messages
   */
  function getWebSocketConnection(): WebSocket | null {
    const ws = sharedWsConnection.value;
    if (!ws) return null;
    if (ws.readyState !== WebSocket.OPEN) return null;
    return ws;
  }

  /**
   * Start preview
   */
  async function startPreview(quality?: PreviewQuality) {
    if (!deviceId.value) {
      error.value = 'Device ID is required';
      return;
    }

    if (isPreviewActive.value) {
      console.warn('Preview is already active');
      return;
    }

    connectionState.value = 'connecting';
    error.value = null;

    // Setup WebSocket listeners FIRST - we need these even if command times out
    wsCleanup = setupWebSocketListeners();

    // Set timeout for offer (device should send offer within 30 seconds)
    // This is independent of the command timeout - we want to wait for the offer
    offerTimeout = setTimeout(() => {
      if (connectionState.value === 'connecting') {
        error.value =
          'Preview offer timeout - device did not send offer within 30 seconds';
        connectionState.value = 'failed';
        cleanup();
      }
    }, OFFER_TIMEOUT_MS);

    try {
      // Send preview.start command
      // Note: Even if this times out, we still want to wait for preview.offer message
      // The device may send the offer even if the ACK is delayed
      const response = await sendCommand('preview.start', {
        quality: quality || {
          width: 640,
          height: 360,
          framerate: 15,
          bitrate: 500,
        },
      });

      if (!response.success) {
        // Command failed, but don't cleanup yet - wait for offer timeout
        // The device might still send the offer via WebSocket
        console.warn(
          '[DevicePreview] Command failed but continuing to wait for offer:',
          response.error
        );
        error.value = `Command failed: ${response.error || 'Unknown error'}. Waiting for preview offer...`;
        // Don't set connectionState to 'failed' yet - wait for offer timeout
        // Don't cleanup - keep listeners active to receive preview.offer
      } else {
        // Command succeeded - clear any previous errors
        error.value = null;
      }

      // Note: The actual WebRTC offer should come via WebSocket preview.offer message
      // The device may also include it in the ACK response, but we prefer WebSocket
      // to avoid duplicate processing. Only process ACK offer if we haven't received
      // a WebSocket offer within a short timeout.
      if (response.ack?.payload?.offer) {
        console.log(
          '[DevicePreview] Offer found in ACK response, but waiting for WebSocket offer (preferred)...'
        );
        // Don't process ACK offer immediately - let WebSocket handler take precedence
        // The WebSocket preview.offer message will be processed by setupWebSocketListeners
        // This prevents duplicate processing which can cause "invalid state" errors
      }
    } catch (err) {
      const errorMessage = (err as any)?.message ?? 'Failed to start preview';
      const isServiceNotAvailable =
        errorMessage.includes('not available') ||
        errorMessage.includes('service not available');

      if (isServiceNotAvailable) {
        // Preview/realtime service is down - fail immediately, don't wait for offer
        error.value =
          t('broadcastBox.preview.error.serviceNotAvailable') ||
          'Preview is not available for this device. The preview or realtime service may be offline.';
        connectionState.value = 'failed';
        cleanup();
        console.warn(
          '[DevicePreview] Service not available, failing preview:',
          errorMessage
        );
      } else {
        // Command timed out or other error - keep waiting for offer from device
        console.warn(
          '[DevicePreview] Command error but continuing to wait for offer:',
          errorMessage
        );
        error.value = `Command error: ${errorMessage}. Waiting for preview offer...`;
      }
    }
  }

  /**
   * Stop preview
   */
  async function stopPreview() {
    if (!deviceId.value) {
      return;
    }

    try {
      await sendCommand('preview.stop', {});
      cleanup();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to stop preview';
      error.value = errorMessage;
    }
  }

  /**
   * Retry connection
   */
  function retryConnection() {
    if (previewStream.value) {
      // If we have a stream, just restart
      stopPreview().then(() => {
        setTimeout(() => {
          startPreview();
        }, 1000);
      });
    } else {
      startPreview();
    }
  }

  /**
   * Cleanup WebRTC connection and resources
   */
  function cleanup() {
    // Reset processing flags
    isProcessingOffer = false;
    currentOfferId = null;
    pendingIceCandidates = [];

    // Cleanup WebSocket listeners
    if (wsCleanup) {
      wsCleanup();
      wsCleanup = null;
    }

    // Clear timeouts and intervals
    if (offerTimeout) {
      clearTimeout(offerTimeout);
      offerTimeout = null;
    }
    if (disconnectRecoveryTimeout) {
      clearTimeout(disconnectRecoveryTimeout);
      disconnectRecoveryTimeout = null;
    }

    if (diagnosticsInterval) {
      clearInterval(diagnosticsInterval);
      diagnosticsInterval = null;
    }

    // Close peer connection
    if (peerConnection) {
      // Stop all tracks
      peerConnection.getReceivers().forEach((receiver) => {
        if (receiver.track) {
          receiver.track.stop();
        }
      });

      peerConnection.close();
      peerConnection = null;
    }

    // Clear stream
    if (previewStream.value) {
      previewStream.value.getTracks().forEach((track) => track.stop());
      previewStream.value = null;
    }
    combinedStream = null;

    // Update state
    isPreviewActive.value = false;
    if (connectionState.value !== 'failed') {
      connectionState.value = 'disconnected';
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup();
  });

  return {
    // State
    isPreviewActive,
    connectionState,
    error,
    previewStream,
    isDeviceConnected: computed(() => {
      const ws = sharedWsConnection.value;
      return ws?.readyState === WebSocket.OPEN;
    }),

    // Methods
    startPreview,
    stopPreview,
    retryConnection,
    cleanup,
  };
}
