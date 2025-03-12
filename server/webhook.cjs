const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const topic = req.headers['x-shopify-topic'];
  const data = req.body;
  const webhookUrl = 'https://script.google.com/macros/s/AKfycbw7Yc8d67b2pe3w2Ysd8BkYj-ECZOlC6or46W4tqUuFYAjAr5fjf1OeevkpRzKUAA0FAw/exec';

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, data }),
  })
    .then(() => res.sendStatus(200))
    .catch(() => res.sendStatus(500));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));