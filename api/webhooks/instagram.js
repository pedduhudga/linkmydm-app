// This is the "Ear" that listens to Instagram 24/7
// Location: api/webhooks/instagram.js

export default async function handler(req, res) {
  // This MUST match exactly what you typed into the Meta Portal "Verify Token" box
  const MY_VERIFY_TOKEN = "PedduAutodm123"; 

  // --- 1. META HANDSHAKE (The GET Request) ---
  // Meta sends a "challenge" number to make sure your site is listening
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Check if the password matches
    if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
      console.log("HANDSHAKE SUCCESSFUL!");
      // We MUST return the challenge number as plain text
      return res.status(200).send(challenge);
    } else {
      console.error("HANDSHAKE FAILED: Passwords did not match.");
      return res.status(403).send('Verification failed');
    }
  }

  // --- 2. INCOMING COMMENTS (The POST Request) ---
  // This is where Instagram sends you the actual comment data
  if (req.method === 'POST') {
    // We acknowledge receipt immediately so Meta doesn't get angry
    res.status(200).json({ status: 'received' });

    const body = req.body;
    
    // Safety check: Is this an Instagram comment?
    if (body.object === 'instagram') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0]?.value;

      if (changes && changes.text) {
        console.log(`New comment from ${changes.from.username}: "${changes.text}"`);
        
        // FUTURE: This is where we will add the DM sending logic
        // using your Goweed Ultra+ formula settings.
      }
    }
  }
}
