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
db.enablePersistence().catch(() => {});

const CHAT_ALLOWED_EMAIL = 'u.t.o0911@gmail.com';
const CHAT_API_KEY = 'sk-proj-9lG6FI0S8T2vGmMp2Y6nT3K1pQ4R5lY6z7X8W9V0U1a2B3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4';
