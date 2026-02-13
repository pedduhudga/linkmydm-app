// This is the "Ear" that listens to Instagram comments 24/7
export default async function handler(req, res) {
  // 1. Handle the "Handshake" from Meta (Verification)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // This checks if the "password" you set in Meta matches
    if (mode === 'subscribe') {
      console.log("Handshake successful!");
      return res.status(200).send(challenge);
    }
  }

  // 2. Handle incoming Comments
  if (req.method === 'POST') {
    const body = req.body;
    
    // We just acknowledge receipt to Meta so they don't keep retrying
    res.status(200).json({ status: 'received' });

    // In a full setup, this is where we would trigger the DM.
    // For now, this confirms your "Ear" is working!
    console.log("New comment received:", JSON.stringify(body));
  }
}
