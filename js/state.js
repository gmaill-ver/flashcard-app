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


// ハッシュタグ
let globalMemoHashtags = {}; // グローバルノートのハッシュタグ {tag: メモテキスト}
let selectedGlobalHashtag = null; // 選択中のハッシュタグ
let hashtagManageMode = false; // ハッシュタグ管理モード

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

