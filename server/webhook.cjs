require('dotenv').config();

const express = require('express');
const { google } = require('googleapis');
const app = express();
app.use(express.json());

// Spreadsheet-Konfiguration
const SPREADSHEET_ID = '1xne5MVizpQFr9Wym8bF8GEg5kTfrFuk0d_gYTkgZRMg';
const SHEET_NAME = 'Coupon Usage';
const EXCLUSIONS_SHEET = 'Exclusions';

// Google Sheets Authentifizierung
let auth;
if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT Umgebungsvariable fehlt!');
}
auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Cache für verarbeitete Bestell-IDs
const processedOrderIds = new Set();

// Funktion zum Abrufen der aktuellen Tabelle
async function getSheetData(sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:Z`,
  });
  return response.data.values || [['Gutschein-Code']];
}

// Funktion zum Abrufen der Ausschlüsse
async function getExclusions() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${EXCLUSIONS_SHEET}!A2:B`,
  });
  const rows = response.data.values || [];
  const exclusions = {
    discount: [],
    product: [],
  };
  rows.forEach(row => {
    if (row[0] === 'discount') {
      exclusions.discount.push(row[1]);
    } else if (row[0] === 'product') {
      exclusions.product.push(row[1]);
    }
  });
  return exclusions;
}

// Webhook-Handler
app.post('/webhook', async (req, res) => {
  console.log('Webhook empfangen:', req.headers['x-shopify-topic'], req.body);
  const topic = req.headers['x-shopify-topic'];
  const data = req.body;

  try {
    const rows = await getSheetData(SHEET_NAME);
    const exclusions = await getExclusions();

    if (topic === 'discounts/create') {
      const couponCode = data.code || data.title;
      if (!couponCode || exclusions.discount.includes(couponCode)) {
        console.log('Gutschein ausgeschlossen oder fehlt:', couponCode);
        return res.sendStatus(200);
      }
      const existingCodes = rows.map(row => row[0]).filter(code => code);
      if (!existingCodes.includes(couponCode)) {
        const nextRow = rows.length + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A${nextRow}`,
          valueInputOption: 'RAW',
          resource: { values: [[couponCode]] },
        });
        console.log('Neuer Gutschein hinzugefügt:', couponCode);
      }
    } else if (topic === 'products/create') {
      const fullProductName = data.title || 'Unbekanntes Produkt';
      const productName = fullProductName.split(' - ')[0].trim();
      if (exclusions.product.includes(productName)) {
        console.log('Produkt ausgeschlossen:', productName);
        return res.sendStatus(200);
      }
      const headers = rows[0];
      if (!headers.includes(productName)) {
        const nextColIndex = headers.length;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${String.fromCharCode(65 + nextColIndex)}1`,
          valueInputOption: 'RAW',
          resource: { values: [[productName]] },
        });
        console.log('Neues Produkt hinzugefügt:', productName);
      }
    } else if (topic === 'orders/create') {
      const orderId = data.id;
      if (processedOrderIds.has(orderId)) {
        console.log('Bestellung bereits verarbeitet:', orderId);
        return res.sendStatus(200);
      }
      processedOrderIds.add(orderId);

      const couponCode = data.discount_codes?.[0]?.code || null;
      if (!couponCode || exclusions.discount.includes(couponCode)) {
        console.log('Kein Gutschein oder ausgeschlossen:', couponCode);
        return res.sendStatus(200);
      }

      const lineItems = data.line_items || [];
      if (lineItems.length === 0) {
        console.log('Keine Produkte in der Bestellung');
        return res.sendStatus(200);
      }

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
        console.log('Neuer Gutschein hinzugefügt (via Bestellung):', couponCode);
      }

      for (const item of lineItems) {
        const fullProductName = item.title || 'Unbekanntes Produkt';
        const productName = fullProductName.split(' - ')[0].trim();
        const quantity = item.quantity || 1;

        if (exclusions.product.includes(productName)) {
          console.log('Produkt ausgeschlossen, wird nicht verarbeitet:', productName);
          continue;
        }

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
          console.log('Neues Produkt hinzugefügt (via Bestellung):', productName);
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
        console.log('Einlösungen aktualisiert:', { couponCode, productName, newValue });
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook-Fehler:', error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));