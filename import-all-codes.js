import { google } from 'googleapis';
import fetch from 'node-fetch';

// Authentifizierung für Google Sheets
const SPREADSHEET_ID = '1xne5MVizpQFr9Wym8bF8GEg5kTfrFuk0d_gYTkgZRMg';
const SHEET_NAME = 'Coupon Usage';
const auth = new google.auth.GoogleAuth({
  keyFile: '/Users/alex/Alex/01.LA VIESTA/Coding Nicht Löschen/service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Shopify API-Konfiguration
const SHOPIFY_API_KEY = 'cfa18dd3ca842e03e3d45aa23c5671c5';
const SHOPIFY_PASSWORD = 'Goggy2005!?';
const SHOPIFY_SHOP_NAME = 'laviestaevents';

async function importAllCodes() {
  try {
    // Hole alle Gutschein-Codes von Shopify
    const url = `https://${SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2025-01/discount_codes.json`;
    const authHeader = 'Basic ' + Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_PASSWORD}`).toString('base64');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API Fehler: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Shopify API Antwort:', data);

    if (!data.discount_codes || !Array.isArray(data.discount_codes)) {
      throw new Error('Keine gültigen Gutschein-Codes in der Antwort');
    }

    const shopifyCodes = data.discount_codes.map(dc => dc.code);
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    });
    const rows = sheetResponse.data.values || [];
    const existingCodes = rows.map(row => row[0]).filter(code => code);

    const newCodes = shopifyCodes.filter(code => !existingCodes.includes(code)).map(code => [code]);
    if (newCodes.length > 0) {
      const nextRow = rows.length + 1;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A${nextRow}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: newCodes },
      });
      console.log('Neue Codes importiert:', newCodes.length);
    } else {
      console.log('Keine neuen Codes zum Importieren');
    }
  } catch (error) {
    console.error('Import Fehler:', error);
  }
}

importAllCodes();