const { google } = require('googleapis');
const fetch = require('node-fetch');

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
    const response = await fetch(`https://${SHOPIFY_API_KEY}:${SHOPIFY_PASSWORD}@${SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2023-10/discount_codes.json`, {
      method: 'GET',
    });
    const data = await response.json();
    const shopifyCodes = data.discount_codes.map(dc => dc.code);

    // Hole aktuelle Codes aus Spreadsheet
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    });
    const rows = sheetResponse.data.values || [];
    const existingCodes = rows.map(row => row[0]).filter(code => code);

    // Filtere neue Codes
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
      console.log('Gutschein-Tracker: Alle Codes importiert:', newCodes.length);
    } else {
      console.log('Gutschein-Tracker: Keine neuen Codes zum Importieren');
    }
  } catch (error) {
    console.error('Gutschein-Tracker Import Fehler:', error);
  }
}

importAllCodes();