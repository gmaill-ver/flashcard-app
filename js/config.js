/* ========== Firebase初期化 ========== */
firebase.initializeApp({
  apiKey: "AIzaSyCFliHkmMAxap7386JJZb81o3dbI5uJFGU",
  authDomain: "ankimaster-395d5.firebaseapp.com",
  projectId: "ankimaster-395d5",
  storageBucket: "ankimaster-395d5.firebasestorage.app",
  messagingSenderId: "679225068510",
  appId: "1:679225068510:web:8acae35eb5ee7537d26b4f",
  measurementId: "G-PLHLN3NH45"
});

const auth = firebase.auth();
const db = firebase.firestore();
// 通信が詰まる環境（プロキシ/拡張機能/一部回線）向けに、ロングポーリングへ自動切替
db.settings({ experimentalAutoDetectLongPolling: true });
db.enablePersistence().catch(() => {});

const OWNER_EMAIL = 'u.t.o0911@gmail.com';
