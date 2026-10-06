import { usePage } from '@inertiajs/react';
import Pusher from 'pusher-js';
import { useEffect, useRef, useState } from 'react';

import { jsonRequest } from '@/lib/customer';

// ─── Realtime updates over Pusher Channels ────────────────────────────────────
//
// Events are signals, not data: when one arrives the screen re-fetches through its
// normal endpoint. Pages keep a slow poll as a safety net, so everything still
// works (just less promptly) when realtime is switched off or the socket drops.

/** Shared by the server on staff pages (HandleInertiaRequests); null when realtime is off. */
export interface RealtimeConfig {
    key: string;
    cluster: string;
    /** This branch's dining floor — table statuses and table tickets. */
    floor_channel: string | null;
}

/** Sent by App\Events\TableFloorChanged. */
const FLOOR_CHANGED = 'floor.changed';

/** How long an unused channel / connection is kept before it is closed. */
const RELEASE_DELAY = 2000;

let client: Pusher | null = null;
let clientId = '';
const subscribers = new Map<string, number>();

function connect(key: string, cluster: string): Pusher {
    const id = `${key}@${cluster}`;
    if (client && clientId === id) return client;

    client?.disconnect();
    subscribers.clear();
    clientId = id;
    client = new Pusher(key, {
        cluster,
        channelAuthorization: {
            endpoint: '/broadcasting/auth',
            transport: 'ajax',
            // Private channels are authorised by Laravel with the staff session + CSRF token.
            customHandler: ({ socketId, channelName }, callback) => {
                jsonRequest<{ auth: string }>('/broadcasting/auth', { method: 'POST', body: { socket_id: socketId, channel_name: channelName } })
                    .then((data) => callback(null, data))
                    .catch((e: Error) => callback(e, null));
            },
        },
    });
    return client;
}

/** Drop a channel nobody listens to any more, and the connection once it has no channels left. */
function release(pusher: Pusher, channel: string) {
    if (pusher !== client) return;
    subscribers.set(channel, (subscribers.get(channel) ?? 1) - 1);
    window.setTimeout(() => {
        if (pusher !== client || (subscribers.get(channel) ?? 0) > 0) return;
        subscribers.delete(channel);
        pusher.unsubscribe(channel);
        if (subscribers.size === 0) {
            pusher.disconnect();
            client = null;
        }
    }, RELEASE_DELAY);
}

/**
 * Calls `onEvent` whenever `event` arrives on `channel`, and once each time the
 * subscription (re)connects so anything missed while offline is picked up.
 *
 * Returns true while the subscription is live, so the caller can relax its polling.
 */
export function useRealtime(channel: string | null | undefined, event: string, onEvent: () => void): boolean {
    const { realtime } = usePage<{ realtime?: RealtimeConfig | null }>().props;
    const key = realtime?.key;
    const cluster = realtime?.cluster;
    const [live, setLive] = useState(false);
    const handler = useRef(onEvent);

    useEffect(() => {
        handler.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        if (!key || !cluster || !channel) return;

        const pusher = connect(key, cluster);
        subscribers.set(channel, (subscribers.get(channel) ?? 0) + 1);
        const subscription = pusher.subscribe(channel);

        const onMessage = () => handler.current();
        const onSubscribed = () => {
            setLive(true);
            handler.current();
        };
        const onLost = () => setLive(false);
        const onState = ({ current }: { current: string }) => {
            if (current !== 'connected') setLive(false);
        };

        subscription.bind(event, onMessage);
        subscription.bind('pusher:subscription_succeeded', onSubscribed);
        subscription.bind('pusher:subscription_error', onLost);
        pusher.connection.bind('state_change', onState);
        if (subscription.subscribed) onSubscribed();

        return () => {
            subscription.unbind(event, onMessage);
            subscription.unbind('pusher:subscription_succeeded', onSubscribed);
            subscription.unbind('pusher:subscription_error', onLost);
            pusher.connection.unbind('state_change', onState);
            setLive(false);
            release(pusher, channel);
        };
    }, [key, cluster, channel, event]);

    return live;
}

/** Fires when a table's status or a table ticket changes at the signed-in staff member's branch. */
export function useFloorUpdates(onChange: () => void): boolean {
    const { realtime } = usePage<{ realtime?: RealtimeConfig | null }>().props;
    return useRealtime(realtime?.floor_channel, FLOOR_CHANGED, onChange);
}
