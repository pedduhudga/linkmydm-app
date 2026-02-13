// --- LinkMyDM Pro Webhook Handler (Enhanced Logging) ---
// Location: api/webhooks/instagram.js

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; 
  
  // 1. Meta Handshake (Verification)
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log("Handshake verified successfully.");
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Incoming Comment Processing
  if (req.method === 'POST') {
    // Acknowledge Meta immediately
    res.status(200).json({ status: 'received' });

    const body = req.body;
    if (body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    // Check if it's a valid comment
    if (changes && changes.text && changes.from) {
      const commentText = changes.text.toUpperCase();
      const senderId = changes.from.id;
      const username = changes.from.username;
      const mediaId = changes.media?.id; // The specific Reel/Post ID

      console.log(`[LOG] New comment from @${username} on Post ${mediaId}: "${commentText}"`);

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) {
        console.error("[ERROR] Missing Environment Variables in Vercel.");
        return;
      }

      try {
        // Fetch all your automation rules from the database
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        if (!data.documents) {
            console.log("[LOG] No automation rules found in database.");
            return;
        }

        const rules = data.documents.map(d => d.fields);
        
        // FIND MATCHING RULE
        const matchedRule = rules.find(r => {
            const ruleMediaId = r.media_id?.stringValue;
            const rawKeywords = r.keyword?.stringValue || "";
            const keywordList = rawKeywords.split(',').map(k => k.trim().toUpperCase());
            
            // Logic: Must match the specific media_id IF the rule is post-specific. 
            // If ruleMediaId is null, it's a global rule that works on all posts.
            const postMatch = ruleMediaId ? (ruleMediaId === mediaId) : true;
            const keywordMatch = keywordList.some(kw => kw && commentText.includes(kw));

            return postMatch && keywordMatch;
        });

        if (matchedRule) {
          const finalMessage = matchedRule.message?.stringValue;
          console.log(`[LOG] Found match! Triggering DM for keyword(s) in: ${matchedRule.keyword?.stringValue}`);

          // SEND THE DM
          const dmResponse = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: senderId },
              message: { text: finalMessage }
            })
          });

          const dmResult = await dmResponse.json();

          if (dmResult.error) {
            console.error(`[META ERROR] ${dmResult.error.message}`);
            // Log failure to your Dashboard
            await logToDatabase(userId, username, changes.text, "failed", PROJECT_ID);
          } else {
            console.log(`[SUCCESS] DM sent to @${username}`);
            // Log success to your Dashboard
            await logToDatabase(userId, username, changes.text, "sent", PROJECT_ID);
          }
        } else {
            console.log("[LOG] Comment did not match any active rules.");
        }
      } catch (error) {
        console.error("[SYSTEM ERROR]", error);
      }
    }
  }
}

// Helper to write to Activity Logs
async function logToDatabase(userId, username, comment, status, projectId) {
    const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/logs`;
    await fetch(logUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fields: {
                user: { stringValue: username },
                comment: { stringValue: comment },
                status: { stringValue: status },
                timestamp: { timestampValue: new Date().toISOString() }
            }
        })
    });
}
