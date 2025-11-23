module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ 
    message: 'JAM Music Sync Server is running!', 
    status: 'online',
    timestamp: new Date().toISOString()
  });
};