import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
import type { GoogleUser } from '../types';

const provider = new GoogleAuthProvider();

export const signInWithGooglePopup = async (): Promise<GoogleUser | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    if (user) {
        return {
            name: user.displayName || 'Người dùng',
            email: user.email || '',
            imageUrl: user.photoURL || '',
        };
    }
    return null;
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
        console.log('Cửa sổ đăng nhập đã bị đóng bởi người dùng.');
    } else {
        console.error("Lỗi khi đăng nhập bằng Google:", error);
    }
    throw error;
  }
};

export const signOutUser = (): Promise<void> => {
  return signOut(auth);
};

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  return onAuthStateChanged(auth, callback);
};