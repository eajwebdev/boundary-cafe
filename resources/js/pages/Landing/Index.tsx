import { Head } from '@inertiajs/react';
import { ArrowRight, ChevronRight, Clock3, Instagram, MapPin, Menu, Navigation, Quote, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type MenuItem = { name: string; image: string; note: string };
type MenuGroup = { label: string; intro: string; items: MenuItem[] };

const navigation = [
    ['Menu', '#menu'],
    ['Our story', '#story'],
    ['Gallery', '#gallery'],
    ['Branches', '#branches'],
] as const;

const scrollNavigation = [['Home', '#home'], ...navigation] as const;
type ScrollSectionHref = (typeof scrollNavigation)[number][1];

const menuGroups: MenuGroup[] = [
    {
        label: 'Sulit meals',
        intro: 'Generous all-day plates made for proper comfort.',
        items: [
            { name: 'Fiesta Meal A', image: '/uploads/optimized/fiesta_meal_a.webp', note: 'A Boundary favorite' },
            { name: 'Fiesta Meal B', image: '/uploads/optimized/fiesta_meal_b.webp', note: 'Full plate, full flavor' },
            { name: 'Tocino Meal', image: '/uploads/optimized/tocino_meal.webp', note: 'Sweet, savory, satisfying' },
            { name: 'Chicken Meal', image: '/uploads/optimized/1_chicken_meal.webp', note: 'Crisp and comforting' },
            { name: 'Hungarian Sausage Meal', image: '/uploads/optimized/hungarian_sausage_meal.webp', note: 'Smoky and filling' },
            { name: 'Bacon Meal', image: '/uploads/optimized/bacon_meal.webp', note: 'A familiar favorite' },
        ],
    },
    {
        label: 'Burgers',
        intro: 'Fresh off the grill, from solo cravings to barkada sharing.',
        items: [
            { name: 'Boundary Burger', image: '/uploads/optimized/boundary_burger.webp', note: 'Our signature original' },
            { name: 'Chicken Burger', image: '/uploads/optimized/chicken_burger.webp', note: 'Tender and savory' },
            { name: 'Ultimate Burger', image: '/uploads/optimized/ultimate_burger.webp', note: 'Built for big cravings' },
            { name: 'Barkada Burgers', image: '/uploads/optimized/barkada_burgers.webp', note: 'Better shared' },
            { name: 'Burger & Fries Combo', image: '/uploads/optimized/burger_and_fries_combo.webp', note: 'The complete classic' },
        ],
    },
    {
        label: 'Drinks',
        intro: 'Bright coolers and creamy café favorites for warm Negros days.',
        items: [
            { name: 'Strawberry Sparkle', image: '/uploads/optimized/strawberry_sparkle.webp', note: 'Bright and refreshing' },
            { name: 'Blueberry Sparkle', image: '/uploads/optimized/blueberry_sparkle.webp', note: 'Fruity and crisp' },
            { name: 'Fresh Calamansi', image: '/uploads/optimized/fresh_calamansi.webp', note: 'Local citrus refreshment' },
            { name: 'Dark Chocolate', image: '/uploads/optimized/dark_chocolate.webp', note: 'Rich and creamy' },
            { name: 'Strawberry Latte', image: '/uploads/optimized/strawberry_latte.webp', note: 'Soft and sweet' },
            { name: 'Matcha Latte', image: '/uploads/optimized/matcha_latte.webp', note: 'Clean, creamy finish' },
        ],
    },
    {
        label: 'Frappes',
        intro: 'Blended, playful, and made for slowing down.',
        items: [
            { name: "Cookies n' Cream", image: '/uploads/optimized/cookies_n_cream.webp', note: 'A crowd favorite' },
            { name: 'Taro', image: '/uploads/optimized/taro.webp', note: 'Smooth and mellow' },
            { name: 'Strawberry Frappe', image: '/uploads/optimized/strawberry_frappe.webp', note: 'Fresh berry sweetness' },
            { name: 'Avocado', image: '/uploads/optimized/avocado.webp', note: 'Creamy and distinctive' },
        ],
    },
];

const branches = [
    {
        number: '01',
        name: 'Tagukon',
        region: 'Negros Occidental',
        note: 'Your stop between good food and the road ahead.',
        mapUrl: 'https://www.google.com/maps/search/?api=1&query=Boundary%20Cafe%20Tagukon%20Negros%20Occidental',
    },
    {
        number: '02',
        name: 'Mabinay',
        region: 'Negros Oriental',
        note: 'A relaxed café break in the heart of Negros.',
        mapUrl: 'https://www.google.com/maps/search/?api=1&query=Boundary%20Cafe%20Mabinay%20Negros%20Oriental',
    },
] as const;

const gallery = [
    { src: '/uploads/optimized/boundary_burger.webp', alt: 'Boundary Burger', className: 'bc-gallery-tall' },
    { src: '/uploads/optimized/fiesta_meal_a.webp', alt: 'Fiesta Meal A', className: '' },
    { src: '/uploads/optimized/strawberry_sparkle.webp', alt: 'Strawberry Sparkle', className: '' },
    { src: '/uploads/optimized/matcha_latte.webp', alt: 'Matcha Latte', className: '' },
    { src: '/uploads/optimized/ultimate_burger.webp', alt: 'Ultimate Burger', className: '' },
] as const;

function Brand({ compact = false }: { compact?: boolean }) {
    return (
        <span className="bc-brand">
            <span className="bc-brand-mark">
                <img src="/uploads/optimized/logo.webp" alt="" width="512" height="512" />
            </span>
            {!compact && (
                <span className="bc-brand-name">
                    <strong>Boundary Café</strong>
                    <span>Taste of Negros</span>
                </span>
            )}
        </span>
    );
}

function SectionIntro({ eyebrow, title, copy, light = false }: { eyebrow: string; title: string; copy?: string; light?: boolean }) {
    return (
        <div className={`bc-section-intro bc-reveal ${light ? 'is-light' : ''}`}>
            <p className="bc-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            {copy && <p className="bc-section-copy">{copy}</p>}
        </div>
    );
}

export default function Landing() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeMenu, setActiveMenu] = useState(0);
    const [activeSection, setActiveSection] = useState<ScrollSectionHref>('#home');
    const pageRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLElement>(null);
    const heroRef = useRef<HTMLElement>(null);
    const year = new Date().getFullYear();
    const currentGroup = menuGroups[activeMenu];

    const handleMenuKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % menuGroups.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + menuGroups.length) % menuGroups.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = menuGroups.length - 1;
        if (nextIndex === index) return;

        event.preventDefault();
        setActiveMenu(nextIndex);
        window.requestAnimationFrame(() => document.getElementById(`menu-tab-${nextIndex}`)?.focus());
    };

    useEffect(() => {
        const onEscape = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
        window.addEventListener('keydown', onEscape);
        document.body.style.overflow = menuOpen ? 'hidden' : '';
        return () => {
            window.removeEventListener('keydown', onEscape);
            document.body.style.overflow = '';
        };
    }, [menuOpen]);

    useEffect(() => {
        const page = pageRef.current;
        const header = headerRef.current;
        const hero = heroRef.current;
        const parallaxSections = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
        const sections = scrollNavigation
            .map(([, href]) => document.querySelector<HTMLElement>(href))
            .filter((section): section is HTMLElement => Boolean(section));
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let frame = 0;

        const updateScrollState = () => {
            frame = 0;
            const scrollTop = window.scrollY;
            const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
            const progress = Math.min(Math.max(scrollTop / scrollable, 0), 1);
            const readingLine = scrollTop + window.innerHeight * 0.36;
            let nextSection: ScrollSectionHref = '#home';

            sections.forEach((section) => {
                if (section.offsetTop <= readingLine) nextSection = `#${section.id}` as ScrollSectionHref;
            });

            if (window.innerHeight + scrollTop >= document.documentElement.scrollHeight - 4) {
                nextSection = '#branches';
            }

            setActiveSection((current) => (current === nextSection ? current : nextSection));
            header?.classList.toggle('is-scrolled', scrollTop > 24);
            page?.style.setProperty('--bc-scroll-progress', String(progress));

            if (!reducedMotion && hero) {
                const heroProgress = Math.min(Math.max(scrollTop / Math.max(hero.offsetHeight, 1), 0), 1);
                hero.style.setProperty('--bc-hero-shift', `${heroProgress * 5.5}rem`);
                hero.style.setProperty('--bc-hero-copy-shift', `${heroProgress * 2.25}rem`);
                hero.style.setProperty('--bc-hero-copy-opacity', String(1 - heroProgress * 0.72));

                parallaxSections.forEach((section) => {
                    const bounds = section.getBoundingClientRect();
                    const sectionCenter = bounds.top + bounds.height / 2;
                    const viewportCenter = window.innerHeight / 2;
                    const distance = Math.max(-1, Math.min(1, (viewportCenter - sectionCenter) / window.innerHeight));
                    const speed = Number(section.dataset.parallaxSpeed ?? 24);
                    section.style.setProperty('--bc-parallax-shift', `${distance * speed}px`);
                });
            }
        };

        const requestUpdate = () => {
            if (!frame) frame = window.requestAnimationFrame(updateScrollState);
        };

        updateScrollState();
        window.addEventListener('scroll', requestUpdate, { passive: true });
        window.addEventListener('resize', requestUpdate);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', requestUpdate);
            window.removeEventListener('resize', requestUpdate);
        };
    }, []);

    useEffect(() => {
        const nodes = document.querySelectorAll<HTMLElement>('.bc-reveal');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            nodes.forEach((node) => node.classList.add('is-visible'));
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
        );
        nodes.forEach((node) => observer.observe(node));
        return () => observer.disconnect();
    }, [activeMenu]);

    return (
        <>
            <Head title="Boundary Café | Taste of Negros">
                <meta
                    name="description"
                    content="Discover Boundary Café—comforting meals, handcrafted drinks, burgers, frappes, and a genuine Taste of Negros."
                />
                <meta property="og:title" content="Boundary Café | Taste of Negros" />
                <meta property="og:description" content="Good food, great drinks, and better days at Boundary Café." />
                <meta property="og:image" content="/uploads/banner.png" />
                <meta name="theme-color" content="#062581" />
                <link rel="preload" as="image" href="/uploads/optimized/banner.webp" />
            </Head>

            <div ref={pageRef} className="bc-page">
                <a href="#main-content" className="bc-skip-link">
                    Skip to content
                </a>
                <header ref={headerRef} className="bc-header">
                    <div className="bc-shell bc-header-inner">
                        <a href="#home" aria-label="Boundary Café home" className="bc-focus">
                            <Brand />
                        </a>
                        <nav className="bc-desktop-nav" aria-label="Primary navigation">
                            {navigation.map(([label, href]) => (
                                <a key={href} href={href} aria-current={activeSection === href ? 'location' : undefined}>
                                    {label}
                                </a>
                            ))}
                        </nav>
                        <a href="#branches" className="bc-button bc-button-primary bc-header-cta">
                            Find a café <ArrowRight size={16} aria-hidden="true" />
                        </a>
                        <button
                            type="button"
                            className="bc-menu-button"
                            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                            aria-expanded={menuOpen}
                            aria-controls="mobile-navigation"
                            onClick={() => setMenuOpen((open) => !open)}
                        >
                            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                        </button>
                    </div>
                    {menuOpen && (
                        <nav id="mobile-navigation" className="bc-mobile-nav" aria-label="Mobile navigation">
                            <div className="bc-shell">
                                {navigation.map(([label, href], index) => (
                                    <a
                                        key={href}
                                        href={href}
                                        aria-current={activeSection === href ? 'location' : undefined}
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        <span>0{index + 1}</span>
                                        {label}
                                        <ChevronRight aria-hidden="true" />
                                    </a>
                                ))}
                            </div>
                        </nav>
                    )}
                </header>

                <main id="main-content">
                    <section ref={heroRef} id="home" className="bc-hero">
                        <div className="bc-hero-background" aria-hidden="true">
                            <img src="/uploads/optimized/banner.webp" alt="" width="2048" height="768" fetchPriority="high" />
                        </div>
                        <div className="bc-hero-overlay" aria-hidden="true" />
                        <div className="bc-shell bc-hero-grid">
                            <div className="bc-hero-copy bc-reveal">
                                <p className="bc-eyebrow">A café between destinations</p>
                                <h1>
                                    Good food,
                                    <br />
                                    <em>better days.</em>
                                </h1>
                                <p className="bc-hero-lede">
                                    Familiar comfort, refreshing drinks, and the warm local spirit of Negros—served at the Boundary.
                                </p>
                                <div className="bc-actions">
                                    <a href="#menu" className="bc-button bc-button-primary">
                                        Explore the menu <ArrowRight size={17} aria-hidden="true" />
                                    </a>
                                    <a href="#branches" className="bc-button bc-button-secondary">
                                        <MapPin size={17} aria-hidden="true" /> Visit us
                                    </a>
                                </div>
                                <div className="bc-hero-note">
                                    <span className="bc-note-line" aria-hidden="true" />
                                    <span>Tagukon · Mabinay</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="bc-local-strip" aria-label="Boundary Café highlights">
                        <div className="bc-shell">
                            <span>Comfort on a plate</span>
                            <i aria-hidden="true" />
                            <span>Drinks worth the stop</span>
                            <i aria-hidden="true" />
                            <span>Two sides of Negros</span>
                        </div>
                    </div>

                    <section id="menu" className="bc-section bc-menu-section">
                        <div className="bc-shell">
                            <div className="bc-menu-heading-row">
                                <SectionIntro
                                    eyebrow="From our kitchen"
                                    title="A menu made for the moment."
                                    copy="From quick road-trip stops to slow afternoons with friends, there is always something good waiting."
                                />
                                <p className="bc-menu-aside">Fresh favorites, generous servings, and flavors that feel close to home.</p>
                            </div>
                            <div className="bc-featured-grid bc-reveal">
                                <article className="bc-featured-card bc-featured-large" data-parallax data-parallax-speed="18">
                                    <img src="/uploads/optimized/fiesta_meal_a.webp" alt="Fiesta Meal A" width="1254" height="1254" loading="lazy" />
                                    <div>
                                        <span>All-day comfort</span>
                                        <h3>Fiesta Meal A</h3>
                                    </div>
                                </article>
                                <article className="bc-featured-card" data-parallax data-parallax-speed="12">
                                    <img src="/uploads/optimized/matcha_latte.webp" alt="Matcha Latte" width="1254" height="1254" loading="lazy" />
                                    <div>
                                        <span>Cool & creamy</span>
                                        <h3>Matcha Latte</h3>
                                    </div>
                                </article>
                                <article className="bc-featured-quote">
                                    <Quote size={24} aria-hidden="true" />
                                    <p>Big comfort, bright drinks, and no need to rush.</p>
                                    <span>That is the Boundary way.</span>
                                </article>
                            </div>

                            <div className="bc-menu-browser bc-reveal">
                                <div className="bc-menu-tabs" role="tablist" aria-label="Menu categories">
                                    {menuGroups.map((group, index) => (
                                        <button
                                            key={group.label}
                                            id={`menu-tab-${index}`}
                                            type="button"
                                            role="tab"
                                            aria-selected={activeMenu === index}
                                            aria-controls="menu-panel"
                                            tabIndex={activeMenu === index ? 0 : -1}
                                            onClick={() => setActiveMenu(index)}
                                            onKeyDown={(event) => handleMenuKey(event, index)}
                                        >
                                            <span>0{index + 1}</span>
                                            {group.label}
                                        </button>
                                    ))}
                                </div>
                                <div
                                    key={activeMenu}
                                    id="menu-panel"
                                    className="bc-menu-panel bc-panel-enter"
                                    role="tabpanel"
                                    aria-labelledby={`menu-tab-${activeMenu}`}
                                >
                                    <div className="bc-menu-panel-heading">
                                        <p>{currentGroup.intro}</p>
                                        <span>{currentGroup.items.length} favorites</span>
                                    </div>
                                    <div className="bc-menu-items">
                                        {currentGroup.items.map((item) => (
                                            <article key={item.name} className="bc-menu-item">
                                                <img src={item.image} alt="" width="1254" height="1254" loading="lazy" />
                                                <div>
                                                    <h3>{item.name}</h3>
                                                    <p>{item.note}</p>
                                                </div>
                                                <ArrowRight size={17} aria-hidden="true" />
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section id="story" className="bc-story">
                        <div className="bc-shell bc-story-grid">
                            <div className="bc-story-image bc-reveal bc-reveal-left" data-parallax data-parallax-speed="20">
                                <img src="/uploads/optimized/logo.webp" alt="Boundary Café logo" width="512" height="512" loading="lazy" />
                            </div>
                            <div className="bc-story-copy bc-reveal bc-reveal-right">
                                <p className="bc-eyebrow">Our story</p>
                                <h2>More than a stop. Part of the journey.</h2>
                                <p>
                                    Boundary Café brings together the food we crave, the drinks that cool the day, and the places that make Negros
                                    feel like home.
                                </p>
                                <p>
                                    Rooted between Tagukon and Mabinay, we are a place to pause, gather, and leave a little happier than you arrived.
                                </p>
                                <div className="bc-story-signoff">
                                    <span>Taste of Negros</span>
                                    <strong>Dine · Eat · Relax</strong>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section id="gallery" className="bc-section bc-gallery-section">
                        <div className="bc-shell">
                            <div className="bc-gallery-heading">
                                <SectionIntro
                                    eyebrow="From our table"
                                    title="Made to be savored."
                                    copy="A closer look at the comfort food and colorful drinks waiting at Boundary Café."
                                />
                                <Instagram size={28} aria-hidden="true" />
                            </div>
                            <div className="bc-gallery-grid bc-reveal" data-parallax data-parallax-speed="14">
                                {gallery.map((image) => (
                                    <figure key={image.src} className={image.className}>
                                        <img src={image.src} alt={image.alt} width="1254" height="1254" loading="lazy" />
                                        <figcaption>{image.alt}</figcaption>
                                    </figure>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section id="branches" className="bc-branches">
                        <div className="bc-shell bc-branches-grid">
                            <div className="bc-branches-copy bc-reveal">
                                <p className="bc-eyebrow">Meet us at the Boundary</p>
                                <h2>Two places to pause across Negros.</h2>
                                <p>Come hungry, bring good company, and stay awhile.</p>
                                <div className="bc-hours">
                                    <Clock3 size={19} aria-hidden="true" />
                                    <span>
                                        <strong>Open daily</strong>Check Google Maps for today’s hours
                                    </span>
                                </div>
                            </div>
                            <div className="bc-branch-list bc-reveal">
                                {branches.map((branch) => (
                                    <a key={branch.name} href={branch.mapUrl} target="_blank" rel="noreferrer" className="bc-branch-card">
                                        <span className="bc-branch-number">{branch.number}</span>
                                        <div>
                                            <p>Boundary Café</p>
                                            <h3>{branch.name}</h3>
                                            <span>{branch.region}</span>
                                            <small>{branch.note}</small>
                                        </div>
                                        <Navigation aria-hidden="true" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="bc-footer">
                    <div className="bc-shell">
                        <div className="bc-footer-main">
                            <Brand />
                            <p>Good food, great drinks, and better days at the Boundary.</p>
                            <nav aria-label="Footer navigation">
                                {navigation.map(([label, href]) => (
                                    <a key={href} href={href} aria-current={activeSection === href ? 'location' : undefined}>
                                        {label}
                                    </a>
                                ))}
                            </nav>
                        </div>
                        <div className="bc-footer-meta">
                            <p>© {year} Boundary Café. All rights reserved.</p>
                            <p>Tagukon · Mabinay · Negros</p>
                        </div>
                    </div>
                </footer>
            </div>
        </>
    );
}
