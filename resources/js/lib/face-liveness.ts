/**
 * Live face check for the time clock, so a photo, a recorded video or a video
 * call shown to the camera cannot clock someone in.
 *
 * The server picks the steps (turn left, turn right, open mouth) in a random
 * order. This watches the camera until each step is done and takes a face
 * sample at that moment; the server then checks every number again.
 *
 * - A photo cannot open its mouth.
 * - Tilting a flat photo or screen keeps the nose tip on the line between the
 *   eyes and the mouth; only a real 3D head moves the nose off that line.
 * - A recording cannot follow steps whose order changes every time.
 */
import { captureFace, detectLandmarks, type FaceCapture, type Point } from '@/lib/face-capture';

export type LivenessAction = 'turn_left' | 'turn_right' | 'open_mouth';

export type LivenessPrompt = 'look_straight' | LivenessAction;

export interface LivenessStep {
    action: LivenessAction;
    descriptor: number[];
    turn: number;
    mouth: number;
}

export interface LivenessResult {
    /** The straight-ahead sample used for the face match and the attendance photo. */
    face: FaceCapture;
    neutral: { turn: number; mouth: number };
    steps: LivenessStep[];
    camera: string;
}

export interface LivenessThresholds {
    min_head_turn: number;
    min_mouth_open: number;
}

const STEP_TIMEOUT_MS = 15000;
const POLL_MS = 100;

/** Ask for a little more than the server needs, so a borderline frame still passes there. */
const MARGIN = 0.03;

/** "Looking straight" allows a slight natural turn and a slightly open mouth. */
const STRAIGHT_MAX_TURN = 0.1;
const STRAIGHT_MAX_MOUTH = 0.15;

/** Same list as the server: software that feeds in a video instead of a real camera. */
const VIRTUAL_CAMERA = /virtual|\bobs\b|manycam|snap camera|xsplit|splitcam|droidcam|epoccam|iriun|\bcamo\b|\bndi\b|vcam|youcam/i;

const mean = (points: Point[]): Point => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});

const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * How far the nose tip sits off the eye–mouth line, as a share of the eye
 * distance. Positive = toward the right of the (unmirrored) camera image,
 * which is the person's own left.
 */
export function headTurn(points: Point[]): number {
    const leftEye = mean(points.slice(36, 42));
    const rightEye = mean(points.slice(42, 48));
    const eyes = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
    const mouth = mean(points.slice(48, 60));
    const nose = points[30];

    const eyeGap = gap(leftEye, rightEye);
    const axisLength = gap(eyes, mouth);
    if (!eyeGap || !axisLength) return 0;

    // Unit vector across the face, pointing to the image's right.
    const sideX = (mouth.y - eyes.y) / axisLength;
    const sideY = -(mouth.x - eyes.x) / axisLength;

    return ((nose.x - eyes.x) * sideX + (nose.y - eyes.y) * sideY) / eyeGap;
}

/** Inner lip opening ÷ mouth width: about 0 when closed, 0.5+ when wide open. */
export function mouthOpen(points: Point[]): number {
    const width = gap(points[60], points[64]);

    return width ? gap(points[62], points[66]) / width : 0;
}

export function cameraLabel(video: HTMLVideoElement): string {
    return (video.srcObject as MediaStream | null)?.getVideoTracks()[0]?.label ?? '';
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Watch the camera until `done` holds, then take a face sample from a frame where it still holds. */
async function waitFor(video: HTMLVideoElement, done: (turn: number, mouth: number) => boolean, signal: AbortSignal): Promise<FaceCapture> {
    const deadline = Date.now() + STEP_TIMEOUT_MS;

    while (Date.now() < deadline) {
        signal.throwIfAborted();
        const points = await detectLandmarks(video);
        if (points && done(headTurn(points), mouthOpen(points))) {
            // The descriptor and the measurement must come from the same picture.
            const capture = await captureFace(video).catch(() => null);
            if (capture && done(headTurn(capture.landmarks), mouthOpen(capture.landmarks))) {
                return capture;
            }
        }
        await sleep(POLL_MS);
    }

    throw new Error('Time ran out for this step. Tap the button to try again.');
}

export async function runLivenessCheck(
    video: HTMLVideoElement,
    actions: LivenessAction[],
    thresholds: LivenessThresholds,
    onPrompt: (prompt: LivenessPrompt, step: number) => void,
    signal: AbortSignal,
): Promise<LivenessResult> {
    const camera = cameraLabel(video);
    if (VIRTUAL_CAMERA.test(camera)) {
        throw new Error("A virtual camera was detected. Use your phone's own camera.");
    }

    onPrompt('look_straight', 0);
    const face = await waitFor(video, (turn, mouth) => Math.abs(turn) <= STRAIGHT_MAX_TURN && mouth <= STRAIGHT_MAX_MOUTH, signal);
    const neutral = { turn: headTurn(face.landmarks), mouth: mouthOpen(face.landmarks) };

    const needTurn = thresholds.min_head_turn + MARGIN;
    const needMouth = thresholds.min_mouth_open + MARGIN;
    const isDone: Record<LivenessAction, (turn: number, mouth: number) => boolean> = {
        turn_left: (turn) => turn - neutral.turn >= needTurn,
        turn_right: (turn) => neutral.turn - turn >= needTurn,
        open_mouth: (_turn, mouth) => mouth - neutral.mouth >= needMouth,
    };

    const steps: LivenessStep[] = [];
    for (const [index, action] of actions.entries()) {
        onPrompt(action, index + 1);
        const capture = await waitFor(video, isDone[action], signal);
        steps.push({ action, descriptor: capture.descriptor, turn: headTurn(capture.landmarks), mouth: mouthOpen(capture.landmarks) });
    }

    return { face, neutral, steps, camera };
}
