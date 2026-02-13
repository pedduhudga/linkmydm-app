// --- LinkMyDM Pro Webhook (Diagnostic & Debug Version) ---
// Location: api/webhooks/instagram.js

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; 
  
  // 1. Meta Handshake (Verification)
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log("[DEBUG] Handshake successful.");
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Incoming Event Processing
  if (req.method === 'POST') {
    res.status(200).json({ status: 'received' });

    const body = req.body;
    // Log the raw body to Vercel console for deep debugging
    console.log("[DEBUG] Incoming Payload:", JSON.stringify(body));

    if (body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    if (changes && changes.text && changes.from) {
      const commentText = changes.text.toUpperCase();
      const senderId = changes.from.id;
      const username = changes.from.username;
      const mediaId = changes.media?.id;

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN; 
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) {
        console.error("[DEBUG] Missing Env Variables in Vercel settings.");
        return;
      }

      try {
        // Fetch rules from Firestore
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        const rules = data.documents ? data.documents.map(d => ({ id: d.name.split('/').pop(), ...d.fields })) : [];
        
        // --- DIAGNOSTIC LOGGING ---
        // We log the comment to the dashboard immediately so the user knows the webhook is ALIVE
        let statusMessage = "Checking Rules...";
        let metaDetailedError = "";

        // --- MATCHING ENGINE ---
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

          if (dmData.error) {
            statusMessage = "failed";
            metaDetailedError = `Meta API Error: ${dmData.error.message}`;
            console.error("[DEBUG] Send Failure:", dmDetailedError);
          } else {
            statusMessage = "sent";
            console.log("[DEBUG] Send Success to", username);
          }
        } else {
          statusMessage = "ignored";
          metaDetailedError = "No keyword match found for this post.";
          console.log("[DEBUG] Comment ignored (no rule match).");
        }

        // --- FINAL LOG TO DATABASE ---
        // This ensures every comment heard by the server creates a row in your "Activity Logs"
        await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              user: { stringValue: username },
              comment: { stringValue: changes.text },
              status: { stringValue: statusMessage },
              error: { stringValue: metaDetailedError },
              timestamp: { timestampValue: new Date().toISOString() }
            }
          })
        });

      } catch (error) {
        console.error("[DEBUG] Webhook Catch Block:", error);
      }
    }
  }
}
