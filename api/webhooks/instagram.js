// --- LinkMyDM Pro Webhook (Production & Public Ready) ---
// Location: api/webhooks/instagram.js

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; 
  
  // 1. Meta Handshake (Verification)
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Incoming Event Processing
  if (req.method === 'POST') {
    res.status(200).json({ status: 'received' }); // Always acknowledge Meta first

    const body = req.body;
    if (body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    // VALIDATION: We need text, a sender, and a post ID
    if (changes && changes.text && changes.from) {
      const commentText = changes.text.toUpperCase();
      const senderId = changes.from.id;
      const username = changes.from.username;
      const mediaId = changes.media?.id;

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN; // MUST be EAAB token
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) return console.error("Keys missing in Vercel settings.");

      try {
        // Fetch rules from Firestore
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        if (!data.documents) return;
        const rules = data.documents.map(d => ({ id: d.name.split('/').pop(), ...d.fields }));
        
        // --- MATCHING ENGINE ---
        // Priority 1: Check for rules targeted to this specific Post ID
        // Priority 2: Fallback to Global rules (media_id is null/empty)
        const matchedRule = rules.find(r => {
            const ruleMediaId = r.media_id?.stringValue;
            const keywordList = (r.keyword?.stringValue || "").split(',').map(k => k.trim().toUpperCase());
            
            const postMatch = ruleMediaId ? (ruleMediaId === mediaId) : true;
            const keywordMatch = keywordList.some(kw => kw && commentText.includes(kw));

            return postMatch && keywordMatch;
        });

        if (matchedRule) {
          const finalMessage = matchedRule.message?.stringValue;

          // --- SEND THE DM ---
          const dmRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: senderId },
              message: { text: finalMessage }
            })
          });

          const dmData = await dmRes.json();

          // --- LOG TO DASHBOARD ---
          const logStatus = dmData.error ? "failed" : "sent";
          const metaError = dmData.error ? dmData.error.message : null;
          
          await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                user: { stringValue: username },
                comment: { stringValue: changes.text },
                status: { stringValue: logStatus },
                error: { stringValue: metaError || "" },
                timestamp: { timestampValue: new Date().toISOString() }
              }
            })
          });
        }
      } catch (error) {
        console.error("Webhook processing error:", error);
      }
    }
  }
}
