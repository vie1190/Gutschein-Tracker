const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  console.log('Received webhook:', req.headers['x-shopify-topic'], req.body);
  // Hier kannst du später die Logik hinzufügen, z. B. Daten an Google Sheets senden
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));