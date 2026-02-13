// This is the "Ear" that listens to Instagram 24/7
export default async function handler(req, res) {
  // MUST match the password in your Meta Portal
  const MY_VERIFY_TOKEN = "PedduAutodm123"; 

  // 1. Handshake with Meta
  if (req.method === 'GET') {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (token === MY_VERIFY_TOKEN) {
      console.log("Meta handshake successful!");
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Wrong Password');
  }

  // 2. Incoming Comment Processing
  if (req.method === 'POST') {
    res.status(200).json({ status: 'received' });
    console.log("New comment detected:", JSON.stringify(req.body));
    // The DM logic triggers here...
  }
}
