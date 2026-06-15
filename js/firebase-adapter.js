/* ========== Firebase アダプターレイヤー ========== */
// Firestoreコレクション参照ヘルパー
function userDoc() {
  return db.collection('users').doc(currentUser.uid);
}

function cardsCol() {
  return userDoc().collection('cards');
}

/* ========== データ変換（マイグレーション） ========== */
function migrateDecks(r) {
  if (!r || !r.length) {
    return [{
      name: 'デフォルト',
      subdecks: [],
      publishedId: null,
      cardCount: 0,
      ratings: { incorrect: 0, correct: 0, understood: 0 }
    }];
  }

  // 古い形式: 文字列配列 → 新形式に変換
  if (typeof r[0] === 'string') {
    return r.map(n => ({
      name: n,
      subdecks: [],
      publishedId: null,
      cardCount: 0,
      ratings: { incorrect: 0, correct: 0, understood: 0 }
    }));
  }

  // オブジェクト配列: 欠落フィールドを補完
  return r.map(d => ({
    ...d,
    subdecks: d.subdecks || [],
    publishedId: d.publishedId || null,
    cardCount: d.cardCount != null ? d.cardCount : 0,
    ratings: d.ratings || { incorrect: 0, correct: 0, understood: 0 }
  }));
}

function migrateStats(r) {
  const s = r || {};
  return {
    reviews: s.reviews || 0,
    incorrect: s.incorrect || s.hard || 0,
    correct: s.correct || s.good || 0,
    understood: s.understood || s.easy || 0
  };
}

/* ========== 日付ユーティリティ ========== */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ========== データ管理 ========== */
async function loadData() {
  if (isGuest) {
    // ゲストモード: LocalStorage から読み込み
    decks = migrateDecks(LS.load('fc_decks', null));
    cards = LS.load('fc_cards', []);
    stats = migrateStats(LS.load('fc_stats', null));
    dailyStats = LS.load('fc_daily', {});

    if (!cards.length) seedSample();
    syncAllDeckMeta();
    return;
  }

  // Firebase モード
  try {
    const doc = await userDoc().get();
    let needsMeta = false;

    if (doc.exists) {
      const d = doc.data();
      const raw = d.decks;
      decks = migrateDecks(raw);
      stats = migrateStats(d.stats);
      dailyStats = d.dailyStats || {};

      // 古いデータ形式からの移行（cardCount がない）
      needsMeta = raw && raw.length > 0 && raw[0].cardCount == null;
    } else {
      // 初回ユーザー
      decks = [{
        name: 'デフォルト',
        subdecks: [],
        publishedId: null,
        cardCount: 0,
        ratings: { incorrect: 0, correct: 0, understood: 0 }
      }];
      stats = { reviews: 0, incorrect: 0, correct: 0, understood: 0 };

      await userDoc().set({ decks, stats });
      await seedFS();
      syncAllDeckMeta();
      await saveDecks();

      // グローバル統計を更新
      try {
        await db.collection('meta').doc('stats').set(
          { totalUsers: firebase.firestore.FieldValue.increment(1) },
          { merge: true }
        );
      } catch (e) {
        console.error(e);
      }
    }

    // サブデッキメタデータの確認
    const needsSD = decks.some(dk => dk.subdecks && dk.subdecks.length > 0 && !dk.subdeckCounts);

    // メタデータの再計算が必要な場合
    if (needsMeta || needsSD) {
      const snap = await cardsCol().get();
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      for (const dk of decks) {
        const dc = all.filter(c => c.deck === dk.name);

        if (needsMeta) {
          dk.cardCount = dc.length;
          dk.ratings = {
            incorrect: dc.filter(c => c.lastRating === 'incorrect').length,
            correct: dc.filter(c => c.lastRating === 'correct').length,
            understood: dc.filter(c => c.lastRating === 'understood').length
          };
        }

        if (dk.subdecks && dk.subdecks.length > 0 && (needsSD || !dk.subdeckCounts)) {
          const sc = {};
          for (const sd of dk.subdecks) {
            sc[sd] = dc.filter(c => c.subdeck === sd).length;
          }
          dk.subdeckCounts = sc;
        }
      }

      await saveDecks();
    }

    cards = [];
  } catch (e) {
    console.error(e);
    showToast('読み込み失敗');
  }
}

async function saveDecks() {
  if (isGuest) {
    LS.save('fc_decks', decks);
    return;
  }
  try {
    await userDoc().update({ decks });
  } catch (e) {
    console.error(e);
  }
}

async function saveStats() {
  if (isGuest) {
    LS.save('fc_stats', stats);
    LS.save('fc_daily', dailyStats);
    return;
  }
  try {
    await userDoc().update({ stats, dailyStats });
  } catch (e) {
    console.error(e);
  }
}

/* ========== カード操作 ========== */
async function addCard(c, skipMeta) {
  if (isGuest) {
    c.id = Date.now().toString() + Math.random();
    cards.push(c);
    LS.save('fc_cards', cards);
  } else {
    try {
      const r = await cardsCol().add(c);
      cards.push({ id: r.id, ...c });
    } catch (e) {
      console.error(e);
      showToast('保存失敗');
      return;
    }
  }

  if (!skipMeta) {
    const dk = getDeck(c.deck);
    if (dk) {
      dk.cardCount = (dk.cardCount || 0) + 1;
      await saveDecks();
    }
  }

  await updateDeckHashtags(c.deck);
}

async function updateCard(id, data) {
  const i = cards.findIndex(c => c.id === id);
  if (i === -1) return;

  cards[i] = { ...cards[i], ...data };

  if (isGuest) {
    LS.save('fc_cards', cards);
    const deckName = cards[i].deck;
    if (deckName) await updateDeckHashtags(deckName);
    return;
  }

  try {
    await cardsCol().doc(id).update(data);
  } catch (e) {
    console.error(e);
  }

  const deckName = cards[i].deck;
  if (deckName) await updateDeckHashtags(deckName);
}

async function removeCard(id) {
  const old = cards.find(c => c.id === id);
  cards = cards.filter(c => c.id !== id);

  if (isGuest) {
    LS.save('fc_cards', cards);
  } else {
    try {
      await cardsCol().doc(id).delete();
    } catch (e) {
      console.error(e);
    }
  }

  if (old) {
    const dk = getDeck(old.deck);
    if (dk) {
      dk.cardCount = Math.max(0, (dk.cardCount || 0) - 1);
      if (old.lastRating && dk.ratings) {
        dk.ratings[old.lastRating] = Math.max(0, (dk.ratings[old.lastRating] || 0) - 1);
      }
      await saveDecks();
    }
    await updateDeckHashtags(old.deck);
  }
}

/* ========== 日次統計 ========== */
function trackDaily(r, dk) {
  const t = todayStr();

  if (!dailyStats[t]) {
    dailyStats[t] = { reviews: 0, incorrect: 0, correct: 0, understood: 0, decks: {} };
  }

  dailyStats[t].reviews++;
  dailyStats[t][r]++;

  if (dk) {
    if (!dailyStats[t].decks) dailyStats[t].decks = {};
    if (!dailyStats[t].decks[dk]) {
      dailyStats[t].decks[dk] = { reviews: 0, incorrect: 0, correct: 0, understood: 0 };
    }
    dailyStats[t].decks[dk].reviews++;
    dailyStats[t].decks[dk][r]++;
  }
}

/* ========== デッキメタデータ同期 ========== */
function syncAllDeckMeta() {
  for (const dk of decks) {
    const dc = cards.filter(c => c.deck === dk.name);
    dk.cardCount = dc.length;
    dk.ratings = {
      incorrect: dc.filter(c => c.lastRating === 'incorrect').length,
      correct: dc.filter(c => c.lastRating === 'correct').length,
      understood: dc.filter(c => c.lastRating === 'understood').length
    };
  }
}

function syncCurrentDeckMeta() {
  const dk = getDeck(currentDeck);
  if (!dk) return;

  const dc = cards.filter(c => c.deck === currentDeck);
  dk.cardCount = dc.length;
  dk.ratings = {
    incorrect: dc.filter(c => c.lastRating === 'incorrect').length,
    correct: dc.filter(c => c.lastRating === 'correct').length,
    understood: dc.filter(c => c.lastRating === 'understood').length
  };
}

/* ========== ハッシュタグ管理 ========== */
async function updateDeckHashtags(deckName) {
  const dk = getDeck(deckName);
  if (!dk) return;

  const deckCards = cards.filter(c => c.deck === deckName);
  const hashtags = {};

  for (const card of deckCards) {
    const tags = getCardHashtags(card);
    for (const tag of tags) {
      if (!hashtags[tag]) hashtags[tag] = [];
      hashtags[tag].push(card.id);
    }
  }

  dk.hashtags = hashtags;
  console.log(`[updateDeckHashtags] ${deckName}:`, hashtags);
  await saveDecks();
}

async function loadDeckCards(name) {
  if (isGuest) return;

  let fromCache = false;

  try {
    const snap = await cardsCol().where('deck', '==', name).get({ source: 'cache' });
    if (snap.size > 0) {
      cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fromCache = true;
    }
  } catch (e) {}

  if (!fromCache) {
    try {
      const snap = await cardsCol().where('deck', '==', name).get({ source: 'server' });
      cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      try {
        const snap = await cardsCol().where('deck', '==', name).get();
        cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e2) {
        console.error(e2);
        showToast('カード読み込み失敗');
      }
    }
  } else {
    // バックグラウンドで最新データを取得
    cardsCol().where('deck', '==', name).get({ source: 'server' })
      .then(snap => {
        cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const dk = getDeck(name);
        if (dk && dk.subdecks && dk.subdecks.length > 0) {
          const sc = {};
          for (const sd of dk.subdecks) {
            sc[sd] = cards.filter(c => c.subdeck === sd).length;
          }
          dk.subdeckCounts = sc;
          saveDecks();
        }
      })
      .catch(() => {});
  }

  // サブデッキカウント更新
  const dk = getDeck(name);
  if (dk && dk.subdecks && dk.subdecks.length > 0) {
    const sc = {};
    for (const sd of dk.subdecks) {
      sc[sd] = cards.filter(c => c.subdeck === sd).length;
    }
    dk.subdeckCounts = sc;
    saveDecks();
  }
}
