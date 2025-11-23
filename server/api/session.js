const { v4: uuidv4 } = require('uuid');

module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    // Create session
    const sessionId = uuidv4().substring(0, 8);
    const hostId = uuidv4();
    
    res.json({ sessionId, hostId });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};