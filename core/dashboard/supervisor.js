/**
 * Bot process supervisor.
 *
 * THE DASHBOARD MUST NOT LIVE INSIDE THE BOT PROCESS. A dashboard served by the
 * very process it is supposed to restart cannot restart it, and it is gone
 * exactly when somebody needs it: after a crash. So the supervisor is the
 * parent and the bot is a child it can start, stop and restart.
 *
 * `main.js` stays untouched and still works standalone. `node main.js` does not
 * load a single line of the web stack.
 */

const { fork, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const config = require('../config');

const ROOT = config.BASE_DIR;
const BOT_ENTRY = path.join(ROOT, 'main.js');
const ENV_PATH = path.join(ROOT, '.env');

const MAX_LOG_LINES = 500;

// The crash-restart policy mirrors the systemd unit: on failure, a few attempts
// in a short window, then stay down rather than crash-loop.
const RESTART_DELAY_MS = 5_000;
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 120_000;

class BotSupervisor extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {boolean} [options.mirrorToConsole=true]
   *   Also write the bot's output to our own stdout. The bot is forked with
   *   silent:true so its output can be captured for the dashboard console, but
   *   capturing must not mean HIDING: without this, `npm run dashboard` shows a
   *   silent terminal and nobody can tell whether the bot came up.
   */
  constructor({ mirrorToConsole = true } = {}) {
    super();
    this.mirrorToConsole = mirrorToConsole;
    this.child = null;
    /** 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' */
    this.status = 'stopped';
    this.logs = [];
    this.startedAt = null;
    this.intentionalStop = false;
    this.restartTimes = [];
    this.restartTimer = null;
    this.busy = false;
  }

  // ── Logs ───────────────────────────────────────────────────────────────────

  pushLog(line) {
    for (const part of String(line).split('\n')) {
      if (part.length === 0) continue;
      if (this.mirrorToConsole) process.stdout.write(`${part}\n`);

      this.logs.push(part);
      if (this.logs.length > MAX_LOG_LINES) this.logs.shift();
      this.emit('log', part);
    }
  }

  getLogs() {
    return [...this.logs];
  }

  setStatus(next) {
    if (this.status === next) return;
    this.status = next;
    this.emit('status', next);
  }

  getState() {
    return {
      status: this.status,
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    if (this.child) return { ok: false, error: 'The bot is already running.' };

    this.setStatus('starting');
    this.intentionalStop = false;
    this.cancelScheduledRestart();

    // Re-read .env from disk before every start. The dashboard can edit it, and
    // a plain fork({ env: process.env }) would hand the bot the values loaded
    // ONCE at dashboard boot, so a rotated token would silently not take effect
    // even after a restart. dotenv.parse does not touch the running env; the
    // file is merged over process.env so the file wins for the keys it defines,
    // which is the entire point of having edited it.
    let childEnv = process.env;
    try {
      const fileEnv = require('dotenv').parse(fs.readFileSync(ENV_PATH));
      Object.assign(process.env, fileEnv);
      childEnv = { ...process.env, ...fileEnv };
    } catch { /* no .env (env passed some other way), inherit as-is */ }

    // silent: true pipes the child's output to us instead of inheriting it,
    // which is what lets the dashboard stream a live log.
    const child = fork(BOT_ENTRY, [], { cwd: ROOT, silent: true, env: childEnv });

    this.child = child;
    this.startedAt = Date.now();

    child.stdout?.on('data', (d) => this.pushLog(d.toString()));
    child.stderr?.on('data', (d) => this.pushLog(d.toString()));

    child.on('spawn', () => {
      this.setStatus('running');
      this.pushLog('==> [supervisor] bot process started');
    });

    child.on('error', (err) => {
      this.pushLog(`==> [supervisor] failed to spawn the bot: ${err.message}`);
      this.child = null;
      this.setStatus('crashed');
    });

    child.on('exit', (code, signal) => {
      this.child = null;
      this.startedAt = null;
      this.pushLog(`==> [supervisor] bot exited (code=${code} signal=${signal ?? 'none'})`);

      if (this.intentionalStop) {
        this.setStatus('stopped');
        return;
      }
      this.setStatus('crashed');
      this.scheduleRestart();
    });

    return { ok: true };
  }

  /**
   * Restart after an unexpected exit, but only a few times inside a short
   * window. A bot that crashes on boot (bad config, bad token) must NOT be
   * restarted for ever: that only buries the real error in a crash loop.
   */
  scheduleRestart() {
    const now = Date.now();
    this.restartTimes = this.restartTimes.filter(t => now - t < RESTART_WINDOW_MS);

    if (this.restartTimes.length >= MAX_RESTARTS) {
      this.pushLog(
        `==> [supervisor] the bot crashed ${MAX_RESTARTS} times within ${RESTART_WINDOW_MS / 1000}s. `
        + 'Not restarting again: fix the error above and start it by hand.',
      );
      return;
    }

    this.restartTimes.push(now);
    this.pushLog(`==> [supervisor] restarting in ${RESTART_DELAY_MS / 1000}s ...`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.child) this.start();
    }, RESTART_DELAY_MS);
    this.restartTimer.unref?.();
  }

  /**
   * Cancel a pending crash-restart. Without this a Stop issued during the five
   * second restart window is ignored and the bot comes back up against the
   * operator's intent.
   */
  cancelScheduledRestart() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  async stop({ timeoutMs = 10_000 } = {}) {
    // A crash may have left the child null with a restart pending, so cancel it
    // first: "Stop" has to mean stopped even when clicked mid-window.
    this.cancelScheduledRestart();
    if (!this.child) {
      this.intentionalStop = true;
      this.setStatus('stopped');
      return { ok: false, error: 'The bot is not running.' };
    }

    this.intentionalStop = true;
    this.setStatus('stopping');
    const child = this.child;

    return new Promise((resolve) => {
      const kill = setTimeout(() => {
        if (child && !child.killed) {
          this.pushLog('==> [supervisor] the bot did not exit in time, sending SIGKILL');
          child.kill('SIGKILL');
        }
      }, timeoutMs);
      kill.unref?.();

      child.once('exit', () => {
        clearTimeout(kill);
        resolve({ ok: true });
      });

      child.kill('SIGTERM');
    });
  }

  async restart() {
    if (this.child) await this.stop();
    this.restartTimes = []; // an operator-requested restart is not a crash
    return this.start();
  }

  /**
   * git pull, npm install, restart. Output is streamed into the log ring buffer
   * so the operator can watch it happen in the dashboard console.
   */
  async update() {
    if (this.busy) return { ok: false, error: 'Another operation is already running.' };
    this.busy = true;

    try {
      this.pushLog('==> [supervisor] git pull');
      const pull = await this.run('git', ['pull']);
      if (!pull.ok) return { ok: false, error: 'git pull failed', detail: pull.output };

      this.pushLog('==> [supervisor] npm install --omit=dev');
      const install = await this.run('npm', ['install', '--omit=dev']);
      if (!install.ok) return { ok: false, error: 'npm install failed', detail: install.output };

      this.pushLog('==> [supervisor] restarting the bot with the new version');
      await this.restart();

      return { ok: true, output: `${pull.output}\n${install.output}`.trim() };
    } finally {
      this.busy = false;
    }
  }

  /** Run a command in the repo root, capturing its output into the log buffer. */
  run(cmd, args) {
    return new Promise((resolve) => {
      // shell: true so `npm` resolves to npm.cmd on Windows.
      const proc = spawn(cmd, args, { cwd: ROOT, shell: true });
      let output = '';

      const collect = (d) => {
        const text = d.toString();
        output += text;
        this.pushLog(text);
      };
      proc.stdout?.on('data', collect);
      proc.stderr?.on('data', collect);

      proc.on('error', (err) => resolve({ ok: false, output: `${output}\n${err.message}` }));
      proc.on('close', (code) => resolve({ ok: code === 0, output: output.trim() }));
    });
  }
}

module.exports = { BotSupervisor, BOT_ENTRY, MAX_LOG_LINES };
