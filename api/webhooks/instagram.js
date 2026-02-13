// --- LinkMyDM Pro Webhook Handler ---
// Location: api/webhooks/instagram.js

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

  // 2. Incoming Comment
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
      const mediaId = changes.media?.id; // The ID of the post they commented on

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) return console.error("Missing keys.");

      try {
        // Fetch all automation rules
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        if (!data.documents) return;

        // MATCHING LOGIC:
        // 1. Check for a rule that matches this specific media_id
        // 2. If not found, check for a "Global" rule (media_id is null)
        const rules = data.documents.map(d => d.fields);
        
        const matchedRule = rules.find(r => {
            const ruleMediaId = r.media_id?.stringValue;
            const keywordList = r.keyword?.stringValue?.split(',').map(k => k.trim().toUpperCase()) || [];
            
            // Check if rule matches this specific post OR is global
            const postMatch = ruleMediaId ? (ruleMediaId === mediaId) : true;
            
            // Check if any of the keywords are in the comment
            const keywordMatch = keywordList.some(kw => commentText.includes(kw));

            return postMatch && keywordMatch;
        });

        if (matchedRule) {
          const finalMessage = matchedRule.message?.stringValue;

          // Send DM
          await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: senderId },
              message: { text: finalMessage }
            })
          });

          // Log the success
          const logUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/logs`;
          await fetch(logUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                user: { stringValue: username },
                comment: { stringValue: changes.text },
                status: { stringValue: "sent" },
                timestamp: { timestampValue: new Date().toISOString() }
              }
            })
          });
        }
      } catch (error) {
        console.error("System Error:", error);
      }
    }
  }
}
