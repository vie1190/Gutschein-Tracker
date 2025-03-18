const express = require('express');
const { google } = require('googleapis');
const app = express();
app.use(express.json());

// Spreadsheet-ID und Blattname für den Gutschein-Tracker
const SPREADSHEET_ID = '1xne5MVizpQFr9Wym8bF8GEg5kTfrFuk0d_gYTkgZRMg';
const SHEET_NAME = 'Coupon Usage';

// Authentifizierung für Google Sheets im Gutschein-Tracker
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

// Ausschlussliste für den Gutschein-Tracker
const excludedCodes = ['TEST123'];

// Cache für verarbeitete Bestell-IDs (verhindert doppelte Verarbeitung)
const processedOrderIds = new Set();

// Funktion zum Abrufen der aktuellen Tabelle
async function getSheetData() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:Z`, // Bis Spalte Z, erweiterbar
  });
  let rows = response.data.values || [['Gutschein-Code']];
  if (rows.length === 1 && rows[0].length === 1) {
    rows[0] = ['Gutschein-Code'];
  }
  return rows;
}

// Webhook-Handler
app.post('/webhook', async (req, res) => {
  console.log('Gutschein-Tracker Webhook empfangen:', req.headers['x-shopify-topic'], req.body);
  
  const topic = req.headers['x-shopify-topic'];
  const data = req.body;

  try {
    if (topic === 'discounts/create') {
      const couponCode = data.title;
      const rows = await getSheetData();
      const existingCodes = rows.map(row => row[0]).filter(code => code);
      if (!existingCodes.includes(couponCode)) {
        const nextRow = rows.length + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A${nextRow}`,
          valueInputOption: 'RAW',
          resource: { values: [[couponCode]] },
        });
        console.log('Gutschein-Tracker: Neuer Gutschein-Code hinzugefügt:', couponCode);
      }
    } else if (topic === 'products/create') {
      const fullProductName = data.title;
      const productName = fullProductName.split(' - ')[0].trim();
      const rows = await getSheetData();
      const headers = rows[0];
      if (!headers.includes(productName)) {
        const nextColIndex = headers.length;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${String.fromCharCode(65 + nextColIndex)}1`,
          valueInputOption: 'RAW',
          resource: { values: [[productName]] },
        });
        console.log('Gutschein-Tracker: Neues Produkt in Zeile 1 hinzugefügt:', productName);
      }
    } else if (topic === 'orders/create') {
      const orderId = data.id;
      if (processedOrderIds.has(orderId)) {
        console.log('Gutschein-Tracker: Bestellung bereits verarbeitet:', orderId);
        return res.sendStatus(200);
      }
      processedOrderIds.add(orderId);

      let couponCode = data.discount_codes && data.discount_codes.length > 0 ? data.discount_codes[0].code : null;
      if (!couponCode || excludedCodes.includes(couponCode)) {
        console.log('Gutschein-Tracker: Kein Gutschein-Code oder ausgeschlossen:', couponCode);
        return res.sendStatus(200);
      }

      const lineItems = data.line_items || [];
      if (lineItems.length === 0) {
        console.log('Gutschein-Tracker: Keine Produkte in der Bestellung');
        return res.sendStatus(200);
      }

      const rows = await getSheetData();
      const headers = rows[0];
      let codeRowIndex = rows.findIndex(row => row[0] === couponCode) + 1;
      if (codeRowIndex === 0) {
        codeRowIndex = rows.length + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A${codeRowIndex}`,
          valueInputOption: 'RAW',
          resource: { values: [[couponCode]] },
        });
        console.log('Gutschein-Tracker: Neuer Gutschein-Code hinzugefügt (via Bestellung):', couponCode);
      }

      for (const item of lineItems) {
        const fullProductName = item.title;
        const productName = fullProductName.split(' - ')[0].trim();
        const quantity = item.quantity || 1;

        let productColIndex = headers.indexOf(productName);
        if (productColIndex === -1) {
          productColIndex = headers.length;
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!${String.fromCharCode(65 + productColIndex)}1`,
            valueInputOption: 'RAW',
            resource: { values: [[productName]] },
          });
          headers.push(productName);
          console.log('Gutschein-Tracker: Neues Produkt in Zeile 1 hinzugefügt (via Bestellung):', productName);
        }

        const cellRange = `${String.fromCharCode(65 + productColIndex)}${codeRowIndex}`;
        const currentValueResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${cellRange}`,
        });
        const currentValue = currentValueResponse.data.values ? parseInt(currentValueResponse.data.values[0][0]) || 0 : 0;
        const newValue = currentValue + quantity;

        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${cellRange}`,
          valueInputOption: 'RAW',
          resource: { values: [[newValue]] },
        });
        console.log('Gutschein-Tracker: Einlösungen aktualisiert:', { couponCode, productName, newValue });
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Gutschein-Tracker Fehler:', error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Gutschein-Tracker Server läuft auf Port ${PORT}`));