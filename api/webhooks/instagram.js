// api/webhooks/instagram.js (Final Pro Logic)

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; 
  
  // 1. Meta Handshake
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Process Comment
  if (req.method === 'POST') {
    res.status(200).json({ status: 'received' });
    const body = req.body;
    if (body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    if (changes && changes.text && changes.from) {
      const commentText = changes.text.toUpperCase();
      const senderId = changes.from.id;
      const username = changes.from.username;
      const mediaId = changes.media?.id; // THE SPECIFIC REEL ID

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN; // MUST BE EAAB...
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) return console.error("Keys missing in Vercel.");

      try {
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        if (!data.documents) return;
        const rules = data.documents.map(d => d.fields);
        
        // --- SMART PER-POST MATCHING ---
        const matchedRule = rules.find(r => {
            const ruleMediaId = r.media_id?.stringValue;
            const keywordList = (r.keyword?.stringValue || "").split(',').map(k => k.trim().toUpperCase());
            
            // Check if specific rule exists for this reel, otherwise fall back to global
            const postMatch = ruleMediaId ? (ruleMediaId === mediaId) : true;
            const keywordMatch = keywordList.some(kw => kw && commentText.includes(kw));

            return postMatch && keywordMatch;
        });

        if (matchedRule) {
          const finalMessage = matchedRule.message?.stringValue;

          // SEND DM via Professional Graph API
          const dmRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: { id: senderId }, message: { text: finalMessage } })
          });

          const dmData = await dmRes.json();

          // Log back to dashboard
          const logStatus = dmData.error ? "failed" : "sent";
          const logUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/logs`;
          await fetch(logUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                user: { stringValue: username },
                comment: { stringValue: changes.text },
                status: { stringValue: logStatus },
                timestamp: { timestampValue: new Date().toISOString() }
              }
            })
          });
        }
      } catch (error) { console.error("Webhook Error:", error); }
    }
  }
}
