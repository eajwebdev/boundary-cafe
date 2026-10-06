/**
 * Camera, GPS and face helpers for employee clock-in and face enrollment.
 *
 * The face model (≈7 MB, served from /models/face-api) is loaded only when a
 * page actually needs it. The browser turns a face into 128 numbers (the
 * "descriptor"); the server compares descriptors, so matching cannot be faked
 * by the page simply saying "it matched".
 */
import type * as FaceApi from '@vladmandic/face-api';

const MODEL_URL = '/models/face-api';
const PHOTO_SIZE = 240;
const MAX_PHOTO_BYTES = 45 * 1024;

let faceApi: Promise<typeof FaceApi> | null = null;

export function loadFaceApi(): Promise<typeof FaceApi> {
    faceApi ??= (async () => {
        const api = await import('@vladmandic/face-api');
        await Promise.all([
            api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        return api;
    })().catch((error) => {
        faceApi = null;
        throw error;
    });

    return faceApi;
}

export interface FaceCapture {
    descriptor: number[];
    /** Small JPEG data URL (a few KB) of the cropped face. */
    photo: string;
}

/** Enrollment needs at least this many samples (the server enforces the same). */
export const MIN_ENROLL_SAMPLES = 4;

/** Same value as the server's match threshold: samples further apart than this are not the same face. */
const SAME_FACE_DISTANCE = 0.5;

/** Enrollment shots must be confident and close enough to the camera to be reliable. */
const MIN_ENROLL_SCORE = 0.7;
const MIN_ENROLL_FACE_RATIO = 0.22;

/** Detect exactly one face in the video frame and return its descriptor + a small photo. */
export async function captureFace(video: HTMLVideoElement, options: { strict?: boolean } = {}): Promise<FaceCapture> {
    const api = await loadFaceApi();
    const results = await api
        .detectAllFaces(video, new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

    if (results.length === 0) {
        throw new Error('No face found. Look at the camera in good light.');
    }
    if (results.length > 1) {
        throw new Error('More than one face is in view. Only one person should be in the frame.');
    }

    const { box, score } = results[0].detection;

    if (options.strict) {
        if (box.width / video.videoWidth < MIN_ENROLL_FACE_RATIO) {
            throw new Error('The face is too far away. Move closer so the face fills the oval.');
        }
        if (score < MIN_ENROLL_SCORE) {
            throw new Error('The face is not clear enough. Improve the lighting and hold still.');
        }
    }

    return { descriptor: Array.from(results[0].descriptor), photo: cropToJpeg(video, box) };
}

export function faceDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

/** Index of the first sample that does not look like the rest, or null when they all agree. */
export function findInconsistentSample(samples: number[][]): number | null {
    const mean = samples[0].map((_, index) => samples.reduce((sum, sample) => sum + sample[index], 0) / samples.length);
    const outlier = samples.findIndex((sample) => faceDistance(sample, mean) > SAME_FACE_DISTANCE);

    return outlier === -1 ? null : outlier;
}

/** Square crop around the face with some margin, downscaled and compressed to a few KB. */
function cropToJpeg(video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number }): string {
    const margin = Math.max(box.width, box.height) * 0.35;
    const side = Math.max(box.width, box.height) + margin * 2;
    const sx = Math.max(0, box.x + box.width / 2 - side / 2);
    const sy = Math.max(0, box.y + box.height / 2 - side / 2);
    const sSide = Math.min(side, video.videoWidth - sx, video.videoHeight - sy);

    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    canvas.getContext('2d')?.drawImage(video, sx, sy, sSide, sSide, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

    let quality = 0.75;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length * 0.75 > MAX_PHOTO_BYTES && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    return dataUrl;
}

/** Start the front camera in a <video>; returns the stream so the caller can stop it. */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('The camera only works over HTTPS (or on this computer via localhost).');
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();

        return stream;
    } catch (error) {
        const name = (error as DOMException)?.name;
        throw new Error(
            name === 'NotAllowedError'
                ? 'Camera access was blocked. Allow the camera for this site and try again.'
                : name === 'NotFoundError'
                  ? 'No camera was found on this device.'
                  : 'The camera could not be started.',
        );
    }
}

export function stopCamera(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.stop());
}

export interface Position {
    latitude: number;
    longitude: number;
    accuracy: number;
}

/** One fresh, high-accuracy GPS fix. */
export function getPosition(): Promise<Position> {
    return new Promise((resolve, reject) => {
        if (!window.isSecureContext || !navigator.geolocation) {
            reject(new Error('Location only works over HTTPS (or on this computer via localhost).'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            (error) =>
                reject(
                    new Error(
                        error.code === error.PERMISSION_DENIED
                            ? 'Location access was blocked. Allow location for this site and try again.'
                            : 'Your location could not be found. Turn on GPS and try again.',
                    ),
                ),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        );
    });
}

/** Straight-line distance in metres (preview only; the server decides). */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
    const r = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;

    return Math.round(2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
