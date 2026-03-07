const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;

try {
    // If running with a base64 encoded service account in environment variables (for production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        const buff = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64');
        const serviceAccount = JSON.parse(buff.toString('utf-8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    // Fallback to local file if path is provided
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccountPath = path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            console.warn(`Firebase: Service account file not found at ${serviceAccountPath}`);
        }
    } else {
        console.warn('Firebase: No credentials provided. Database operations will fail.');
    }

    if (admin.apps.length > 0) {
        db = admin.firestore();
        console.log('Firebase Firestore initialized successfully.');
    }

} catch (error) {
    console.error('Error initializing Firebase:', error);
}

module.exports = { admin, db };
