import { useEffect, useState } from 'react';
import {
  SlidersHorizontalIcon, MessagesSquareIcon, TerminalIcon, CoinsIcon,
  ShieldCheckIcon, PaletteIcon, LogOutIcon, MenuIcon, LanguagesIcon,
} from 'lucide-react';
import { api, logout } from './api.js';
import { useRouter, parseRoute, viewPath } from './router.js';
import { useI18n } from './i18n.jsx';
import { cn } from '@/lib/utils.js';
import { Button } from '@/components/ui/button.jsx';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet.jsx';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select.jsx';

import Config from './views/Config.jsx';
import Texts from './views/Texts.jsx';
import BotControl from './views/BotControl.jsx';
import Points from './views/Points.jsx';
import Access from './views/Access.jsx';
import Settings from './views/Settings.jsx';

/**
 * The navigation is derived from the permissions the SERVER reported. This is
 * only cosmetic: every route is enforced server-side as well. Hiding an item
 * somebody cannot use is a UX decision, never the security boundary.
 */
const NAV = [
  { id: 'config',   icon: SlidersHorizontalIcon, permission: ['config.view', 'config.edit'] },
  { id: 'texts',    icon: MessagesSquareIcon,    permission: ['config.view', 'config.edit'] },
  { id: 'bot',      icon: TerminalIcon,          permission: 'bot.control' },
  { id: 'points',   icon: CoinsIcon,             permission: ['points.view', 'points.manage'] },
  { id: 'access',   icon: ShieldCheckIcon,       permission: 'access.manage' },
  { id: 'settings', icon: PaletteIcon,           permission: ['settings.view', 'settings.edit'] },
];

const allowed = (me, item) => {
  if (!item.permission) return true;
  if (me.isOwner) return true;
  const list = Array.isArray(item.permission) ? item.permission : [item.permission];
  return list.some(p => me.permissions.includes(p));
};

function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 px-2 font-display text-[15px] font-bold">
      <span className="size-2 rounded-full bg-primary" />
      {t('nav.brand')}
    </div>
  );
}

/**
 * The per-user language picker.
 *
 * The list is whatever locale files exist, so a new translation appears here on
 * its own. THE CHOICE IS PERSONAL and lives in localStorage: it changes nothing
 * for anyone else, needs no permission, and is unrelated to the language the BOT
 * speaks in Discord.
 */
function LanguagePicker() {
  const { lang, languages, setLang, t } = useI18n();
  if (languages.length < 2) return null;
  return (
    <div className="mb-2.5 px-1">
      <Select value={lang} onValueChange={setLang}>
        <SelectTrigger size="sm" className="w-full" aria-label={t('common.language')}>
          <span className="flex min-w-0 items-center gap-2">
            <LanguagesIcon className="size-3.5 shrink-0 opacity-70" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {languages.map(l => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function NavContent({ me, view, onSelect }) {
  const { t, tn } = useI18n();
  const items = NAV.filter(n => allowed(me, n));
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="px-1 pb-3 pt-1"><Brand /></div>

      <nav className="flex flex-col gap-1">
        {items.map(item => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground hover:bg-white/5 hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t(`nav.${item.id}`)}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border pt-3">
        <div className="mb-2.5 flex items-center gap-2.5 px-1">
          {me.user.avatar
            ? <img src={me.user.avatar} alt="" className="size-8 rounded-full" />
            : <div className="size-8 rounded-full bg-white/8" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{me.user.name}</div>
            <div className="text-muted-foreground text-xs">
              {me.isOwner ? t('app.serverOwner') : tn('app.permissionCount', me.permissions.length)}
            </div>
          </div>
        </div>
        <LanguagePicker />
        <Button variant="outline" size="sm" className="w-full" onClick={logout}>
          <LogOutIcon /> {t('app.signOut')}
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { path, navigate } = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    api.me()
      .then(setMe)
      .catch(err => setError({ message: err.message, portalClosed: err.portalClosed === true }));
  }, []);

  // The view comes from the URL, gated by what this member may see. An unknown
  // or off-limits path falls back to the first view they are allowed to open.
  const route = parseRoute(path);
  const allowedViews = me ? NAV.filter(n => allowed(me, n)).map(n => n.id) : [];
  const view = me
    ? (route.view && allowedViews.includes(route.view) ? route.view : (allowedViews[0] ?? 'config'))
    : null;
  const param = view === route.view ? route.param : null;

  // Keep the address bar canonical, so F5 reloads the same page instead of the
  // first one. `replace`, so it adds no history entry.
  useEffect(() => {
    if (!me) return;
    const want = viewPath(view, param);
    if (window.location.pathname !== want) navigate(want, { replace: true });
  }, [me, view, param, navigate]);

  if (error) {
    // Staff only, and this member has no access: offer a way OUT rather than a
    // sign-in button that would bounce them straight back here.
    if (error.portalClosed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
          <h1 className="font-display text-2xl font-bold">{t('app.title')}</h1>
          <div className="text-muted-foreground bg-muted/40 border-border max-w-sm rounded-lg border px-4 py-3 text-sm">
            {error.message} {t('app.askAdmin')}
          </div>
          <Button variant="outline" onClick={logout}><LogOutIcon /> {t('app.signOut')}</Button>
          <div className="w-44"><LanguagePicker /></div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
        <h1 className="font-display text-2xl font-bold">{t('app.title')}</h1>
        <div className="text-destructive bg-destructive/10 border-destructive/30 max-w-sm rounded-lg border px-4 py-3 text-sm">
          {error.message}
        </div>
        <Button asChild><a href="/auth/login">{t('app.signIn')}</a></Button>
        <div className="w-44"><LanguagePicker /></div>
      </div>
    );
  }

  if (!me) {
    return <div className="text-muted-foreground flex min-h-screen items-center justify-center">{t('common.loading')}</div>;
  }

  const select = (id) => { navigate(viewPath(id)); setMobileOpen(false); };

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar hidden w-60 shrink-0 border-r border-sidebar-border md:block">
        <div className="sticky top-0 h-screen">
          <NavContent me={me} view={view} onSelect={select} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-sidebar sticky top-0 z-30 flex items-center gap-2 border-b border-sidebar-border px-3 py-2.5 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><MenuIcon /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">{t('nav.navigation')}</SheetTitle>
              <NavContent me={me} view={view} onSelect={select} />
            </SheetContent>
          </Sheet>
          <Brand />
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {view === 'config' && (
            <Config
              me={me}
              featureId={param}
              onOpen={id => navigate(viewPath('config', id))}
              onClose={() => navigate(viewPath('config'))}
            />
          )}
          {view === 'texts' && <Texts me={me} />}
          {view === 'bot' && <BotControl me={me} />}
          {view === 'points' && <Points me={me} />}
          {view === 'access' && <Access me={me} />}
          {view === 'settings' && <Settings me={me} />}
        </main>
      </div>
    </div>
  );
}
