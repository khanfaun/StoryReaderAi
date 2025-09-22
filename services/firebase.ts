import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// FIX: Changed to a namespace import to resolve an issue where 'getStorage' could not be found as a named export.
import * as storageModule from 'firebase/storage';

// TODO: THAY THẾ BẰNG CẤU HÌNH DỰ ÁN FIREBASE THỰC TẾ CỦA BẠN
// Bạn có thể lấy thông tin này từ Firebase Console cho ứng dụng web của mình.
const firebaseConfig = {
  apiKey: "AIzaSyBB8b-qXKMiOo0dSgDSqM7bS_52mp2WYu8",
  authDomain: "storyreaderai.netlify.app",
  projectId: "aistorymind-513eb",
  storageBucket: "aistorymind-513eb.appspot.com",
  messagingSenderId: "977972360527",
  appId: "1:977972360527:web:1a70e7009a09603d52c13a",
  measurementId: "G-XXV1N8LLE5"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Xuất các dịch vụ đã được khởi tạo để sử dụng trong toàn bộ ứng dụng
export const auth = getAuth(app);
export const db = getFirestore(app);
// FIX: Access getStorage from the imported namespace module.
export const storage = storageModule.getStorage(app);