import { decideTurn, wantsToFire } from './ai';
import { Cannonball } from './cannonball';
import { Explosion } from './explosion';
import type { Input } from './input';
import { Ship, SHIP_TYPES, type ShipTypeName, type Turn } from './ship';
import { Wind } from './wind';

const MAX_DT = 0.05;
const WAVE_DRIFT = 14;
const PLAYER_RELOAD = 1.4;

export const DIFFICULTIES = {
  easy: { label: 'Easy', reload: 2.2, leadShots: false, windAware: false },
  medium: { label: 'Medium', reload: 1.8, leadShots: true, windAware: false },
  hard: { label: 'Hard', reload: 1.4, leadShots: true, windAware: true },
} as const;

export type DifficultyName = keyof typeof DIFFICULTIES;

const PLAYER_COLOR = '#8b5a2b';
const ENEMY_COLOR = '#7a1f1f';

// Touch button dimensions — large enough for thumbs.
const BTN_SIZE = 72;
const BTN_MARGIN = 24;

interface Wave {
  x: number;
  y: number;
  r: number;
}

interface BtnRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private phase: 'idle' | 'battle' = 'idle';
  private difficulty: DifficultyName = 'easy';
  private player!: Ship;
  private enemy!: Ship;
  private cannonballs: Cannonball[] = [];
  private explosions: Explosion[] = [];
  private waves: Wave[] = [];
  private wind = new Wind();
  private lastTime = 0;
  private gameOverFired = false;

  /** Set by main.ts; called once when the battle ends (won = enemy sunk). */
  onGameOver: ((won: boolean) => void) | null = null;

  private readonly isTouchDevice = navigator.maxTouchPoints > 0;
  private btnLeft!: BtnRect;
  private btnRight!: BtnRect;
  private btnFire!: BtnRect;

  constructor(ctx: CanvasRenderingContext2D, input: Input) {
    this.ctx = ctx;
    this.input = input;

    const { width: w, height: h } = ctx.canvas;
    this.updateBtnRects(w, h);

    for (let i = 0; i < 40; i++) {
      this.waves.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 6 + Math.random() * 10,
      });
    }

    if (this.isTouchDevice) {
      ctx.canvas.addEventListener('touchstart', this.onTouch, { passive: true });
      ctx.canvas.addEventListener('touchmove', this.onTouch, { passive: true });
      ctx.canvas.addEventListener('touchend', this.onTouch, { passive: true });
      ctx.canvas.addEventListener('touchcancel', this.onTouch, { passive: true });
    }
  }

  private updateBtnRects(w: number, h: number) {
    const by = h - BTN_MARGIN - BTN_SIZE;
    this.btnLeft = { x: BTN_MARGIN, y: by, w: BTN_SIZE, h: BTN_SIZE };
    this.btnRight = { x: w - BTN_MARGIN - BTN_SIZE, y: by, w: BTN_SIZE, h: BTN_SIZE };
    this.btnFire = { x: w / 2 - BTN_SIZE / 2, y: by, w: BTN_SIZE, h: BTN_SIZE };
  }

  private hitBtn(btn: BtnRect, tx: number, ty: number): boolean {
    return tx >= btn.x && tx <= btn.x + btn.w && ty >= btn.y && ty <= btn.y + btn.h;
  }

  private onTouch = (e: TouchEvent) => {
    if (this.phase !== 'battle') return;
    const rect = this.ctx.canvas.getBoundingClientRect();
    const scaleX = this.ctx.canvas.width / rect.width;
    const scaleY = this.ctx.canvas.height / rect.height;
    let left = false;
    let right = false;
    let fire = false;
    for (const t of Array.from(e.touches)) {
      const tx = (t.clientX - rect.left) * scaleX;
      const ty = (t.clientY - rect.top) * scaleY;
      if (this.hitBtn(this.btnLeft, tx, ty)) left = true;
      if (this.hitBtn(this.btnRight, tx, ty)) right = true;
      if (this.hitBtn(this.btnFire, tx, ty)) fire = true;
    }
    this.input.setVirtual(left, right, fire);
  };

  startBattle(playerType: ShipTypeName, enemyType: ShipTypeName | 'random', difficulty: DifficultyName) {
    const { width: w, height: h } = this.ctx.canvas;
    let resolvedEnemy = enemyType;
    if (resolvedEnemy === 'random') {
      const types = Object.keys(SHIP_TYPES) as ShipTypeName[];
      resolvedEnemy = types[Math.floor(Math.random() * types.length)];
    }

    this.difficulty = difficulty;
    this.player = new Ship(w * 0.3, h * 0.6, -Math.PI / 4, PLAYER_COLOR, playerType);
    this.enemy = new Ship(w * 0.7, h * 0.3, Math.PI * 0.75, ENEMY_COLOR, resolvedEnemy);
    this.cannonballs = [];
    this.explosions = [];
    this.wind = new Wind();
    this.gameOverFired = false;
    this.phase = 'battle';
  }

  private get over(): boolean {
    return this.phase === 'battle' && (!this.player.alive || !this.enemy.alive);
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  onResize(w: number, h: number) {
    this.updateBtnRects(w, h);
    this.waves.forEach((wave) => {
      wave.x = Math.random() * w;
      wave.y = Math.random() * h;
    });
  }

  private frame = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, MAX_DT);
    this.lastTime = now;
    this.update(dt);
    this.input.clearPressed();
    this.render();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    if (this.phase === 'idle') return;

    const { width: w, height: h } = this.ctx.canvas;

    if (this.over && !this.gameOverFired) {
      this.gameOverFired = true;
      this.onGameOver?.(this.enemy.alive === false);
    }

    const diff = DIFFICULTIES[this.difficulty];
    const aiOpts = { leadShots: diff.leadShots, windAware: diff.windAware, wind: this.wind };

    this.wind.update(dt);
    const wdx = Math.cos(this.wind.direction) * WAVE_DRIFT * dt;
    const wdy = Math.sin(this.wind.direction) * WAVE_DRIFT * dt;
    for (const wave of this.waves) {
      wave.x = (wave.x + wdx + w) % w;
      wave.y = (wave.y + wdy + h) % h;
    }

    let turn: Turn = 0;
    if (this.input.isDown('ArrowLeft') || this.input.isDown('KeyA')) turn = -1;
    if (this.input.isDown('ArrowRight') || this.input.isDown('KeyD')) turn = 1;

    this.player.update(dt, turn, w, h, this.wind.speedFactor(this.player.heading));
    this.enemy.update(
      dt,
      this.over ? 0 : decideTurn(this.enemy, this.player, aiOpts),
      w,
      h,
      this.wind.speedFactor(this.enemy.heading),
    );

    if (!this.over) {
      if (this.input.isDown('Space') && this.player.reload <= 0) {
        this.fireBroadside(this.player, this.enemy, PLAYER_RELOAD);
      }
      if (wantsToFire(this.enemy, this.player, aiOpts) && this.enemy.reload <= 0) {
        this.fireBroadside(this.enemy, this.player, diff.reload);
      }
    }

    for (const ball of this.cannonballs) {
      ball.update(dt);
      const target = ball.owner === this.player ? this.enemy : this.player;
      if (!ball.spent && target.alive && target.containsPoint(ball.x, ball.y)) {
        ball.spent = true;
        target.takeHit();
        this.explosions.push(new Explosion(ball.x, ball.y));
      }
    }
    this.cannonballs = this.cannonballs.filter((b) => !b.spent);

    for (const ex of this.explosions) ex.update(dt);
    this.explosions = this.explosions.filter((ex) => !ex.done);
  }

  private fireBroadside(shooter: Ship, target: Ship, reload: number) {
    const bearing = Math.atan2(target.y - shooter.y, target.x - shooter.x);
    const side = Math.sin(bearing - shooter.heading) >= 0 ? 1 : -1;
    const dir = shooter.heading + (side * Math.PI) / 2;

    const fx = Math.cos(shooter.heading);
    const fy = Math.sin(shooter.heading);
    const sx = Math.cos(dir);
    const sy = Math.sin(dir);

    for (let i = 0; i < shooter.guns; i++) {
      const along = (i / (shooter.guns - 1) - 0.5) * (shooter.length / 2);
      this.cannonballs.push(
        new Cannonball(
          shooter.x + fx * along + sx * (shooter.width / 2),
          shooter.y + fy * along + sy * (shooter.width / 2),
          dir,
          shooter,
        ),
      );
    }
    shooter.reload = reload;
  }

  private render() {
    this.drawSea();
    if (this.phase === 'idle') return;

    const ctx = this.ctx;
    for (const ball of this.cannonballs) ball.draw(ctx);
    this.player.draw(ctx);
    this.enemy.draw(ctx);
    for (const ex of this.explosions) ex.draw(ctx);

    this.drawHealthRow(`You (${this.player.type})`, this.player, 0);
    this.drawHealthRow(
      `Enemy (${this.enemy.type} · ${DIFFICULTIES[this.difficulty].label})`,
      this.enemy,
      1,
    );
    this.drawWindIndicator();

    if (this.isTouchDevice && !this.over) this.drawTouchButtons();
  }

  private drawSea() {
    const ctx = this.ctx;
    const { width: w, height: h } = ctx.canvas;

    ctx.fillStyle = '#2e6da6';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    for (const wave of this.waves) {
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.r, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }

  private drawTouchButtons() {
    const ctx = this.ctx;

    const drawBtn = (btn: BtnRect, label: string, active: boolean) => {
      ctx.fillStyle = active ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)';
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    };

    const v = { left: this.input.isDown('ArrowLeft'), right: this.input.isDown('ArrowRight'), fire: this.input.isDown('Space') };
    drawBtn(this.btnLeft, '←', v.left);
    drawBtn(this.btnRight, '→', v.right);
    drawBtn(this.btnFire, '🔥', v.fire);
  }

  private drawHealthRow(label: string, ship: Ship, row: number) {
    const ctx = this.ctx;
    const segW = 14;
    const segH = 10;
    const gap = 3;
    const margin = 16;

    const y = margin + row * (segH + 12);
    const totalW = ship.maxHealth * (segW + gap) - gap;
    const x0 = ctx.canvas.width - margin - totalW;

    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x0 - 10, y + segH / 2);

    for (let i = 0; i < ship.maxHealth; i++) {
      ctx.fillStyle = i < ship.health ? '#4caf50' : 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(x0 + i * (segW + gap), y, segW, segH);
    }
  }

  private drawWindIndicator() {
    const ctx = this.ctx;
    const cx = 52;
    const cy = 52;
    const r = 28;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const hx = Math.cos(this.wind.direction);
    const hy = Math.sin(this.wind.direction);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - hx * (r - 9), cy - hy * (r - 9));
    ctx.lineTo(cx + hx * (r - 11), cy + hy * (r - 11));
    ctx.stroke();

    const tipX = cx + hx * (r - 6);
    const tipY = cy + hy * (r - 6);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - hx * 10 - hy * 5.5, tipY - hy * 10 + hx * 5.5);
    ctx.lineTo(tipX - hx * 10 + hy * 5.5, tipY - hy * 10 - hx * 5.5);
    ctx.closePath();
    ctx.fill();

    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('Wind', cx, cy + r + 14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    const pct = Math.round(this.wind.speedFactor(this.player.heading) * 100);
    ctx.fillText(`Sails ${pct}%`, cx, cy + r + 32);
  }
}
