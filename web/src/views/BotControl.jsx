import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { PlayIcon, SquareIcon, RotateCwIcon, RefreshCwIcon, ArrowDownIcon } from 'lucide-react';
import { api } from '../api.js';
import { Banner, SectionTitle, fmtDuration } from '../ui.jsx';
import { parseAnsi } from '../ansi.js';
import { useI18n } from '../i18n.jsx';
import { cn } from '@/lib/utils.js';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';

/** One log line, with the bot's ANSI colours turned into styled spans. */
function LogLine({ line }) {
  const runs = parseAnsi(line);
  if (runs.length === 0) return <div>&nbsp;</div>;
  return <div>{runs.map((run, i) => <span key={i} style={run.style}>{run.text}</span>)}</div>;
}

/**
 * How close to the bottom still counts as "following the tail". A couple of
 * pixels of slack, because fractional scroll positions and zoom levels mean
 * scrollTop rarely hits scrollHeight - clientHeight exactly.
 */
const STICK_THRESHOLD_PX = 24;

const DOT = {
  running: 'bg-primary', stopped: 'bg-muted-foreground', crashed: 'bg-destructive',
  starting: 'bg-warn', stopping: 'bg-warn',
};

const MAX_LINES = 500;

export default function BotControl({ me }) {
  const { t } = useI18n();
  const [state, setState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [live, setLive] = useState(false);

  const consoleRef = useRef(null);
  // Whether the console should keep following new output. In a ref so the event
  // stream below can read it without re-subscribing on every render.
  const stickToBottom = useRef(true);
  const [scrolledUp, setScrolledUp] = useState(false);

  /**
   * The log arrives as server-sent events rather than by polling.
   *
   * The dashboard is the bot's PARENT process, so it stays reachable while the
   * bot is stopped or crashed, which is exactly when this screen matters. SSE is
   * one-way, plain HTTP, needs no extra dependency and reconnects on its own.
   */
  useEffect(() => {
    const source = new EventSource('/api/bot/logs/stream', { withCredentials: true });

    source.addEventListener('state', (e) => {
      try { setState(JSON.parse(e.data)); } catch { /* a malformed frame is not worth a crash */ }
    });
    source.addEventListener('log', (e) => {
      try {
        const line = JSON.parse(e.data);
        setLogs(prev => (prev.length >= MAX_LINES ? [...prev.slice(1), line] : [...prev, line]));
      } catch { /* same */ }
    });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);

    return () => source.close();
  }, []);

  // Follow the tail, but only while the reader is already at the bottom.
  // Scrolling up is how somebody reads a stack trace, and yanking them back down
  // a moment later makes that impossible.
  useLayoutEffect(() => {
    const el = consoleRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const handleConsoleScroll = () => {
    const el = consoleRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    stickToBottom.current = atBottom;
    setScrolledUp(!atBottom);
  };

  const jumpToLatest = () => {
    const el = consoleRef.current;
    if (!el) return;
    stickToBottom.current = true;
    setScrolledUp(false);
    el.scrollTop = el.scrollHeight;
  };

  const refresh = () => {
    api.bot().then(setState).catch(e => setError(e.message));
    api.botLogs().then(({ lines }) => setLogs(lines)).catch(() => {});
  };

  const act = async (action) => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await api.botAction(action);
      const label = t(`bot.${action}`);
      setNotice(t(res.output ? 'bot.actionFinished' : 'bot.actionTriggered', { action: label }));
      setTimeout(refresh, 1500);
    } catch (e) {
      setError(e.detail ? `${e.message}: ${e.detail}` : e.message);
    } finally {
      setBusy(null);
    }
  };

  const status = state?.status ?? 'stopped';
  const running = status === 'running';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t('bot.title')}</SectionTitle>
        <span className={cn('text-xs', live ? 'text-primary' : 'text-muted-foreground')}>
          {live ? t('bot.live') : t('bot.reconnecting')}
        </span>
      </div>

      <Banner type="error" onClose={() => setError(null)}>{error}</Banner>
      <Banner type="success" onClose={() => setNotice(null)}>{notice}</Banner>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={cn('size-2.5 rounded-full', DOT[status])} />
              <strong>{t(`bot.${status}`)}</strong>
              {state?.pid ? <span className="text-muted-foreground text-sm">{t('bot.pid', { pid: state.pid })}</span> : null}
              {state?.uptimeMs ? <span className="text-muted-foreground text-sm">{t('bot.uptime', { uptime: fmtDuration(state.uptimeMs) })}</span> : null}
            </div>
            <Button variant="outline" size="sm" onClick={refresh}><RefreshCwIcon /> {t('common.refresh')}</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || running} onClick={() => act('start')}><PlayIcon /> {t('bot.start')}</Button>
            <Button disabled={busy} onClick={() => act('restart')}><RotateCwIcon /> {t('bot.restart')}</Button>
            <Button variant="destructive" disabled={busy || !running} onClick={() => act('stop')}><SquareIcon /> {t('bot.stop')}</Button>
            {/* Pulling and installing runs whatever the remote contains, which is
                a bigger thing than restarting a process, so it is owner-only. */}
            {me.isOwner && (
              <Button variant="secondary" disabled={busy} onClick={() => act('update')}>
                <RefreshCwIcon /> {busy === 'update' ? t('bot.updating') : t('bot.update')}
              </Button>
            )}
          </div>
          {busy === 'update' && (
            <p className="text-muted-foreground text-xs">
              {t('bot.updateHint')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('bot.consoleTitle')}</CardTitle>
          <CardDescription>
            {t('bot.consoleHint', { max: MAX_LINES })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div
              ref={consoleRef}
              onScroll={handleConsoleScroll}
              className="ansi-console h-[calc(100vh-24rem)] min-h-[420px] overflow-y-auto rounded-md border bg-black/40 p-3 text-[11.5px] leading-relaxed"
            >
              {logs.length
                ? logs.map((line, i) => <LogLine key={i} line={line} />)
                : <span className="text-muted-foreground">{t('bot.noOutput')}</span>}
            </div>
            {scrolledUp && (
              <Button size="sm" variant="secondary" className="absolute bottom-3 right-5 shadow-md" onClick={jumpToLatest}>
                <ArrowDownIcon /> {t('bot.jumpToLatest')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
