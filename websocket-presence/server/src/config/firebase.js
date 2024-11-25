const admin = require('firebase-admin');
const serviceAccount = require('../../firebase-service-account.json');

const initializeFirebase = () => {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    return {
      db: admin.firestore(),
      FieldValue: admin.firestore.FieldValue
    };
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
};

module.exports = { initializeFirebase };