/**
 * Props shared with every Inertia page by HandleInertiaRequests::share().
 * Everything is optional because error pages and the customer app receive only part of it.
 */

export interface SharedApp {
    name: string;
    tagline: string;
    env: string;
    currency: string;
    ai_chat_enabled: boolean;
    color_theme: string;
    logo_url: string | null;
    icon_url: string | null;
}

export interface SharedBranch {
    id: number;
    name: string;
    /** The place part of the name without the brand prefix, e.g. "Tagukon". */
    location: string;
    code: string;
    business_type: string;
    is_active: boolean;
    feature_flags: Record<string, boolean>;
}

/** The signed-in staff member. */
export interface SharedUser {
    id: number;
    fname: string;
    lname: string;
    full_name: string;
    username: string;
    role: string;
    role_label: string;
    /** Menu ids this user may open. */
    access: string[];
    is_super_admin: boolean;
    is_administrator: boolean;
    is_manager: boolean;
    is_cashier: boolean;
    is_waiter: boolean;
    is_admin: boolean;
    can_approve: boolean;
    pos_layout: string;
    branch_id: number | null;
    branch: SharedBranch | null;
    /** The branch's supplier (owning business), when it has one. */
    supplier: {
        id: number;
        name: string;
        phone: string | null;
        address: string | null;
        contact_person: string | null;
        is_campus: boolean;
    } | null;
}

/** Branch-scoped system settings (POS, tax, receipt, inventory, cash). */
export type SharedSettings = Record<string, string | number | boolean | null>;

export interface SharedProps {
    app?: SharedApp;
    auth?: { authenticated: boolean; user: SharedUser | null };
    settings?: SharedSettings | null;
    /** Page title, when the controller sets one. */
    title?: string;
    [key: string]: unknown;
}
