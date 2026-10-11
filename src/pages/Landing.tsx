import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Globe2,
  Heart,
  Link2,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

const steps = [
  {
    number: '01',
    icon: Link2,
    title: 'Add it your way',
    body: 'Paste a product link, search by name, scan a barcode, upload an image, or enter the details yourself.',
  },
  {
    number: '02',
    icon: Search,
    title: 'Confirm the exact item',
    body: 'Wishly checks model and variant details before treating another listing as a match.',
  },
  {
    number: '03',
    icon: Tag,
    title: 'Compare available offers',
    body: 'See supported retailers, original currencies, freshness, and known delivery costs in one place.',
  },
];

export default function Landing() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen overflow-hidden bg-[#fbf4f2] text-ink selection:bg-brand selection:text-white">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-[#fbf4f2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Wishly home">
            <span className="gradient-primary flex h-10 w-10 items-center justify-center rounded-2xl text-xl font-extrabold text-white shadow-lg shadow-brand/15">W</span>
            <span className="font-display text-[22px] font-bold tracking-tight text-ink">Wishly</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main navigation">
            <Link to="/auth/login" className="text-sm font-semibold text-ink-2 transition hover:text-brand">
              {t.common.signIn}
            </Link>
            <Button asChild size="sm" className="gradient-primary rounded-xl px-4 text-white shadow-md shadow-brand/15 hover:opacity-95">
              <Link to="/auth/register">{t.common.signUp}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:pb-28 lg:pt-24">
          <div className="fade-in relative z-10 max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#e8cbc8] bg-white/65 px-3.5 py-2 text-xs font-semibold text-brand shadow-sm">
              <Sparkles className="h-4 w-4" />
              <span>Wishlist, product discovery &amp; price tracking</span>
            </div>
            <h1 className="mb-6 max-w-[12ch] text-[clamp(3rem,7vw,5.5rem)] font-bold leading-[.98] tracking-[-.055em] text-ink">
              Keep what you love. <span className="gradient-text">Find it for less.</span>
            </h1>
            <p className="mb-9 max-w-xl text-base leading-7 text-ink-2 sm:text-lg sm:leading-8">
              Save a product once. Wishly helps identify the exact model, searches connected shopping sources, and keeps useful offers together with your wishlist.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gradient-primary h-12 rounded-2xl px-6 text-base font-semibold text-white shadow-xl shadow-brand/20 hover:opacity-95">
                <Link to="/auth/register" className="flex items-center justify-center gap-2">
                  {t.landing.cta}<ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 rounded-2xl border-line bg-white/60 px-6 text-base text-ink hover:bg-white">
                <Link to="/discover">Explore Wishly</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-ink-2">
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-save" />Manual fallback always available</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-save" />Offer freshness shown clearly</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] lg:ml-auto">
            <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[#e7c8c4]/60 blur-3xl" />
            <div className="absolute -bottom-12 -left-8 h-52 w-52 rounded-full bg-[#e9d9c8]/70 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/80 bg-[#fffaf8]/85 p-4 shadow-[0_35px_90px_-48px_rgba(70,28,39,.42)] backdrop-blur sm:p-6">
              <div className="flex items-center justify-between border-b border-line/80 px-1 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-ink-3">Product discovery</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink">One product. A clearer view.</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Globe2 className="h-5 w-5" /></span>
              </div>

              <div className="my-5 flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#f2e8e4] text-brand">
                  <Heart className="h-7 w-7" strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">Your product, identified</p>
                  <p className="mt-1 text-xs leading-5 text-ink-2">Model, identifiers and selected variant stay attached to your saved item.</p>
                </div>
                <span className="hidden rounded-full bg-save-soft px-2.5 py-1 text-[10px] font-bold text-save sm:inline-flex">SAVED</span>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-2xl bg-[#f8efec] p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-brand"><Search className="h-4 w-4" /></span>
                  <div><p className="text-sm font-semibold text-ink">Matching offers</p><p className="mt-1 text-xs leading-5 text-ink-2">Connected sources are checked for the same model and variant.</p></div>
                  <ArrowUpRight className="ml-auto h-4 w-4 text-ink-3" />
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-[#f5eee5] p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#9b674e]"><ShieldCheck className="h-4 w-4" /></span>
                  <div><p className="text-sm font-semibold text-ink">Useful price context</p><p className="mt-1 text-xs leading-5 text-ink-2">Original currency, condition, availability and last check are kept visible.</p></div>
                </div>
              </div>

              <p className="mt-4 px-1 text-[10px] leading-4 text-ink-3">Coverage depends on connected providers and retailer data. Shipping, taxes and destination eligibility may not be available for every offer.</p>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-white/50 px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-10 max-w-xl text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-brand">A simple flow</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">From want to well-informed</h2>
              <p className="mt-3 text-sm leading-6 text-ink-2">Save the item. Check that it is the right one. Compare the information Wishly can verify.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {steps.map(({ number, icon: Icon, title, body }) => (
                <article key={number} className="glass-card group p-6 transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_65px_-38px_rgba(42,15,23,.42)] sm:p-7">
                  <div className="mb-8 flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand transition group-hover:scale-105"><Icon className="h-5 w-5" /></span>
                    <span className="font-display text-sm font-bold tracking-widest text-ink-3">{number}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-2">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#35151f] px-6 py-10 text-white sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between">
            <div className="absolute -right-10 -top-24 h-64 w-64 rounded-full bg-[#a4515d]/30 blur-3xl" />
            <div className="relative max-w-2xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-[#e9b9ae]">Your wishlist, with more context</p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Make room for the things you really want.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Keep your finds organized, share lists with people you care about, and follow qualifying price updates.</p>
            </div>
            <Button asChild size="lg" className="gradient-primary relative mt-7 h-12 rounded-2xl px-6 text-white hover:opacity-95 lg:mt-0">
              <Link to="/auth/register" className="flex items-center gap-2">Create your wishlist<ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-7 text-center text-xs text-ink-3 sm:px-8">
        <p>{t.landing.footer}</p>
        <p className="mt-2">© {new Date().getFullYear()} Wishly. Product discovery across supported sources.</p>
      </footer>
    </div>
  );
}
