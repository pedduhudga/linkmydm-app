// --- LinkMyDM Pro Webhook (Corrected Version) ---
// Location: src/pages/api/webhooks/instagram.js

import * as admin from 'firebase-admin';

// Initialize Firebase Admin (Required for secure backend access)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT || '{}'
    );
    
    if (Object.keys(serviceAccount).length > 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      console.error("FIREBASE_SERVICE_ACCOUNT is missing or empty.");
    }
  } catch (error) {
    console.error("Firebase Admin Init Error:", error);
  }
}

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; 
  
  // 1. Meta Handshake (GET)
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Incoming Event Processing (POST)
  if (req.method === 'POST') {
    res.status(200).json({ status: 'received' });

    try {
      const body = req.body;
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0]?.value || entry?.messaging?.[0]; // Handle both comments & messages

      if (!changes) return;

      // Extract details based on event type
      const commentText = (changes.text || changes.message?.text || "").toUpperCase();
      const senderId = changes.from?.id || changes.sender?.id;
      const username = changes.from?.username || "user"; // strict checking
      const mediaId = changes.media?.id || null;

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN; 
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) {
        console.error("[CRITICAL] Vercel settings missing FIREBASE_USER_ID or INSTAGRAM_ACCESS_TOKEN");
        return;
      }

      const db = admin.firestore();
      
      // Fetch rules securely via Admin SDK
      // Path: artifacts/linkmydm-personal/users/{userId}/automations
      const automationsRef = db.collection('artifacts').doc('linkmydm-personal').collection('users').doc(userId).collection('automations');
      const snapshot = await automationsRef.get();
      
      if (snapshot.empty) {
        console.log("No automation rules found.");
        return;
      }

      const rules = snapshot.docs.map(doc => doc.data());

      // --- MATCHING ENGINE ---
      const matchedRule = rules.find(r => {
          const keywordList = (r.keyword || "").split(',').map(k => k.trim().toUpperCase());
          const postMatch = r.media_id ? (r.media_id === mediaId) : true;
          const keywordMatch = keywordList.some(kw => kw && commentText.includes(kw));
          return postMatch && keywordMatch;
      });

      let statusResult = "ignored";
      let errorDetail = "No keyword match found.";

      if (matchedRule) {
        // SEND THE DM
        const dmRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: senderId },
            message: { text: matchedRule.message }
          })
        });

        const dmData = await dmRes.json();

        if (dmData.error) {
          statusResult = "failed";
          errorDetail = `Meta Error: ${dmData.error.message}`;
        } else {
          statusResult = "sent";
          errorDetail = "";
        }
      }

      // --- ACTIVITY LOGGING ---
      const logsRef = db.collection('artifacts').doc('linkmydm-personal').collection('users').doc(userId).collection('logs');
      await logsRef.add({
        user: username,
        comment: commentText,
        status: statusResult,
        error: errorDetail,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      console.error("[WEBHOOK ERROR]", error);
    }
  }
}
