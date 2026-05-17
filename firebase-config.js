// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDTBJQJpaNOUp_y0FPFBjkpr_HO5UhNZhM",
  authDomain: "sticker-tracker-c487a.firebaseapp.com",
  projectId: "sticker-tracker-c487a",
  storageBucket: "sticker-tracker-c487a.firebasestorage.app",
  messagingSenderId: "1085731444908",
  appId: "1:1085731444908:web:6156ae69bb64322c3f2709",
  measurementId: "G-LG2TGV91ZB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
