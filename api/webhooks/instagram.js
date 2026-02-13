// --- LinkMyDM Industry Standard Webhook Handler ---
// This version fetches rules from your database dynamically.

export default async function handler(req, res) {
  const VERIFY_TOKEN = "PedduAutodm123";
  const PROJECT_ID = "linkmydm"; // Your Firebase Project ID
  
  // 1. Meta Handshake (Security Check)
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Incoming Comment Logic
  if (req.method === 'POST') {
    res.status(200).json({ status: 'received' }); // Acknowledge Meta immediately

    const body = req.body;
    if (body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    // Safety: Ensure we have a comment and it's not from yourself
    if (changes && changes.text && changes.from) {
      const commentText = changes.text.toUpperCase();
      const senderId = changes.from.id;
      const username = changes.from.username;
      
      // Get your "Master Key" and "User ID" from Vercel Environment Variables
      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      const userId = process.env.FIREBASE_USER_ID; // You need to add this to Vercel!

      if (!accessToken || !userId) {
        console.error("Missing Security Keys in Vercel Settings.");
        return;
      }

      try {
        // --- STEP A: Fetch your Automation Rules from the Database ---
        // We use the Firestore REST API for maximum speed and simplicity.
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/automations`;
        
        const response = await fetch(firestoreUrl);
        const data = await response.json();
        
        if (!data.documents) return;

        // --- STEP B: Find a Match ---
        // We look through all your rules to see if the comment contains your keyword
        const matchedRule = data.documents.find(doc => {
          const ruleData = doc.fields;
          const keyword = ruleData.keyword?.stringValue?.toUpperCase();
          const isActive = ruleData.is_active?.booleanValue !== false;
          return isActive && commentText.includes(keyword);
        });

        if (matchedRule) {
          const ruleFields = matchedRule.fields;
          const dmText = ruleFields.message?.stringValue;
          const link = ruleFields.link?.stringValue;
          
          const finalMessage = link ? `${dmText}\n\nLink: ${link}` : dmText;

          // --- STEP C: Send the DM via Meta API ---
          await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: senderId },
              message: { text: finalMessage }
            })
          });

          // --- STEP D: Write to Logs (So you can see it in your Dashboard) ---
          const logUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/artifacts/linkmydm-personal/users/${userId}/logs`;
          await fetch(logUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                user: { stringValue: username },
                comment: { stringValue: changes.text },
                status: { stringValue: "sent" },
                keyword: { stringValue: ruleFields.keyword?.stringValue },
                timestamp: { timestampValue: new Date().toISOString() }
              }
            })
          });

          console.log(`Automation successful for @${username}`);
        }
      } catch (error) {
        console.error("Critical System Error:", error);
      }
    }
  }
}
