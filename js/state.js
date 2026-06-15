/* ========== グローバル状態管理 ========== */
// 認証関連
let currentUser = null;
let isGuest = false;

// データ
let cards = [];
let decks = [];
let stats = { reviews: 0, incorrect: 0, correct: 0, understood: 0 };

// 学習中の状態
let currentDeck = null;
let currentSubdeck = null;
let currentCategory = null;
let studyCards = [];
let studyIndex = 0;
let answerShown = false;
let studyFilter = 'all';

// UI状態
let isPlaying = false;
let playTimer = null;
let editingId = null;
let studySort = null;
let autoShowDetail = false;

// 公開デッキ学習
let isPublicStudy = false;

// ナビゲーション
let activeHomeTab = 'my';
let currentPage = 'home';
let previousPage = 'home';

// 展開状態
let expandedDecks = new Set();
let expandedSubdecks = new Set();

// カード管理フィルタ
let manageSubdeckFilter = '';
let manageSearch = '';
let managePage = 0;
const MANAGE_PER_PAGE = 50;

// 統計
let dailyStats = {};
let statsChart = null;
let statsRange = 'day';
let statsFilterDeck = '';

// Chat
let chatHistory = [];

/* ========== ローカルストレージ管理 ========== */
const LS = {
  load(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  save(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }
};

/* ========== ユーティリティ関数 ========== */
function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.classList.add('hidden');
}

function showToast(msg, duration = 2000) {
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    padding: 12px 24px;
    border-radius: 10px;
    z-index: 2000;
    font-size: 0.9rem;
    animation: slideUp 0.3s ease-out;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, duration);
}
