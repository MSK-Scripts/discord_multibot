import { useCallback, useEffect, useState } from 'react';
import { RefreshCwIcon, PlusIcon, MinusIcon } from 'lucide-react';
import { api } from '../api.js';
import { Banner, Empty, SectionTitle } from '../ui.jsx';
import { useI18n, getLocale } from '../i18n.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table.jsx';

/**
 * The minigame leaderboard, and a way to correct a balance.
 *
 * An adjustment is a DELTA, not a new total: two people fixing the same balance
 * at the same moment would otherwise overwrite each other, and the database adds
 * in one statement precisely so they do not.
 */
export default function Points({ me }) {
  const canManage = me.isOwner || me.permissions.includes('points.manage');
  const { t } = useI18n();

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState('');
  const [delta, setDelta] = useState(10);

  const load = useCallback(() => {
    api.points(50).then(d => setRows(d.rows)).catch(e => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const adjust = async (id, amount) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.adjustPoints(id, amount);
      setNotice(`${id}: ${result.old} → ${result.new}`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!rows) return <Empty>{t('common.loading')}</Empty>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t('points.title')}</SectionTitle>
        <Button variant="outline" size="sm" onClick={load}><RefreshCwIcon /> {t('common.refresh')}</Button>
      </div>

      <Banner type="error" onClose={() => setError(null)}>{error}</Banner>
      <Banner type="success" onClose={() => setNotice(null)}>{notice}</Banner>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t('points.adjustTitle')}</CardTitle>
            <CardDescription>
              {t('points.adjustHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[16rem] flex-col gap-1.5">
                <Label>{t('points.userId')}</Label>
                <Input
                  value={userId}
                  onChange={e => setUserId(e.target.value.trim())}
                  placeholder={t('points.userIdPlaceholder')}
                  className="font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('points.amount')}</Label>
                <Input
                  type="number"
                  value={delta}
                  onChange={e => setDelta(Number(e.target.value) || 0)}
                  className="w-28 tabular-nums"
                />
              </div>
              <div className="flex gap-2 pb-0.5">
                <Button disabled={busy || !userId || !delta} onClick={() => adjust(userId, Math.abs(delta))}>
                  <PlusIcon /> {t('points.add')}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !userId || !delta}
                  onClick={() => adjust(userId, -Math.abs(delta))}
                >
                  <MinusIcon /> {t('points.subtract')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('points.leaderboardTitle')}</CardTitle>
          <CardDescription>{t('points.leaderboardHint', { count: rows.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <Empty>{t('points.empty')}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{t('points.colMember')}</TableHead>
                    <TableHead className="text-right">{t('points.colPoints')}</TableHead>
                    {canManage && <TableHead className="text-right">{t('points.colAdjust')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={row.userId}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.user?.avatar
                            ? <img src={row.user.avatar} alt="" className="size-6 rounded-full" />
                            : <div className="bg-muted size-6 rounded-full" />}
                          <span className="font-medium">{row.user?.name ?? row.userId}</span>
                          {row.user && !row.user.inGuild && (
                            <span className="text-muted-foreground text-xs">{t('points.leftServer')}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.balance.toLocaleString(getLocale())}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => adjust(row.userId, 10)}>+10</Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => adjust(row.userId, -10)}>−10</Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
