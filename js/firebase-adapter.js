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

let dailyPrefetch = null;
let tagsPrefetch = null;
let userDocData = null;
let needsRecount = false;

/* ユーザー文書はキャッシュを優先して即表示し、サーバー最新は裏で反映 */
async function getUserDocFast() {
  try {
    const c = await userDoc().get({ source: 'cache' });
    if (c.exists) {
      userDoc().get({ source: 'server' }).then(sv => {
        if (!sv.exists) return;
        const d = sv.data();
        const nd = migrateDecks(d.decks);
        if (JSON.stringify(nd) !== JSON.stringify(decks)) {
          decks = nd;
          if (typeof currentPage !== 'undefined' && currentPage === 'home' && typeof renderDeckList === 'function') renderDeckList();
        }
        stats = migrateStats(d.stats);
      }).catch(() => {});
      return c;
    }
  } catch (e) {}
  return await userDoc().get();
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
    // 日別統計・タグは並行して先読み（直列待ちを避ける）
    dailyPrefetch = dailyCol().get().catch(() => null);
    tagsPrefetch = memoTagsCol().get().catch(() => null);
    const doc = await getUserDocFast();
    userDocData = doc.exists ? doc.data() : null;
    let needsMeta = false;

    if (doc.exists) {
      const d = doc.data();
      const raw = d.decks;
      decks = migrateDecks(raw);
      stats = migrateStats(d.stats);
      dailyStats = await loadDailyStatsRemote(d);

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

    // 不要な重複データ（旧バグで各デッキに複製されたタグ全内容）を除去
    if (decks.some(dk => dk.memoHashtags)) {
      decks.forEach(dk => delete dk.memoHashtags);
      await saveDecks();
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

    // 一度だけ全カードを数え直す（表示後にバックグラウンドで実行）
    needsRecount = !(doc.exists && doc.data().countsV2);

    cards = [];
  } catch (e) {
    console.error(e);
    showToast('読み込み失敗');
  }
}

/* 全カードを数え直して、デッキ/サブデッキ/カテゴリのメタ情報を再構築 */
async function recountAllMeta() {
  let all;
  if (isGuest) {
    all = cards;
  } else {
    const snap = await cardsCol().get();
    all = snap.docs.map(d => d.data());
  }
  for (const dk of decks) {
    const dc = all.filter(c => c.deck === dk.name);
    dk.cardCount = dc.length;
    dk.ratings = {
      incorrect: dc.filter(c => c.lastRating === 'incorrect').length,
      correct: dc.filter(c => c.lastRating === 'correct').length,
      understood: dc.filter(c => c.lastRating === 'understood').length
    };
    const sds = dk.subdecks || [];
    for (const c of dc) {
      if (c.subdeck && !sds.includes(c.subdeck)) sds.push(c.subdeck);
    }
    dk.subdecks = sds;
    const cm = dk.categoryMap || {};
    const sc = {};
    const cc = {};
    for (const sd of sds) {
      const sdc = dc.filter(c => c.subdeck === sd);
      sc[sd] = sdc.length;
      const cats = cm[sd] || [];
      for (const c of sdc) {
        if (c.category && !cats.includes(c.category)) cats.push(c.category);
      }
      if (cats.length) cm[sd] = cats;
      cc[sd] = {};
      for (const cat of cats) cc[sd][cat] = sdc.filter(c => c.category === cat).length;
    }
    dk.subdeckCounts = sc;
    dk.categoryMap = cm;
    dk.categoryCounts = cc;
  }
  await saveDecks();
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

/* 日別統計は users/{uid}/dailyStats/{YYYY-MM-DD} に1日1文書で保存 */
let dailyLegacy = false;
const dirtyDays = new Set();

function dailyCol() {
  return userDoc().collection('dailyStats');
}

async function loadDailyStatsRemote(d) {
  const old = d.dailyStats || {};
  try {
    if (d.dailyMigrated) {
      const snap = (dailyPrefetch && await dailyPrefetch) || await dailyCol().get();
      const out = {};
      snap.docs.forEach(x => { out[x.id] = x.data(); });
      dailyLegacy = false;
      return out;
    }
    const days = Object.keys(old);
    for (let i = 0; i < days.length; i += 400) {
      const b = db.batch();
      days.slice(i, i + 400).forEach(k => b.set(dailyCol().doc(k), old[k]));
      await b.commit();
    }
    await userDoc().update({ dailyMigrated: true });
    dailyLegacy = false;
    return old;
  } catch (e) {
    console.error('dailyStats: 新形式が使えないため従来方式で動作', e);
    dailyLegacy = true;
    return old;
  }
}

async function resetDailyStats() {
  if (isGuest || dailyLegacy) return;
  const snap = await dailyCol().get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const b = db.batch();
    snap.docs.slice(i, i + 400).forEach(x => b.delete(x.ref));
    await b.commit();
  }
  dirtyDays.clear();
}

async function saveStats() {
  if (isGuest) {
    LS.save('fc_stats', stats);
    LS.save('fc_daily', dailyStats);
    return;
  }
  try {
    if (dailyLegacy) {
      await userDoc().update({ stats, dailyStats });
      return;
    }
    await userDoc().update({ stats });
    const days = [...dirtyDays];
    dirtyDays.clear();
    if (days.length) {
      const b = db.batch();
      days.forEach(k => { if (dailyStats[k]) b.set(dailyCol().doc(k), dailyStats[k]); });
      await b.commit();
    }
  } catch (e) {
    console.error(e);
  }
}

/* サブデッキ/カテゴリの件数メタを増減（delta: +1 / -1） */
function adjustSubCounts(dk, sd, cat, delta) {
  if (!dk || !sd) return;
  if (!dk.subdeckCounts) dk.subdeckCounts = {};
  dk.subdeckCounts[sd] = Math.max(0, (dk.subdeckCounts[sd] || 0) + delta);
  if (cat) {
    if (!dk.categoryCounts) dk.categoryCounts = {};
    if (!dk.categoryCounts[sd]) dk.categoryCounts[sd] = {};
    dk.categoryCounts[sd][cat] = Math.max(0, (dk.categoryCounts[sd][cat] || 0) + delta);
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
      adjustSubCounts(dk, c.subdeck, c.category, 1);
      await saveDecks();
    }
  }
}

async function updateCard(id, data) {
  const i = cards.findIndex(c => c.id === id);
  if (i === -1) return;

  const before = cards[i];
  cards[i] = { ...cards[i], ...data };

  if ('subdeck' in data || 'category' in data) {
    const after = cards[i];
    if ((before.subdeck || '') !== (after.subdeck || '') || (before.category || '') !== (after.category || '')) {
      const dk = getDeck(after.deck);
      adjustSubCounts(dk, before.subdeck, before.category, -1);
      adjustSubCounts(dk, after.subdeck, after.category, 1);
      saveDecks();
    }
  }

  if (isGuest) {
    LS.save('fc_cards', cards);
    return;
  }

  try {
    await cardsCol().doc(id).update(data);
  } catch (e) {
    console.error(e);
  }
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
      adjustSubCounts(dk, old.subdeck, old.category, -1);
      if (old.lastRating && dk.ratings) {
        dk.ratings[old.lastRating] = Math.max(0, (dk.ratings[old.lastRating] || 0) - 1);
      }
      await saveDecks();
    }
  }
}

/* ========== 日次統計 ========== */
function trackDaily(r, dk) {
  const t = todayStr();

  if (!dailyStats[t]) {
    dailyStats[t] = { reviews: 0, incorrect: 0, correct: 0, understood: 0, decks: {} };
  }

  dirtyDays.add(t);
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
