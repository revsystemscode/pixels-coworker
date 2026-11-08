import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  VideoPresets,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from 'livekit-client';

export function openCamera(deviceId: string | null): Promise<LocalVideoTrack> {
  return createLocalVideoTrack({
    ...(deviceId ? { deviceId } : {}),
    resolution: VideoPresets.h360.resolution,
  });
}

export function openMicrophone(deviceId: string | null): Promise<LocalAudioTrack> {
  return createLocalAudioTrack({
    ...(deviceId ? { deviceId } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
}
