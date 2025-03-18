import { Page, Card, DataTable } from '@shopify/polaris';

export default function ExclusionsPage() {
  const rows = [
    ['Gutscheincode', 'TEST123', 'Ausschließen'],
    ['Produkt', 'Event A', 'Ausschließen'],
  ];

  return (
    <Page title="Ausschlüsse verwalten">
      <Card>
        <DataTable
          columnContentTypes={['text', 'text', 'text']}
          headings={['Typ', 'Name', 'Aktion']}
          rows={rows}
        />
      </Card>
    </Page>
  );
}