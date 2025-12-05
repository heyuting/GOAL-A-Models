// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB_NmsUvZMf0nNLd7S7LEYL289O3ESx2UY",
  authDomain: "goal-a-auth.firebaseapp.com",
  projectId: "goal-a-auth",
  storageBucket: "goal-a-auth.firebasestorage.app",
  messagingSenderId: "347189904833",
  appId: "1:347189904833:web:7f4eef82cc5b6775c95b40",
  measurementId: "G-3SMFBF63M6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
