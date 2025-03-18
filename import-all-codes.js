import { google } from 'googleapis';
import fetch from 'node-fetch';

// Spreadsheet-Konfiguration
const SPREADSHEET_ID = '1xne5MVizpQFr9Wym8bF8GEg5kTfrFuk0d_gYTkgZRMg';
const SHEET_NAME = 'Coupon Usage';

// Google Sheets Authentifizierung
const auth = new google.auth.GoogleAuth({
  keyFile: '/Users/alex/Alex/01.LA VIESTA/Coding Nicht Löschen/service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// Shopify API-Konfiguration
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // Umgebungsvariable für Sicherheit
const SHOPIFY_SHOP_NAME = 'laviestaevents';
const API_VERSION = '2025-01';

async function fetchAllDiscountCodes() {
  const priceRulesUrl = `https://${SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/${API_VERSION}/price_rules.json`;
  const priceRulesResponse = await fetch(priceRulesUrl, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
  });

  if (!priceRulesResponse.ok) {
    throw new Error(`Fehler beim Abrufen der Price Rules: ${priceRulesResponse.status} ${await priceRulesResponse.text()}`);
  }

  const priceRulesData = await priceRulesResponse.json();
  const priceRules = priceRulesData.price_rules;

  const discountCodesPromises = priceRules.map(async (priceRule) => {
    const discountCodesUrl = `https://${SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/${API_VERSION}/price_rules/${priceRule.id}/discount_codes.json`;
    const discountCodesResponse = await fetch(discountCodesUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!discountCodesResponse.ok) {
      console.error(`Fehler bei Price Rule ${priceRule.id}: ${await discountCodesResponse.text()}`);
      return [];
    }

    const discountCodesData = await discountCodesResponse.json();
    return discountCodesData.discount_codes.map(dc => dc.code);
  });

  const discountCodesArrays = await Promise.all(discountCodesPromises);
  return discountCodesArrays.flat();
}

async function importAllCodes() {
  try {
    if (!SHOPIFY_ACCESS_TOKEN) {
      throw new Error('Shopify Access Token fehlt. Bitte setze die Umgebungsvariable SHOPIFY_ACCESS_TOKEN.');
    }
    const shopifyCodes = await fetchAllDiscountCodes();
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
    console.error('Import-Fehler:', error);
  }
}

importAllCodes();