/* ========== サンプルデータ ========== */
function seedSample() {
  cards = [
    {
      id: '1',
      question: '民法第1条の3つの基本原則は？',
      answer: '①公共の福祉適合の原則\n②信義誠実の原則\n③権利濫用禁止の原則',
      deck: 'デフォルト',
      subdeck: '',
      lastRating: null,
      created: new Date().toISOString()
    },
    {
      id: '2',
      question: '憲法第9条の内容は？',
      answer: '第1項：戦争の放棄\n第2項：戦力の不保持、交戦権の否認',
      deck: 'デフォルト',
      subdeck: '',
      lastRating: null,
      created: new Date().toISOString()
    },
    {
      id: '3',
      question: '尊属殺重罰規定違憲判決のポイントは？',
      answer: '刑法200条は法の下の平等（憲法14条1項）に違反し無効。',
      deck: 'デフォルト',
      subdeck: '',
      lastRating: null,
      created: new Date().toISOString()
    }
  ];
  LS.save('fc_cards', cards);
}

async function seedFS() {
  const ss = [
    {
      question: '民法第1条の3つの基本原則は？',
      answer: '①公共の福祉適合の原則\n②信義誠実の原則\n③権利濫用禁止の原則',
      deck: 'デフォルト',
      subdeck: '',
      lastRating: null,
      created: new Date().toISOString()
    },
    {
      question: '憲法第9条の内容は？',
      answer: '第1項：戦争の放棄\n第2項：戦力の不保持、交戦権の否認',
      deck: 'デフォルト',
      subdeck: '',
      lastRating: null,
      created: new Date().toISOString()
    }
  ];

  for (const s of ss) {
    const r = await cardsCol().add(s);
    cards.push({ id: r.id, ...s });
  }
}

/* ========== デッキ操作 ========== */
function getDeck(n) {
  return decks.find(d => d.name === n);
}

function deckCards(n) {
  return cards.filter(c => c.deck === n);
}

function subdeckCards(n, s) {
  return cards.filter(c => c.deck === n && c.subdeck === s);
}

function categoryCards(n, s, cat) {
  return cards.filter(c => c.deck === n && c.subdeck === s && c.category === cat);
}

/* ========== カウント関数 ========== */
function countR(a, r) {
  return a.filter(c => c.lastRating === r).length;
}

function countU(a) {
  return a.filter(c => !c.lastRating).length;
}

/* ========== ユーティリティ ========== */
function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseCSVLine(line) {
  const r = [];
  let c = '', q = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        c += '"';
        i++;
      } else if (ch === '"') {
        q = false;
      } else {
        c += ch;
      }
    } else {
      if (ch === '"') {
        q = true;
      } else if (ch === ',') {
        r.push(c);
        c = '';
      } else {
        c += ch;
      }
    }
  }

  r.push(c);
  return r;
}

/* ========== フォーム処理 ========== */
function resetForm() {
  editingId = null;
  document.getElementById('card-question').value = '';
  document.getElementById('card-answer').value = '';
  document.getElementById('card-detail').value = '';
  document.getElementById('card-category-select').value = '';
  document.getElementById('category-select-group').style.display = 'none';
  document.getElementById('manage-form-title').textContent = 'カードを追加';
  document.getElementById('card-submit-btn').textContent = '追加';
  document.getElementById('card-cancel-btn').style.display = 'none';
}

function autoResizeMemo(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

/* ========== TODO: 以下の関数は大型なため、段階的に index.html から移行予定 ========== */
// - renderDeckList()
// - startStudy()
// - getStudyPool()
// - renderStudyCard()
// - renderManageList()
// - renderStats()
// - editCardAction()
// など
