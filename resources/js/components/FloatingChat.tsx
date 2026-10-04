'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePage } from '@inertiajs/react';
import { cn } from '@/lib/utils';
import {
    Bot,
    X,
    Send,
    Loader2,
    Sparkles,
    TrendingUp,
    Package,
    AlertTriangle,
    Wallet,
    BarChart2,
    Star,
    XCircle,
    TrendingDown,
    Clock,
    CreditCard,
    Tag,
    ShoppingBag,
    Calendar,
    Activity,
    Hash,
    Building2,
    RefreshCw,
    CalendarClock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DataItem {
    label: string;
    value: string;
    badge?: string;
}
interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    items?: DataItem[];
    timestamp: Date;
}

// ─── Quick actions shown before any message is sent ──────────────────────────
const QUICK_ACTIONS = [
    { label: 'Sales Today', message: 'What are my sales today?', icon: TrendingUp },
    { label: 'Yesterday', message: 'Sales yesterday', icon: Calendar },
    { label: 'This Week', message: "This week's sales", icon: Activity },
    { label: 'This Month', message: 'What are my sales this month?', icon: Package },
    { label: 'Net Income', message: 'Net income today', icon: BarChart2 },
    { label: 'Payment Mix', message: 'Payment methods today', icon: CreditCard },
    { label: 'Peak Hour', message: 'What is the peak hour today?', icon: Clock },
    { label: 'Top Products', message: 'Best selling products today', icon: Star },
    { label: 'Top This Month', message: 'Top products this month', icon: TrendingUp },
    { label: 'Recent Sales', message: 'Show recent transactions', icon: RefreshCw },
    { label: 'Low Stock', message: 'Show low stock items', icon: AlertTriangle },
    { label: 'Out of Stock', message: "What's out of stock?", icon: Package },
    { label: 'Stock Overview', message: 'Stock summary', icon: Package },
    { label: 'Discounts', message: 'Discount summary today', icon: Tag },
    { label: 'Purchase Orders', message: 'Pending purchase orders', icon: ShoppingBag },
    { label: 'Cash Session', message: 'Cash session status', icon: Wallet },
    { label: 'Installments', message: 'Installment summary', icon: CalendarClock },
    { label: 'Expenses', message: "Today's expenses", icon: BarChart2 },
    { label: 'Monthly Expenses', message: 'Monthly expenses', icon: BarChart2 },
    { label: 'Voids Today', message: 'Any voided transactions today?', icon: XCircle },
    { label: 'Stock Losses', message: 'Show stock losses this month', icon: TrendingDown },
    { label: 'Products Count', message: 'How many products do we have?', icon: Hash },
    { label: 'Branch Summary', message: 'Branch sales summary', icon: Building2 },
];

// ─── CSRF helper ──────────────────────────────────────────────────────────────
function getCsrf(): string {
    const m = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

// ─── Guard wrapper — only mounts for manager/cashier and not on /pos ─────────
export default function FloatingChat() {
    const { props } = usePage<any>();
    const role = props.auth?.user?.role ?? '';
    const aiEnabled = props.app?.ai_chat_enabled !== false;
    const currentPath = usePage().url.split('?')[0];

    if (!aiEnabled) return null;
    if (role !== 'super_admin' && role !== 'administrator') return null;
    if (currentPath === '/pos' || currentPath.startsWith('/pos/')) return null;

    return <ChatUI />;
}

// ─── Main chat UI ─────────────────────────────────────────────────────────────
function ChatUI() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [unread, setUnread] = useState(false);
    const [showAllActions, setShowAllActions] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Welcome message on first open
    useEffect(() => {
        if (open && messages.length === 0) {
            setMessages([
                {
                    id: 'welcome',
                    role: 'assistant',
                    text: "Hi! 👋 I'm your EAJ business assistant. I can help you check your sales, inventory, expenses, and more.\n\nWhat would you like to know?",
                    timestamp: new Date(),
                },
            ]);
            setTimeout(() => inputRef.current?.focus(), 120);
        }
        if (open) {
            setUnread(false);
            setTimeout(() => inputRef.current?.focus(), 120);
        }
    }, [open]);

    const sendMessage = useCallback(
        async (text: string) => {
            if (!text.trim() || loading) return;

            const userMsg: Message = {
                id: Date.now().toString(),
                role: 'user',
                text: text.trim(),
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, userMsg]);
            setInput('');
            setLoading(true);

            try {
                const res = await fetch('/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-XSRF-TOKEN': getCsrf(),
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({ message: text.trim() }),
                });

                const data = await res.json();

                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    text: data.text ?? "Sorry, I couldn't process that.",
                    items: data.items,
                    timestamp: new Date(),
                };
                setMessages((prev) => [...prev, aiMsg]);
                if (!open) setUnread(true);
            } catch {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        text: 'Something went wrong. Please try again.',
                        timestamp: new Date(),
                    },
                ]);
            } finally {
                setLoading(false);
                setTimeout(() => inputRef.current?.focus(), 60);
            }
        },
        [loading, open],
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const showQuickActions = messages.length <= 1 && !loading;

    return (
        <>
            {/* ── Floating button ── */}
            <button
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'fixed right-6 bottom-6 z-50 h-14 w-14 rounded-full shadow-lg',
                    'flex items-center justify-center transition-all duration-200',
                    'bg-primary text-primary-foreground hover:scale-105 hover:shadow-xl active:scale-95',
                    open && 'scale-90 rotate-90',
                )}
                title="EAJ Business Assistant"
            >
                {open ? <X className="h-5 w-5" /> : <Bot className="h-6 w-6" />}
                {/* Online dot */}
                {!open && <span className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-background bg-green-500" />}
                {/* Unread badge */}
                {!open && unread && (
                    <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">
                        !
                    </span>
                )}
            </button>

            {/* ── Chat panel ── */}
            <div
                className={cn(
                    'fixed right-6 bottom-24 z-50 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
                    'origin-bottom-right transition-all duration-250',
                    open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0',
                )}
                style={{ height: '520px' }}
            >
                {/* Header */}
                <div className="flex shrink-0 items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm leading-tight font-bold">EAJ Assistant</p>
                        <p className="flex items-center gap-1 text-[10px] opacity-70">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                            Powered by your business data
                        </p>
                    </div>
                    <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 transition-colors hover:bg-white/20">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
                    {messages.map((msg) => (
                        <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                            {msg.role === 'assistant' && (
                                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                                    <Bot className="h-3 w-3 text-primary" />
                                </div>
                            )}
                            <div
                                className={cn(
                                    'max-w-[82%] space-y-1.5',
                                    msg.role === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start',
                                )}
                            >
                                <div
                                    className={cn(
                                        'rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                                        msg.role === 'user'
                                            ? 'rounded-br-sm bg-primary text-primary-foreground'
                                            : 'rounded-bl-sm bg-muted text-foreground',
                                    )}
                                >
                                    {msg.text}
                                </div>

                                {/* Data table */}
                                {msg.items && msg.items.length > 0 && (
                                    <div className="w-full overflow-hidden rounded-xl border border-border bg-background">
                                        {msg.items.map((item, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    'flex items-center justify-between gap-2 px-3 py-2 text-xs',
                                                    i > 0 && 'border-t border-border',
                                                    i === msg.items!.length - 1 && item.badge === 'Total' && 'bg-muted/50 font-semibold',
                                                )}
                                            >
                                                <span className="truncate text-muted-foreground">{item.label}</span>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <span className="font-bold text-foreground tabular-nums">{item.value}</span>
                                                    {item.badge && (
                                                        <span
                                                            className={cn(
                                                                'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                                                                item.badge === 'Critical' &&
                                                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                                                item.badge === 'Low' &&
                                                                    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                                                                item.badge === 'Out' &&
                                                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                                                item.badge === 'Voided' &&
                                                                    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                                                                item.badge === 'Total' &&
                                                                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                                                item.badge?.includes('sold') &&
                                                                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                                                item.badge?.includes('▲') &&
                                                                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                                                item.badge?.includes('▼') &&
                                                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                                                !['Critical', 'Low', 'Out', 'Voided', 'Total'].includes(item.badge ?? '') &&
                                                                    !item.badge?.includes('sold') &&
                                                                    !item.badge?.includes('▲') &&
                                                                    !item.badge?.includes('▼') &&
                                                                    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                                                            )}
                                                        >
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <p className="px-1 text-[10px] text-muted-foreground">
                                    {msg.timestamp.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {loading && (
                        <div className="flex justify-start gap-2">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                                <Bot className="h-3 w-3 text-primary" />
                            </div>
                            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                                <div className="flex items-center gap-1">
                                    <span
                                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                                        style={{ animationDelay: '0ms' }}
                                    />
                                    <span
                                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                                        style={{ animationDelay: '160ms' }}
                                    />
                                    <span
                                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                                        style={{ animationDelay: '320ms' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Quick action chips */}
                {showQuickActions && (
                    <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border px-3 pt-2 pb-2">
                        {(showAllActions ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 5)).map((action) => (
                            <button
                                key={action.label}
                                onClick={() => sendMessage(action.message)}
                                className="flex items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <action.icon className="h-3 w-3" />
                                {action.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowAllActions((v) => !v)}
                            className="flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
                        >
                            {showAllActions ? 'Show less' : `+${QUICK_ACTIONS.length - 5} more`}
                        </button>
                    </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t border-border px-3 pt-2 pb-3">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about sales, stock, expenses..."
                        className="h-9 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50"
                        disabled={loading}
                        autoComplete="off"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || loading}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </form>
            </div>
        </>
    );
}
