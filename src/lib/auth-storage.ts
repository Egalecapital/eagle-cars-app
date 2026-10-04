/**
 * Nơi lưu phiên Supabase trên iOS/Android: localStorage do expo-sqlite cung cấp
 * (theo hướng dẫn Expo "Using Supabase").
 * Bản web nằm ở auth-storage.web.ts để bundle web không kéo expo-sqlite.
 */
import 'expo-sqlite/localStorage/install';

export const authStorage = localStorage;
