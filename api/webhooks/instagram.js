// --- LinkMyDM Pro Webhook (Final Debug Version) ---
// Location: api/webhooks/instagram.js

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; 
  
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  if (req.method === 'POST') {
    // Acknowledge Meta immediately so they don't disable your webhook
    res.status(200).json({ status: 'received' });

    const body = req.body;
    console.log("[WEBHOOK RECEIVED]", JSON.stringify(body));

    if (body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    if (changes && changes.text && changes.from) {
      const commentText = changes.text.toUpperCase();
      const senderId = changes.from.id;
      const username = changes.from.username;
      const mediaId = changes.media?.id;

      // Skip if commenting on your own post
      // Note: In Development mode, you still need a TESTER account to trigger this.
      
      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN; // EAAB Token
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) {
        console.error("[CRITICAL] Vercel Environment Variables are missing.");
        return;
      }

      try {
        // Fetch rules
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        if (!data.documents) {
            console.log("[LOG] No automation rules found in Database.");
            return;
        }

        const rules = data.documents.map(d => d.fields);
        
        const matchedRule = rules.find(r => {
            const ruleMediaId = r.media_id?.stringValue;
            const keywordList = (r.keyword?.stringValue || "").split(',').map(k => k.trim().toUpperCase());
            const postMatch = ruleMediaId ? (ruleMediaId === mediaId) : true;
            const keywordMatch = keywordList.some(kw => kw && commentText.includes(kw));
            return postMatch && keywordMatch;
        });

        if (matchedRule) {
          const finalMessage = matchedRule.message?.stringValue;
          console.log(`[MATCH FOUND] Triggering DM for @${username}`);

          // SEND DM (Using the Page Access Token)
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
            console.error("[META API ERROR]", JSON.stringify(dmData.error));
            await logToDatabase(userId, username, changes.text, "failed", PROJECT_ID, dmData.error.message);
          } else {
            console.log("[SUCCESS] DM dispatched successfully.");
            await logToDatabase(userId, username, changes.text, "sent", PROJECT_ID, null);
          }
        }
      } catch (error) {
        console.error("[WEBHOOK SYSTEM ERROR]", error);
      }
    }
  }
}

async function logToDatabase(userId, username, comment, status, projectId, metaError) {
    const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/logs`;
    await fetch(logUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fields: {
                user: { stringValue: username },
                comment: { stringValue: comment },
                status: { stringValue: status },
                error: { stringValue: metaError || "" },
                timestamp: { timestampValue: new Date().toISOString() }
            }
        })
    });
}
