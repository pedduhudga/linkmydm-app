// --- LinkMyDM Pro Webhook (Final Connection Check) ---
// Location: api/webhooks/instagram.js

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; 
  
  // 1. Meta Verification (GET Request)
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log("[SERVER] Webhook URL Verified successfully.");
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Incoming Data (POST Request)
  if (req.method === 'POST') {
    // Reply to Meta immediately so they don't timeout
    res.status(200).json({ status: 'received' });

    const body = req.body;
    
    // Check if this is a standard comment change
    if (body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    if (changes && changes.text && changes.from) {
      const commentText = changes.text.toUpperCase();
      const senderId = changes.from.id;
      const username = changes.from.username;
      const mediaId = changes.media?.id;

      console.log(`[EVENT] Received comment from @${username} on Post ${mediaId}: "${commentText}"`);

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN; 
      const userId = process.env.FIREBASE_USER_ID; 

      if (!accessToken || !userId) {
        console.error("[CRITICAL] Vercel Environment Variables (ID or Token) are missing.");
        return;
      }

      try {
        // Fetch your rules from Firestore
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        if (!data.documents) {
            console.warn("[LOG] Webhook heard a comment, but no automation rules exist in the dashboard.");
            return;
        }

        const rules = data.documents.map(d => d.fields);
        
        // --- MATCHING LOGIC ---
        const matchedRule = rules.find(r => {
            const ruleMediaId = r.media_id?.stringValue;
            const keywordList = (r.keyword?.stringValue || "").split(',').map(k => k.trim().toUpperCase());
            
            // Per-Post Check: If the rule has a media ID, it MUST match the post being commented on.
            // If the rule has NO media ID, it is a Global rule and matches every post.
            const isPostSpecific = !!ruleMediaId;
            const postMatch = isPostSpecific ? (ruleMediaId === mediaId) : true;
            
            // Keyword Check: See if the comment text contains any of the keywords
            const keywordMatch = keywordList.some(kw => kw && commentText.includes(kw));

            return postMatch && keywordMatch;
        });

        if (matchedRule) {
          const finalMessage = matchedRule.message?.stringValue;
          console.log(`[MATCH] Triggering automated DM. Rule Type: ${matchedRule.media_id?.stringValue ? 'Post-Specific' : 'Global'}`);

          // --- SEND THE DM (Meta Graph API) ---
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
            console.error("[META API ERROR] DM failed to send:", JSON.stringify(dmData.error));
            await logToDatabase(userId, username, changes.text, "failed", PROJECT_ID, dmData.error.message);
          } else {
            console.log(`[SUCCESS] DM delivered to @${username}`);
            await logToDatabase(userId, username, changes.text, "sent", PROJECT_ID, null);
          }
        } else {
            console.log("[LOG] No rule matched this comment/media combination.");
        }
      } catch (error) {
        console.error("[SYSTEM ERROR] Webhook processing failed:", error);
      }
    }
  }
}

// Helper: Post log back to dashboard
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
