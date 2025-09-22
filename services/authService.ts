import {
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
import type { GoogleUser } from '../types';

const provider = new GoogleAuthProvider();

export const signInWithGoogleRedirect = async (): Promise<void> => {
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error('Lỗi khi bắt đầu quá trình đăng nhập chuyển hướng:', error);
    throw error;
  }
};

export const getGoogleRedirectResult = async (): Promise<GoogleUser | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const user = result.user;
      return {
        name: user.displayName || 'Người dùng',
        email: user.email || '',
        imageUrl: user.photoURL || '',
      };
    }
    return null;
  } catch (error: any) {
    if (error.code !== 'auth/redirect-cancelled') {
        console.error('Lỗi khi lấy kết quả chuyển hướng:', error);
    }
    return null;
  }
};

export const signOutUser = (): Promise<void> => {
  return signOut(auth);
};

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  return onAuthStateChanged(auth, callback);
};