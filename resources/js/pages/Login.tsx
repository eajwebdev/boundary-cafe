'use client';

import { Head, router, useForm, usePage } from '@inertiajs/react';
import { ArrowRight, Coffee, Eye, EyeOff, Loader2, Lock, MapPin, ShieldCheck, Sparkles, User, Zap } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';
import { postDemoLogin } from '@/actions/App/Http/Controllers/LoginAuthController';

interface DemoUser {
    id: number;
    name: string;
    username: string;
    role: string;
    role_label: string;
    branch: string;
}

interface LoginProps {
    errors?: Record<string, string>;
    business_name?: string;
    logo_url?: string | null;
    is_demo?: boolean;
    demo_users?: DemoUser[];
}

interface LoginFormData {
    username: string;
    password: string;
}

export default function Login({
    errors: serverErrors,
    business_name: propBusinessName,
    logo_url: propLogoUrl,
    is_demo = false,
    demo_users = [],
}: LoginProps) {
    const { props } = usePage<{ app?: { name?: string; logo_url?: string | null } }>();
    const businessName = propBusinessName ?? props.app?.name ?? 'POS';
    const logoUrl = propLogoUrl ?? props.app?.logo_url ?? null;
    const [showPassword, setShowPassword] = useState(false);
    const [loggingInUser, setLoggingInUser] = useState<string | null>(null);
    const { setTheme } = useTheme();

    const { data, setData, post, processing, reset } = useForm<LoginFormData>({
        username: '',
        password: '',
    });

    useEffect(() => {
        setTheme('light');
        return () => reset('password');
    }, [setTheme, reset]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        post(routes.loginPost());
    };

    const handleQuickLogin = (user: DemoUser) => {
        setLoggingInUser(user.username);
        router.post(
            postDemoLogin.url(),
            { username: user.username },
            { onFinish: () => setLoggingInUser(null) },
        );
    };

    const quickUsers = (demo_users || []).filter((user) => user.role !== 'super_admin');
    const hasDemo = is_demo && quickUsers.length > 0;
    const fallbackLogo = '/uploads/optimized/logo.webp';

    return (
        <>
            <Head title="Login" />

            <div className="bc-login-page">
                <div className="bc-login-orb bc-login-orb-one" aria-hidden="true" />
                <div className="bc-login-orb bc-login-orb-two" aria-hidden="true" />

                <main className="bc-login-shell">
                    <section className="bc-login-brand-panel" aria-label="About Boundary Café">
                        <img className="bc-login-brand-image" src="/uploads/optimized/banner.webp" alt="" />
                        <div className="bc-login-brand-overlay" aria-hidden="true" />

                        <div className="bc-login-brand-content">
                            <a href="/" className="bc-login-lockup" aria-label="Boundary Café home">
                                <span className="bc-login-logo-tile">
                                    <img src={logoUrl ?? fallbackLogo} alt="" />
                                </span>
                                <span>
                                    <strong>{businessName}</strong>
                                    <small>Taste of Negros</small>
                                </span>
                            </a>

                            <div className="bc-login-brand-copy">
                                <span className="bc-login-kicker">
                                    <Sparkles size={14} aria-hidden="true" /> Built for better service
                                </span>
                                <h1>Where great service begins.</h1>
                                <p>Orders, inventory, teams, and every busy shift—beautifully connected in one workspace.</p>
                            </div>

                            <div className="bc-login-brand-footer">
                                <span>
                                    <ShieldCheck size={17} aria-hidden="true" /> Protected workspace
                                </span>
                                <span>
                                    <MapPin size={17} aria-hidden="true" /> Tagukon · Mabinay
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className="bc-login-form-panel">
                        <a href="/" className="bc-login-mobile-lockup" aria-label="Boundary Café home">
                            <img src={logoUrl ?? fallbackLogo} alt="" />
                            <span>
                                <strong>{businessName}</strong>
                                <small>Taste of Negros</small>
                            </span>
                        </a>

                        <div className="bc-login-heading">
                            <span>Secure staff portal</span>
                            <h2>Welcome back.</h2>
                            <p>Sign in to continue to your point of sale and store dashboard.</p>
                        </div>

                        <form onSubmit={submit} className="bc-login-form">
                            <div className="bc-login-field">
                                <Label htmlFor="username">Username</Label>
                                <div className="bc-login-input-wrap">
                                    <User aria-hidden="true" />
                                    <Input
                                        id="username"
                                        placeholder="Enter your username"
                                        value={data.username}
                                        onChange={(event) => setData('username', event.target.value)}
                                        className={cn(serverErrors?.username && 'is-invalid')}
                                        autoFocus={!hasDemo}
                                        autoComplete="username"
                                        disabled={processing || !!loggingInUser}
                                    />
                                </div>
                                {serverErrors?.username && <p className="bc-login-error">{serverErrors.username}</p>}
                            </div>

                            <div className="bc-login-field">
                                <Label htmlFor="password">Password</Label>
                                <div className="bc-login-input-wrap">
                                    <Lock aria-hidden="true" />
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Enter your password"
                                        value={data.password}
                                        onChange={(event) => setData('password', event.target.value)}
                                        className={cn(serverErrors?.password && 'is-invalid')}
                                        autoComplete="current-password"
                                        disabled={processing || !!loggingInUser}
                                    />
                                    <button
                                        type="button"
                                        className="bc-login-password-toggle"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        onClick={() => setShowPassword(!showPassword)}
                                        disabled={processing || !!loggingInUser}
                                    >
                                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                                    </button>
                                </div>
                                {serverErrors?.password && <p className="bc-login-error">{serverErrors.password}</p>}
                            </div>

                            <Button type="submit" className="bc-login-submit" disabled={processing || !!loggingInUser}>
                                {processing && !loggingInUser ? (
                                    <>
                                        <Loader2 className="animate-spin" aria-hidden="true" />
                                        Signing in…
                                    </>
                                ) : (
                                    <>
                                        <span>Sign in securely</span>
                                        <ArrowRight aria-hidden="true" />
                                    </>
                                )}
                            </Button>
                        </form>

                        {hasDemo && (
                            <div className="bc-login-demo">
                                <div className="bc-login-divider">
                                    <span>or explore the demo</span>
                                </div>
                                <div className="bc-login-demo-heading">
                                    <div>
                                        <span>
                                            <Zap aria-hidden="true" /> One-click access
                                        </span>
                                        <p>Choose a role to enter instantly.</p>
                                    </div>
                                    <span className="bc-login-demo-badge">{quickUsers.length} profiles</span>
                                </div>

                                <div className="bc-login-demo-grid">
                                    {quickUsers.map((user) => {
                                        const isThisLoggingIn = loggingInUser === user.username;
                                        const label = user.role_label;

                                        return (
                                            <button
                                                key={user.id}
                                                type="button"
                                                onClick={() => handleQuickLogin(user)}
                                                disabled={processing || !!loggingInUser}
                                                className={cn('bc-login-role', isThisLoggingIn && 'is-loading')}
                                                title={`One-click login as ${label} (@${user.username})`}
                                            >
                                                <span className="bc-login-role-icon">
                                                    {isThisLoggingIn ? (
                                                        <Loader2 className="animate-spin" aria-hidden="true" />
                                                    ) : (
                                                        <Coffee aria-hidden="true" />
                                                    )}
                                                </span>
                                                <span className="bc-login-role-copy">
                                                    <strong>{label}</strong>
                                                    <small>@{user.username}</small>
                                                </span>
                                                <ArrowRight className="bc-login-role-arrow" aria-hidden="true" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <p className="bc-login-trust">
                            <ShieldCheck aria-hidden="true" /> Authorized staff access only
                        </p>
                    </section>
                </main>
            </div>
        </>
    );
}
