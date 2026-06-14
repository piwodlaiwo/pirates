import { Game, DIFFICULTIES, type DifficultyName } from './game';
import { Input } from './input';
import { SHIP_TYPES, type ShipTypeName } from './ship';
import './style.css';

// ── Canvas setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  game.onResize(canvas.width, canvas.height);
}

// ── Game instance ─────────────────────────────────────────────────────────────

const input = new Input();
const game = new Game(ctx, input);
game.start();

window.addEventListener('resize', resize);
resize();

// ── Selection state ───────────────────────────────────────────────────────────

const SPEED_LABELS: Record<ShipTypeName, string> = {
  small: 'fast',
  medium: 'steady',
  large: 'slow',
};

const NEXT_DIFFICULTY: Partial<Record<DifficultyName, DifficultyName>> = {
  easy: 'medium',
  medium: 'hard',
};

let selectedPlayer: ShipTypeName = 'small';
let selectedEnemy: ShipTypeName | 'random' = 'random';
let selectedDifficulty: DifficultyName = 'easy';

// ── Build the selection cards ─────────────────────────────────────────────────

function makeCard(label: string, stat: string, key: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'card';
  btn.dataset.key = key;
  btn.innerHTML = `<div class="card-name">${label}</div><div class="card-stat">${stat}</div>`;
  return btn;
}

function selectCard(row: Element, key: string) {
  row.querySelectorAll('.card').forEach((c) => c.classList.toggle('selected', (c as HTMLElement).dataset.key === key));
}

// Player ship cards
const playerRow = document.getElementById('player-cards')!;
(Object.keys(SHIP_TYPES) as ShipTypeName[]).forEach((type) => {
  const s = SHIP_TYPES[type];
  const card = makeCard(
    type[0].toUpperCase() + type.slice(1),
    `${s.guns} guns · ${SPEED_LABELS[type]} · ${s.maxHealth} hp`,
    type,
  );
  card.addEventListener('click', () => {
    selectedPlayer = type;
    selectCard(playerRow, type);
  });
  playerRow.appendChild(card);
});
selectCard(playerRow, selectedPlayer);

// Enemy ship cards (includes Random)
const enemyRow = document.getElementById('enemy-cards')!;
(Object.keys(SHIP_TYPES) as ShipTypeName[]).forEach((type) => {
  const s = SHIP_TYPES[type];
  const card = makeCard(
    type[0].toUpperCase() + type.slice(1),
    `${s.guns} guns · ${SPEED_LABELS[type]} · ${s.maxHealth} hp`,
    type,
  );
  card.addEventListener('click', () => {
    selectedEnemy = type;
    selectCard(enemyRow, type);
  });
  enemyRow.appendChild(card);
});
const randomCard = makeCard('Random', 'any of the three', 'random');
randomCard.addEventListener('click', () => {
  selectedEnemy = 'random';
  selectCard(enemyRow, 'random');
});
enemyRow.appendChild(randomCard);
selectCard(enemyRow, selectedEnemy);

// Difficulty cards
const diffRow = document.getElementById('difficulty-cards')!;
(Object.keys(DIFFICULTIES) as DifficultyName[]).forEach((name) => {
  const blurbs: Record<DifficultyName, string> = {
    easy: 'slow reload · aims at you',
    medium: 'faster reload · leads shots',
    hard: 'same reload · leads shots · sails wind',
  };
  const card = makeCard(DIFFICULTIES[name].label, blurbs[name], name);
  card.addEventListener('click', () => {
    selectedDifficulty = name;
    selectCard(diffRow, name);
  });
  diffRow.appendChild(card);
});
selectCard(diffRow, selectedDifficulty);

// ── Set Sail ─────────────────────────────────────────────────────────────────

const menuOverlay = document.getElementById('menu-overlay')!;
const gameoverOverlay = document.getElementById('gameover-overlay')!;
const gameoverTitle = document.getElementById('gameover-title')!;
const btnReplay = document.getElementById('btn-replay')!;
const btnHarder = document.getElementById('btn-harder')!;
const harderLabel = document.getElementById('harder-label')!;

function setSail() {
  menuOverlay.classList.add('hidden');
  game.startBattle(selectedPlayer, selectedEnemy, selectedDifficulty);
}

document.getElementById('set-sail')!.addEventListener('click', setSail);

// ── Game-over handling ────────────────────────────────────────────────────────

game.onGameOver = (won: boolean) => {
  gameoverTitle.textContent = won ? 'Enemy ship destroyed!' : 'Your ship was destroyed!';

  const nextDiff = NEXT_DIFFICULTY[selectedDifficulty];
  if (nextDiff) {
    harderLabel.textContent = DIFFICULTIES[nextDiff].label;
    btnHarder.classList.remove('hidden');
  } else {
    btnHarder.classList.add('hidden');
  }

  gameoverOverlay.classList.remove('hidden');
};

btnReplay.addEventListener('click', () => {
  gameoverOverlay.classList.add('hidden');
  game.startBattle(selectedPlayer, selectedEnemy, selectedDifficulty);
});

btnHarder.addEventListener('click', () => {
  const nextDiff = NEXT_DIFFICULTY[selectedDifficulty];
  if (nextDiff) {
    selectedDifficulty = nextDiff;
    selectCard(diffRow, selectedDifficulty);
  }
  gameoverOverlay.classList.add('hidden');
  game.startBattle(selectedPlayer, selectedEnemy, selectedDifficulty);
});

// R key for keyboard users: same as Play Again
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && !gameoverOverlay.classList.contains('hidden')) {
    gameoverOverlay.classList.add('hidden');
    game.startBattle(selectedPlayer, selectedEnemy, selectedDifficulty);
  }
});
