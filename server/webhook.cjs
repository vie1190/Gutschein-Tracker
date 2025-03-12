const express = require('express');
const { google } = require('googleapis');
const app = express();
app.use(express.json());

// Spreadsheet-ID und Blattname
const SPREADSHEET_ID = '1xne5MVizpQFr9Wym8bF8GEg5kTfrFuk0d_gYTkgZRMg';
const SHEET_NAME = 'Coupon Usage';

// Authentifizierung für Google Sheets
let auth;
if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
} else {
  const SERVICE_ACCOUNT_FILE = '/Users/alex/Alex/01.LA VIESTA/Coding Nicht Löschen/service-account.json';
  auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}
const sheets = google.sheets({ version: 'v4', auth });

// Ausschlussliste
const excludedCodes = ['TEST123'];

app.post('/webhook', async (req, res) => {
  console.log('Webhook empfangen:', req.headers['x-shopify-topic'], req.body);
  
  const topic = req.headers['x-shopify-topic'];
  const data = req.body;

  try {
    let couponCode = '';
    let productName = '';
    let usageCount = 1;

    // Daten basierend auf Webhook-Typ extrahieren
    if (topic === 'orders/create') {
      couponCode = data.discount_codes && data.discount_codes.length > 0 ? data.discount_codes[0].code : 'Kein Code';
      productName = data.line_items && data.line_items.length > 0 ? data.line_items[0].title : 'Kein Produkt';
    } else if (topic === 'products/create') {
      productName = data.title || 'Kein Titel verfügbar';
      couponCode = 'N/A';
    } else if (topic === 'products/delete') {
      productName = data.title || 'Gelöschtes Produkt';
      couponCode = 'N/A';
    }

    if (!excludedCodes.includes(couponCode)) {
      // Bestehende Daten aus Google Sheets abrufen
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:D`,
      });
      const rows = response.data.values || [];
      let found = false;
      let rowIndex = -1;

      // Suche nach dem Gutscheincode in der ersten Spalte (A)
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === couponCode) {
          found = true;
          rowIndex = i + 1;
          break;
        }
      }

      if (found) {
        // Aktualisiere die Einlösungszahl in Spalte C
        const currentCount = parseInt(rows[rowIndex - 1][2]) || 0;
        usageCount = currentCount + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!C${rowIndex}`,
          valueInputOption: 'RAW',
          resource: { values: [[usageCount]] },
        });
        console.log('Einlösungen aktualisiert:', { couponCode, usageCount });
      } else {
        // Füge eine neue Zeile hinzu
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A2`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [[couponCode, productName, usageCount, new Date().toISOString()]] },
        });
        console.log('Neue Daten geschrieben:', { couponCode, productName, usageCount });
      }
    } else {
      console.log('Gutscheincode ausgeschlossen:', couponCode);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Fehler beim Schreiben in Google Sheets:', error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));